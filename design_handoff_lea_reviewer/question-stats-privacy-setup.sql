-- =====================================================================
-- Question stats privacy: one-time setup.
-- Run this whole file in Supabase → SQL Editor → New query → Run.
-- Safe to run twice: every statement checks before it acts.
--
-- WHAT THIS FIXES
-- question_answers holds every answer every reader has given, with their
-- user_id. Its read rule let anyone, signed in or not, read every row, and
-- profiles are public, so anyone could match a reader's whole answer
-- history (what they picked, right or wrong) to their username.
--
-- The quiz only ever needs the totals for one question: how many picked
-- each choice and how many were right ("62% of reviewers got this one
-- right"). This adds a function that returns exactly that and nothing about
-- who, then limits reading the table itself to your own rows.
--
-- ORDER DOES NOT MATTER
-- run.html asks question_stats first and falls back to reading the table,
-- so the line keeps working before and after this runs.
-- =====================================================================

-- 1. Totals for one question, per choice, without user ids --------------
create or replace function public.question_stats(ref text)
returns table (selected int, n bigint, correct bigint)
language sql
stable
security definer
set search_path = public
as $$
  select qa.selected::int, count(*), count(*) filter (where qa.is_correct)
  from public.question_answers qa
  where qa.question_ref = ref
  group by qa.selected;
$$;

revoke all on function public.question_stats(text) from public;
grant execute on function public.question_stats(text) to anon, authenticated;

-- Totals are looked up by question, so keep that cheap.
create index if not exists question_answers_by_ref
  on public.question_answers (question_ref);

-- 2. Reading the table itself: your own rows only -----------------------
alter table public.question_answers enable row level security;

-- Drop whatever read rule exists now (its name is not known here), then
-- add the narrow one. Insert rules are left exactly as they are.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'question_answers' and cmd in ('SELECT', 'ALL')
  loop
    -- An ALL rule also covers inserts; the block after this loop puts
    -- an insert rule back if none is left.
    execute format('drop policy %I on public.question_answers', p.policyname);
  end loop;
end $$;

drop policy if exists question_answers_read_own on public.question_answers;
create policy question_answers_read_own on public.question_answers
  for select to authenticated
  using (user_id = auth.uid());

-- If the old rule was an ALL rule, inserts went with it. This puts back
-- "you may add your own answers", which is all the quiz does.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'question_answers' and cmd = 'INSERT'
  ) then
    execute 'create policy question_answers_insert_own on public.question_answers
             for insert to authenticated with check (user_id = auth.uid())';
  end if;
end $$;

-- 3. Check -------------------------------------------------------------
-- Signed out, this should now return 0:
--   select count(*) from public.question_answers;   (run as anon)
-- And this should return a few rows of totals:
--   select * from public.question_stats('structural/masangkay-quiz1/0');
