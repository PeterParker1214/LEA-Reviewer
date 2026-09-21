-- =====================================================================
-- Duels — one-time setup.
-- Run this whole file in Supabase → SQL Editor → New query → Run.
-- Safe to run twice: every statement checks before it acts.
-- =====================================================================

-- 1. One row per duel ------------------------------------------------
-- `questions` is the ten the two of you both answer, fixed when the
-- challenge is made: [{"s":"building-laws","m":"03","i":12}, ...].
-- A duel is finished when both scores are in; there is no separate flag
-- to fall out of step with them.
create table if not exists public.duels (
  id                uuid primary key default gen_random_uuid(),
  challenger        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  opponent          uuid not null references public.profiles(id) on delete cascade,
  subject           text not null,
  questions         jsonb not null,
  challenger_score  int,
  opponent_score    int,
  status            text not null default 'pending',
  created_at        timestamptz not null default now(),
  constraint duel_two_people   check (challenger <> opponent),
  constraint duel_status_known check (status in ('pending', 'accepted', 'declined')),
  constraint duel_has_questions check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 50),
  constraint duel_challenger_score_real check (challenger_score is null or challenger_score between 0 and jsonb_array_length(questions)),
  constraint duel_opponent_score_real   check (opponent_score   is null or opponent_score   between 0 and jsonb_array_length(questions))
);

create index if not exists duels_challenger_idx on public.duels (challenger, created_at desc);
create index if not exists duels_opponent_idx   on public.duels (opponent, created_at desc);

alter table public.duels enable row level security;

-- 2. Who sees a duel --------------------------------------------------
drop policy if exists "read your own duels" on public.duels;
create policy "read your own duels"
  on public.duels for select
  to authenticated
  using (auth.uid() in (challenger, opponent));

-- 3. Who may start one ------------------------------------------------
-- You challenge as yourself, and no more than 20 in an hour.
drop policy if exists "challenge as yourself" on public.duels;
create policy "challenge as yourself"
  on public.duels for insert
  to authenticated
  with check (
    challenger = auth.uid()
    and challenger_score is null and opponent_score is null
    and status = 'pending'
    and (
      select count(*) from public.duels d
      where d.challenger = auth.uid() and d.created_at > now() - interval '1 hour'
    ) < 20
  );

-- 4. Who may change one -----------------------------------------------
-- The policy lets both players write; the trigger below decides what
-- they may actually change. Without the trigger, either side could
-- rewrite the other's score.
drop policy if exists "either player may answer" on public.duels;
create policy "either player may answer"
  on public.duels for update
  to authenticated
  using (auth.uid() in (challenger, opponent))
  with check (auth.uid() in (challenger, opponent));

create or replace function public.duel_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The terms are fixed the moment the challenge is made.
  if new.challenger is distinct from old.challenger
     or new.opponent is distinct from old.opponent
     or new.subject is distinct from old.subject
     or new.questions is distinct from old.questions
     or new.created_at is distinct from old.created_at then
    raise exception 'A duel''s terms cannot change once it is made.';
  end if;

  -- Only the person challenged answers the invitation, and only once.
  if new.status is distinct from old.status then
    if auth.uid() <> old.opponent
       or old.status <> 'pending'
       or new.status not in ('accepted', 'declined') then
      raise exception 'Only the person challenged may accept or decline, and only once.';
    end if;
  end if;

  -- A score is written once, by the player who earned it, and is never
  -- cleared. ponytail: this stops a player rewriting a result or wiping
  -- the other side's, but nothing here can tell whether the ten questions
  -- were really answered — a duel is for fun, not for the leaderboard.
  if new.challenger_score is distinct from old.challenger_score then
    if auth.uid() <> old.challenger or old.challenger_score is not null or new.challenger_score is null then
      raise exception 'A score is written once, by the player who earned it.';
    end if;
  end if;
  if new.opponent_score is distinct from old.opponent_score then
    if auth.uid() <> old.opponent or old.opponent_score is not null or new.opponent_score is null then
      raise exception 'A score is written once, by the player who earned it.';
    end if;
  end if;

  -- A declined duel is over.
  if old.status = 'declined' and (new.challenger_score is distinct from old.challenger_score
                                  or new.opponent_score is distinct from old.opponent_score) then
    raise exception 'That duel was declined.';
  end if;

  return new;
end $$;

drop trigger if exists duel_guard on public.duels;
create trigger duel_guard before update on public.duels
  for each row execute function public.duel_guard();

-- No delete policy: a duel stays as it was played.

-- 5. Live updates -----------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'duels'
  ) then
    alter publication supabase_realtime add table public.duels;
  end if;
end $$;

-- Done. Open duel.html, or challenge someone from their member page.
