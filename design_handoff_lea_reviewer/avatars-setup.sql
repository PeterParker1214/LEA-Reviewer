-- =====================================================================
-- Profile pictures (screen 5e) — one-time setup.
-- Run this whole file in Supabase → SQL Editor → New query → Run.
-- Safe to run twice: every statement checks before it acts.
-- =====================================================================

-- 1. Somewhere to remember each person's picture ----------------------
alter table public.profiles
  add column if not exists avatar_url text;

-- 2. A public bucket to keep the files in -----------------------------
-- Public so the leaderboard can show faces without signing every URL.
-- Nothing private goes in here — only pictures people chose to upload.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- 3. Who may do what with those files ---------------------------------
-- Anyone may look. Only you may write to your own folder, which is
-- named after your user id — so nobody can overwrite anyone else's.
drop policy if exists "avatars are publicly readable" on storage.objects;
create policy "avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "own avatar upload" on storage.objects;
create policy "own avatar upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own avatar update" on storage.objects;
create policy "own avatar update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own avatar delete" on storage.objects;
create policy "own avatar delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. Let everyone read each other's avatar_url ------------------------
-- The leaderboard needs to read other people's picture URLs. If your
-- profiles table already allows public select, this changes nothing.
drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable"
  on public.profiles for select
  using (true);

-- Done. Reload the app and the Picture buttons on Profile turn on by
-- themselves — the page checks for the bucket rather than assuming it.
