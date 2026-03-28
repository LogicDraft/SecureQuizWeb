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
