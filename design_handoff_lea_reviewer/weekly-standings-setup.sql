-- =====================================================================
-- Weekly standings — one-time setup.
-- Run this whole file in Supabase → SQL Editor → New query → Run.
-- Safe to run twice: every statement checks before it acts.
--
-- WHAT THIS DOES
-- Progress records WHICH questions you have mastered but never WHEN, so
-- "who mastered the most this week" cannot be answered from it. This adds
-- a dated record of each first mastery, and a query that counts a window.
--
-- WHAT IT CANNOT DO
-- Questions already mastered have no date and never will — that was never
-- written down. The weekly tab therefore starts empty and fills from the
-- moment this runs. The page says so, rather than showing an empty week as
-- though it were a real result.
-- =====================================================================

-- 1. A dated row per question, the first time it is mastered -----------
create table if not exists public.mastery_events (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  subject_id  text not null,
  module_id   text not null,
  q_index     int  not null,
  mastered_at timestamptz not null default now()
);

-- "Mastered means right once", so answering the same question again must
-- not count again. The unique index is what enforces that — the app inserts
-- with ignoreDuplicates and relies on this, so it is not optional.
create unique index if not exists mastery_events_once
  on public.mastery_events (user_id, subject_id, module_id, q_index);

-- Counting a window means scanning by date; this keeps that cheap.
create index if not exists mastery_events_by_date
  on public.mastery_events (mastered_at desc);

-- 2. Who may write ------------------------------------------------------
-- Only your own rows, and only inserts. Nothing edits or deletes history.
alter table public.mastery_events enable row level security;

drop policy if exists "insert own mastery events" on public.mastery_events;
create policy "insert own mastery events"
  on public.mastery_events for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "read own mastery events" on public.mastery_events;
create policy "read own mastery events"
  on public.mastery_events for select
  to authenticated
  using (auth.uid() = user_id);

-- 3. The standings query ------------------------------------------------
-- security definer so it can count everyone's rows without exposing the
-- table itself: the function returns names and totals, never who mastered
-- which question.
create or replace function public.get_weekly_leaderboard(p_days int default 7)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    -- The earliest record anywhere, so the page can say what it is counting
    -- from instead of presenting a short first week as a full one.
    'since', (select min(mastered_at) from public.mastery_events),
    'window_days', p_days,
    'rows', coalesce((
      select json_agg(r)
      from (
        select pr.username,
               count(*)::int as mastered
        from public.mastery_events e
        join public.profiles pr on pr.id = e.user_id
        where e.mastered_at >= now() - make_interval(days => p_days)
          and pr.username is not null
        group by pr.username
        order by count(*) desc, pr.username asc
        limit 50
      ) r
    ), '[]'::json)
  );
$$;

grant execute on function public.get_weekly_leaderboard(int) to authenticated;

-- Done. The weekly tab starts counting from now.
