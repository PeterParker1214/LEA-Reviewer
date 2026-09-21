-- =====================================================================
-- Who has read what in chat — one-time setup.
-- Run this whole file in Supabase → SQL Editor → New query → Run.
-- Safe to run twice: every statement checks before it acts.
-- Needs chat-setup.sql to have been run first.
-- =====================================================================

-- 1. One row per person per conversation ------------------------------
-- `thread` is 'lobby', or the other person's id as text for a private
-- thread. Text rather than a nullable uuid so the primary key is plain:
-- a null cannot be part of one.
create table if not exists public.chat_reads (
  user_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  thread        text not null,
  last_read_id  bigint not null,
  updated_at    timestamptz not null default now(),
  primary key (user_id, thread)
);

alter table public.chat_reads enable row level security;

-- 2. Who sees these ---------------------------------------------------
-- Everyone signed in, because that is what a read receipt is: the lobby
-- shows how many people have caught up, and a private thread shows the
-- other person that you read theirs.
drop policy if exists "read receipts are visible" on public.chat_reads;
create policy "read receipts are visible"
  on public.chat_reads for select
  to authenticated
  using (true);

-- 3. You only ever mark your own place --------------------------------
drop policy if exists "mark your own place" on public.chat_reads;
create policy "mark your own place"
  on public.chat_reads for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "move your own place" on public.chat_reads;
create policy "move your own place"
  on public.chat_reads for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 4. Live updates -----------------------------------------------------
-- So a "Seen" appears while the sender is still looking at the thread.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'chat_reads'
  ) then
    alter publication supabase_realtime add table public.chat_reads;
  end if;
end $$;

-- Done. Open chat.html: your own last message says who has seen it.
