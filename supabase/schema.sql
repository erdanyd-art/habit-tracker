-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

create table if not exists habits (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  history jsonb not null default '[]'::jsonb,
  created_at date not null default current_date,
  updated_at timestamptz not null default now()
);

alter table habits enable row level security;

create policy "Users can manage their own habits"
on habits
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Sprint 5: XP & Level system --------------------------------------------

alter table habits
  add column if not exists difficulty text not null default 'medium'
  check (difficulty in ('easy', 'medium', 'hard', 'extreme'));

-- One row per (user, habit, day) a completion was ever earned. XP amount is
-- locked in at grant time, so later editing a habit's difficulty never
-- rewrites history. Deliberately has no foreign key to habits.id: deleting
-- a habit must NOT delete its earned XP (lifetime XP survives deletion).
create table if not exists xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  habit_id text not null,
  completed_date date not null,
  xp_amount integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, habit_id, completed_date)
);

alter table xp_transactions enable row level security;

create policy "Users can manage their own XP transactions"
on xp_transactions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
