-- SecureQuiz Supabase schema
-- Run this in Supabase SQL editor

create extension if not exists pgcrypto;

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  config jsonb not null default '{}'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_name text,
  student_id text,
  email text,
  device text,
  auto_submit boolean not null default false,
  tab_switches integer not null default 0,
  fullscreen_exits integer not null default 0,
  screenshot_attempts integer not null default 0,
  suspicious_events jsonb not null default '[]'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  score_correct integer not null default 0,
  score_total integer not null default 0,
  score_text text,
  review_token text,
  submitted_at_iso text,
  created_at timestamptz not null default now()
);

-- If submissions table already existed from an older version,
-- backfill all expected columns used by the current app.
alter table public.submissions add column if not exists quiz_id uuid;
alter table public.submissions add column if not exists student_name text;
alter table public.submissions add column if not exists student_id text;
alter table public.submissions add column if not exists email text;
alter table public.submissions add column if not exists device text;
alter table public.submissions add column if not exists auto_submit boolean;
alter table public.submissions add column if not exists tab_switches integer;
alter table public.submissions add column if not exists fullscreen_exits integer;
alter table public.submissions add column if not exists screenshot_attempts integer;
alter table public.submissions add column if not exists suspicious_events jsonb;
alter table public.submissions add column if not exists answers jsonb;
alter table public.submissions add column if not exists score_correct integer;
alter table public.submissions add column if not exists score_total integer;
alter table public.submissions add column if not exists score_text text;
alter table public.submissions add column if not exists review_token text;
alter table public.submissions add column if not exists submitted_at_iso text;
alter table public.submissions add column if not exists created_at timestamptz;

alter table public.submissions
  alter column auto_submit set default false,
  alter column tab_switches set default 0,
  alter column fullscreen_exits set default 0,
  alter column screenshot_attempts set default 0,
  alter column suspicious_events set default '[]'::jsonb,
  alter column answers set default '[]'::jsonb,
  alter column score_correct set default 0,
  alter column score_total set default 0,
  alter column created_at set default now();

update public.submissions
set
  auto_submit = coalesce(auto_submit, false),
  tab_switches = coalesce(tab_switches, 0),
  fullscreen_exits = coalesce(fullscreen_exits, 0),
  screenshot_attempts = coalesce(screenshot_attempts, 0),
  suspicious_events = coalesce(suspicious_events, '[]'::jsonb),
  answers = coalesce(answers, '[]'::jsonb),
  score_correct = coalesce(score_correct, 0),
  score_total = coalesce(score_total, 0),
  created_at = coalesce(created_at, now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'submissions_quiz_id_fkey'
      and conrelid = 'public.submissions'::regclass
  ) then
    alter table public.submissions
      add constraint submissions_quiz_id_fkey
      foreign key (quiz_id) references public.quizzes(id) on delete cascade;
  end if;
end $$;

create index if not exists idx_submissions_quiz_id on public.submissions(quiz_id);
create index if not exists idx_submissions_created_at on public.submissions(created_at desc);

alter table public.quizzes enable row level security;
alter table public.submissions enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert on table public.quizzes to anon, authenticated;
grant select, insert on table public.submissions to anon, authenticated;

-- Basic policies for browser-based public access (quick start)
-- Tighten these for production if you add auth.
do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'quizzes_select_all' and tablename = 'quizzes'
  ) then
    create policy quizzes_select_all on public.quizzes for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'quizzes_insert_all' and tablename = 'quizzes'
  ) then
    create policy quizzes_insert_all on public.quizzes for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'submissions_select_all' and tablename = 'submissions'
  ) then
    create policy submissions_select_all on public.submissions for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'submissions_insert_all' and tablename = 'submissions'
  ) then
    create policy submissions_insert_all on public.submissions for insert with check (true);
  end if;
end $$;
