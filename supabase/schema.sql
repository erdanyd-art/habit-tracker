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

-- Sprint 1: User Profiles -------------------------------------------------

-- One row per authenticated user. Foundation for future social features
-- (Friends, Challenges, Circles, Public Profiles) - keep adding nullable
-- columns here as those land, rather than spinning up new tables, so a
-- profile is always a single row to fetch.
--
-- Only display_name, username, and bio are editable from the app. avatar_url
-- and joined_at are set once (from the Google identity / signup time) and
-- stay read-only from the client.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  username text unique,
  bio text,
  avatar_url text,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can view their own profile"
on profiles for select
using (auth.uid() = id);

create policy "Users can insert their own profile"
on profiles for insert
with check (auth.uid() = id);

create policy "Users can update their own profile"
on profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- Seeds a profile row the moment someone signs in for the first time, from
-- their Google identity, so the app never has to handle a signed-in user
-- with zero profile rows. security definer because auth.users isn't
-- otherwise readable/writable by the client-side role that fires this.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, joined_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    new.created_at
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
