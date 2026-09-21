-- =====================================================================
-- Chat (lobby + private messages) — one-time setup.
-- Run this whole file in Supabase → SQL Editor → New query → Run.
-- Safe to run twice: every statement checks before it acts.
-- =====================================================================

-- 1. One table for both kinds of message ------------------------------
-- to_user null  = posted to the lobby, everyone sees it.
-- to_user set   = a private message, only the two of you see it.
create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  to_user     uuid references public.profiles(id) on delete cascade,
  body        text,
  image_url   text,
  created_at  timestamptz not null default now(),
  constraint chat_has_content check (coalesce(btrim(body), '') <> '' or image_url is not null),
  constraint chat_body_length check (body is null or char_length(body) <= 1000),
  constraint chat_not_to_self check (to_user is null or to_user <> user_id)
);

create index if not exists chat_lobby_idx on public.chat_messages (created_at desc) where to_user is null;
create index if not exists chat_from_idx  on public.chat_messages (user_id, created_at desc);
create index if not exists chat_to_idx    on public.chat_messages (to_user, created_at desc);

alter table public.chat_messages enable row level security;

-- 2. Who may read what ------------------------------------------------
drop policy if exists "read lobby and own threads" on public.chat_messages;
create policy "read lobby and own threads"
  on public.chat_messages for select
  to authenticated
  using (to_user is null or to_user = auth.uid() or user_id = auth.uid());

-- 3. Who may post -----------------------------------------------------
-- You post as yourself, and no more than 10 messages in 10 seconds. The
-- limit lives here rather than in the page because the page is only a
-- suggestion — anyone can call the API directly.
drop policy if exists "post as yourself" on public.chat_messages;
create policy "post as yourself"
  on public.chat_messages for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      select count(*) from public.chat_messages m
      where m.user_id = auth.uid()
        and m.created_at > now() - interval '10 seconds'
    ) < 10
  );

-- 4. Who may delete ---------------------------------------------------
-- Your own message, always. Anything at all if you are an admin, so the
-- lobby can be moderated. Checked here, not in the page.
drop policy if exists "delete own or moderate" on public.chat_messages;
create policy "delete own or moderate"
  on public.chat_messages for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- No update policy: a sent message is not editable. Delete and resend.

-- 5. Live updates -----------------------------------------------------
-- Realtime still applies the policies above, so a subscriber is only sent
-- the rows they are allowed to read.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- 6. A bucket for pictures and GIFs -----------------------------------
-- 12 MB and image types only, enforced by the bucket itself. A still
-- picture is resized by the page to well under this before it is sent;
-- the headroom is for GIFs, which are sent as they arrive because
-- shrinking one would cost it its animation.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', true, 12582912,
        array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = 12582912,
      allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'];

drop policy if exists "chat images are publicly readable" on storage.objects;
create policy "chat images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'chat-images');

-- Your own folder, named after your user id, same as avatars.
drop policy if exists "own chat image upload" on storage.objects;
create policy "own chat image upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own chat image delete" on storage.objects;
create policy "own chat image delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Done. Open chat.html and the lobby is live.
