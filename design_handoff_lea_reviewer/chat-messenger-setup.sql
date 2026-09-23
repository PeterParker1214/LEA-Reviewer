-- Additive upgrade after chat-setup.sql and chat-reads-setup.sql.
-- Existing messages and image attachments are preserved. Run as one transaction.
begin;
alter table public.chat_messages
  add column if not exists reply_to bigint references public.chat_messages(id) on delete set null,
  add column if not exists mentions uuid[] not null default '{}',
  add column if not exists mention_everyone boolean not null default false;
create index if not exists chat_reply_idx on public.chat_messages(reply_to) where reply_to is not null;

create or replace function public.validate_chat_message() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare parent public.chat_messages; target uuid;
begin
  if cardinality(new.mentions) > 30 then raise exception 'Too many mentions'; end if;
  if new.mention_everyone and new.to_user is not null then raise exception 'Everyone is only available in Community'; end if;
  foreach target in array new.mentions loop
    if target is null or not exists(select 1 from public.profiles where id=target) then raise exception 'Unknown mention'; end if;
    if new.to_user is not null and target not in (new.user_id,new.to_user) then raise exception 'Mention must belong to this conversation'; end if;
  end loop;
  if new.reply_to is not null then
    select * into parent from public.chat_messages where id=new.reply_to;
    if not found then raise exception 'Original message is unavailable'; end if;
    if not ((new.to_user is null and parent.to_user is null) or
      (new.to_user is not null and parent.to_user is not null and
       ((parent.user_id=new.user_id and parent.to_user=new.to_user) or
        (parent.user_id=new.to_user and parent.to_user=new.user_id)))) then
      raise exception 'Reply must belong to the same conversation';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.validate_chat_message() from public;
drop trigger if exists validate_chat_message on public.chat_messages;
create trigger validate_chat_message before insert on public.chat_messages for each row execute function public.validate_chat_message();

create table if not exists public.chat_reactions (
  message_id bigint not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji text not null check(emoji in ('👍','❤️','😂','😮','😢','🙏')),
  primary key(message_id,user_id)
);
alter table public.chat_reactions enable row level security;
grant select,insert,update,delete on public.chat_reactions to authenticated;
revoke all on public.chat_reactions from anon;
drop policy if exists "read accessible reactions" on public.chat_reactions;
create policy "read accessible reactions" on public.chat_reactions for select to authenticated
  using(exists(select 1 from public.chat_messages m where m.id=message_id));
drop policy if exists "add own reaction" on public.chat_reactions;
create policy "add own reaction" on public.chat_reactions for insert to authenticated
  with check(user_id=(select auth.uid()) and exists(select 1 from public.chat_messages m where m.id=message_id));
drop policy if exists "change own reaction" on public.chat_reactions;
create policy "change own reaction" on public.chat_reactions for update to authenticated
  using(user_id=(select auth.uid()))
  with check(user_id=(select auth.uid()) and exists(select 1 from public.chat_messages m where m.id=message_id));
drop policy if exists "remove own reaction" on public.chat_reactions;
create policy "remove own reaction" on public.chat_reactions for delete to authenticated using(user_id=(select auth.uid()));

-- Ephemeral typing: authenticated identities, no text, and private-thread RLS.
create table if not exists public.chat_typing (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  thread text not null,
  typing boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(user_id,thread)
);
alter table public.chat_typing enable row level security;
grant select,insert,update on public.chat_typing to authenticated;
revoke all on public.chat_typing from anon;
create or replace function public.validate_chat_typing() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.thread <> 'lobby' and not exists(select 1 from public.profiles p where p.id::text=new.thread and p.id<>new.user_id) then
    raise exception 'Unknown conversation';
  end if;
  new.updated_at=clock_timestamp();
  return new;
end $$;
revoke all on function public.validate_chat_typing() from public;
drop trigger if exists validate_chat_typing on public.chat_typing;
create trigger validate_chat_typing before insert or update on public.chat_typing for each row execute function public.validate_chat_typing();
drop policy if exists "read conversation typing" on public.chat_typing;
create policy "read conversation typing" on public.chat_typing for select to authenticated
  using(thread='lobby' or user_id=(select auth.uid()) or thread=(select auth.uid())::text);
drop policy if exists "publish own typing" on public.chat_typing;
create policy "publish own typing" on public.chat_typing for insert to authenticated with check(user_id=(select auth.uid()));
drop policy if exists "refresh own typing" on public.chat_typing;
create policy "refresh own typing" on public.chat_typing for update to authenticated
  using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

-- Private receipts are visible only to the two participants.
drop policy if exists "read receipts are visible" on public.chat_reads;
create policy "read receipts are visible" on public.chat_reads for select to authenticated
  using(thread='lobby' or user_id=(select auth.uid()) or thread=(select auth.uid())::text);
create or replace function public.validate_chat_read() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists(select 1 from public.chat_messages m where m.id=new.last_read_id and
    ((new.thread='lobby' and m.to_user is null) or
     (m.to_user is not null and ((m.user_id=new.user_id and m.to_user::text=new.thread) or
       (m.to_user=new.user_id and m.user_id::text=new.thread))))) then
    raise exception 'Read marker must belong to this conversation';
  end if;
  if tg_op='UPDATE' then new.last_read_id=greatest(old.last_read_id,new.last_read_id); end if;
  new.updated_at=clock_timestamp();
  return new;
end $$;
revoke all on function public.validate_chat_read() from public;
drop trigger if exists validate_chat_read on public.chat_reads;
create trigger validate_chat_read before insert or update on public.chat_reads for each row execute function public.validate_chat_read();

-- Complete inbox counts, not counts from a truncated message page.
create or replace function public.chat_inbox()
returns table(peer uuid,last_id bigint,unread bigint)
language sql stable security invoker set search_path = '' as $$
  with messages as (
    select m.*,case when m.to_user is null then null when m.user_id=auth.uid() then m.to_user else m.user_id end as other
    from public.chat_messages m
    where m.to_user is null or m.user_id=auth.uid() or m.to_user=auth.uid()
  )
  select m.other,max(m.id),count(*) filter(where m.user_id<>auth.uid()
    and m.id>coalesce(r.last_read_id,0))
  from messages m left join public.chat_reads r on r.user_id=auth.uid() and r.thread=coalesce(m.other::text,'lobby')
  group by m.other;
$$;
revoke all on function public.chat_inbox() from public;
grant execute on function public.chat_inbox() to authenticated;
do $$ declare t text; begin
  foreach t in array array['chat_reactions','chat_typing'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;
commit;
