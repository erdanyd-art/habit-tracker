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

-- Sprint 2: Public Profiles ------------------------------------------------

-- Two independent opt-in switches, both off by default. The whole public
-- page is gated on profiles.is_public; each habit is additionally gated on
-- its own is_public, so making your profile public doesn't retroactively
-- expose every habit you've ever tracked.
alter table profiles add column if not exists is_public boolean not null default false;
alter table habits add column if not exists is_public boolean not null default false;

-- Mirrors calculateStreak() in js/app.js exactly - keep the two in sync if
-- either changes. STABLE (not IMMUTABLE): result depends on p_today.
create or replace function public.habit_current_streak(p_history jsonb, p_today date default current_date)
returns int
language plpgsql
stable
as $$
declare
  v_set text[];
  v_cursor date := p_today;
  v_streak int := 0;
begin
  if p_history is null or jsonb_array_length(p_history) = 0 then
    return 0;
  end if;

  select array_agg(elem) into v_set from jsonb_array_elements_text(p_history) as elem;

  if not (v_cursor::text = any(v_set)) then
    v_cursor := v_cursor - 1;
  end if;

  while v_cursor::text = any(v_set) loop
    v_streak := v_streak + 1;
    v_cursor := v_cursor - 1;
  end loop;

  return v_streak;
end;
$$;

-- Mirrors computeLongestStreak() in js/achievements.js exactly - keep the
-- two in sync if either changes.
create or replace function public.habit_longest_streak(p_history jsonb)
returns int
language plpgsql
stable
as $$
declare
  v_dates date[];
  v_d date;
  v_prev date;
  v_current int := 0;
  v_longest int := 0;
begin
  if p_history is null or jsonb_array_length(p_history) = 0 then
    return 0;
  end if;

  select array_agg(distinct elem::date order by elem::date)
  into v_dates
  from jsonb_array_elements_text(p_history) as elem;

  foreach v_d in array v_dates loop
    if v_prev is not null and v_d - v_prev = 1 then
      v_current := v_current + 1;
    else
      v_current := 1;
    end if;
    v_longest := greatest(v_longest, v_current);
    v_prev := v_d;
  end loop;

  return v_longest;
end;
$$;

-- The ONLY path anonymous traffic has into another user's data. No new RLS
-- policies are added on profiles/habits/xp_transactions for this - security
-- definer bypasses RLS, so this function's own WHERE clauses ARE the
-- privacy boundary. It hands back derived numbers only (streaks, booleans,
-- counts) - the raw history jsonb array and raw xp_transactions rows never
-- leave the database. p_today defaults to the DB's current_date but the
-- caller (js/public-profile.js) passes its own local "today" so the streak
-- boundary matches the viewer's clock rather than an arbitrary server TZ.
create or replace function public.get_public_profile(p_username text, p_today date default current_date)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile profiles%rowtype;
  v_habits json;
  v_longest_streak int := 0;
  v_current_streak int := 0;
  v_total_completed int := 0;
  v_total_xp int := 0;
  v_completed_today int := 0;
  v_public_habit_count int := 0;
begin
  select * into v_profile from profiles where username = p_username;

  if not found then
    return json_build_object('status', 'not_found');
  end if;

  if not v_profile.is_public then
    return json_build_object('status', 'private');
  end if;

  with public_habits as (
    select h.id, h.name, h.history, h.created_at
    from habits h
    where h.user_id = v_profile.id and h.is_public = true
  ),
  habit_calc as (
    select
      id,
      name,
      created_at,
      (p_today::text in (select jsonb_array_elements_text(history))) as completed_today,
      public.habit_current_streak(history, p_today) as current_streak,
      public.habit_longest_streak(history) as longest_streak,
      jsonb_array_length(history) as completed_count
    from public_habits
  )
  select
    coalesce(json_agg(json_build_object(
      'name', name,
      'completed_today', completed_today,
      'current_streak', current_streak
    ) order by created_at), '[]'::json),
    count(*),
    coalesce(max(longest_streak), 0),
    coalesce(max(current_streak), 0),
    coalesce(sum(completed_count), 0),
    coalesce(sum(case when completed_today then 1 else 0 end), 0)
  into v_habits, v_public_habit_count, v_longest_streak, v_current_streak, v_total_completed, v_completed_today
  from habit_calc;

  select coalesce(sum(x.xp_amount), 0) into v_total_xp
  from xp_transactions x
  where x.user_id = v_profile.id
    and x.habit_id in (select id from habits where user_id = v_profile.id and is_public = true);

  return json_build_object(
    'status', 'ok',
    'id', v_profile.id,
    'display_name', v_profile.display_name,
    'username', v_profile.username,
    'bio', v_profile.bio,
    'avatar_url', v_profile.avatar_url,
    'joined_at', v_profile.joined_at,
    'current_streak', v_current_streak,
    'longest_streak', v_longest_streak,
    'total_xp', v_total_xp,
    'total_habits_completed', v_total_completed,
    'public_habit_count', v_public_habit_count,
    'completed_today_count', v_completed_today,
    'habits', v_habits
  );
end;
$$;

grant execute on function public.habit_current_streak(jsonb, date) to anon, authenticated;
grant execute on function public.habit_longest_streak(jsonb) to anon, authenticated;
grant execute on function public.get_public_profile(text, date) to anon, authenticated;

-- Sprint 2: User Discovery ---------------------------------------------

-- Search endpoint for anonymous/other-user traffic, alongside
-- get_public_profile (single exact-match lookup). This one does a partial
-- ilike match over username/display_name and returns a lightweight list -
-- same privacy boundary as get_public_profile (is_public = true, derived
-- numbers only, security definer bypasses RLS on purpose because this
-- function's WHERE clause IS the privacy boundary), just shaped for a
-- result list instead of a single full profile payload.
create or replace function public.search_public_profiles(p_query text, p_today date default current_date, p_limit int default 20)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_results json;
  v_trimmed text := trim(coalesce(p_query, ''));
begin
  if v_trimmed = '' then
    return '[]'::json;
  end if;

  with matched as (
    select id, username, display_name, avatar_url
    from profiles
    where is_public = true
      and username is not null
      and (username ilike '%' || v_trimmed || '%' or display_name ilike '%' || v_trimmed || '%')
    order by username
    limit p_limit
  ),
  streak_calc as (
    select
      m.id, m.username, m.display_name, m.avatar_url,
      coalesce(max(public.habit_current_streak(h.history, p_today)), 0) as current_streak
    from matched m
    left join habits h on h.user_id = m.id and h.is_public = true
    group by m.id, m.username, m.display_name, m.avatar_url
  )
  select coalesce(json_agg(json_build_object(
    'username', s.username,
    'display_name', s.display_name,
    'avatar_url', s.avatar_url,
    'current_streak', s.current_streak,
    'total_xp', coalesce((
      select sum(x.xp_amount) from xp_transactions x
      where x.user_id = s.id
        and x.habit_id in (select id from habits where user_id = s.id and is_public = true)
    ), 0)
  ) order by s.username), '[]'::json)
  into v_results
  from streak_calc s;

  return v_results;
end;
$$;

-- Suggestions shown when the Discover search box is empty. p_sort picks
-- which single column drives the ordering; simple CASE-based ordering is
-- enough for now (no compound ranking) per the Sprint 2 spec. Unknown/
-- unspecified p_sort values fall through to newest-first.
create or replace function public.suggested_public_profiles(p_sort text default 'newest', p_today date default current_date, p_limit int default 10)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_results json;
begin
  with base as (
    select id, username, display_name, avatar_url, joined_at
    from profiles
    where is_public = true and username is not null
  ),
  streak_calc as (
    select
      b.id, b.username, b.display_name, b.avatar_url, b.joined_at,
      coalesce(max(public.habit_current_streak(h.history, p_today)), 0) as current_streak
    from base b
    left join habits h on h.user_id = b.id and h.is_public = true
    group by b.id, b.username, b.display_name, b.avatar_url, b.joined_at
  ),
  xp_calc as (
    select
      sc.*,
      coalesce((
        select sum(x.xp_amount) from xp_transactions x
        where x.user_id = sc.id
          and x.habit_id in (select id from habits where user_id = sc.id and is_public = true)
      ), 0) as total_xp
    from streak_calc sc
  ),
  ordered as (
    select *
    from xp_calc
    order by
      (case when p_sort = 'streak' then current_streak end) desc nulls last,
      (case when p_sort = 'level' then total_xp end) desc nulls last,
      joined_at desc
    limit p_limit
  )
  select coalesce(json_agg(json_build_object(
    'username', username,
    'display_name', display_name,
    'avatar_url', avatar_url,
    'current_streak', current_streak,
    'total_xp', total_xp
  )), '[]'::json)
  into v_results
  from ordered;

  return v_results;
end;
$$;

grant execute on function public.search_public_profiles(text, date, int) to anon, authenticated;
grant execute on function public.suggested_public_profiles(text, date, int) to anon, authenticated;

-- Sprint 4: Friend Requests -------------------------------------------------

-- Every prior cross-user read (get_public_profile, search/suggested) works
-- by having a security definer function enforce its own privacy check and
-- hand back derived data. This extends the same one-chokepoint-per-concern
-- pattern to WRITES: deliberately no insert/update policy on either table
-- below, so the only way to create/change a row is through the reviewed
-- RPCs further down - RLS + function code is the entire security surface.
create table if not exists friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete cascade not null,
  receiver_id uuid references auth.users(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);

create unique index if not exists friend_requests_pending_pair_idx
  on friend_requests (sender_id, receiver_id) where status = 'pending';
create index if not exists friend_requests_receiver_idx on friend_requests (receiver_id, status);
create index if not exists friend_requests_sender_idx on friend_requests (sender_id, status);

alter table friend_requests enable row level security;

create policy "Users can view their own friend requests"
on friend_requests for select
using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Canonical ordering (user_a always the smaller uuid) means a pair can only
-- ever have one row, in either query direction - no reversed duplicates.
create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid references auth.users(id) on delete cascade not null,
  user_b uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create index if not exists friendships_user_a_idx on friendships (user_a);
create index if not exists friendships_user_b_idx on friendships (user_b);

alter table friendships enable row level security;

create policy "Users can view their own friendships"
on friendships for select
using (auth.uid() = user_a or auth.uid() = user_b);

-- If the receiver already has a pending outgoing request TO the sender
-- (mutual interest - both wanted to connect before either one responded),
-- this resolves both as an immediate friendship instead of leaving a
-- confusing pair of buttons in two different states.
create or replace function public.send_friend_request(p_receiver_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_lo uuid;
  v_hi uuid;
  v_reverse_id uuid;
  v_existing_id uuid;
  v_new_id uuid;
begin
  if v_me is null then
    return json_build_object('status', 'signed_out');
  end if;
  if v_me = p_receiver_id then
    return json_build_object('status', 'error', 'message', 'Cannot friend yourself.');
  end if;

  v_lo := least(v_me, p_receiver_id);
  v_hi := greatest(v_me, p_receiver_id);

  if exists(select 1 from friendships where user_a = v_lo and user_b = v_hi) then
    return json_build_object('status', 'friends');
  end if;

  select id into v_existing_id from friend_requests
  where sender_id = v_me and receiver_id = p_receiver_id and status = 'pending';

  if found then
    return json_build_object('status', 'request_sent', 'request_id', v_existing_id);
  end if;

  select id into v_reverse_id from friend_requests
  where sender_id = p_receiver_id and receiver_id = v_me and status = 'pending';

  if found then
    update friend_requests set status = 'accepted', updated_at = now() where id = v_reverse_id;
    insert into friendships (user_a, user_b) values (v_lo, v_hi) on conflict do nothing;
    return json_build_object('status', 'friends');
  end if;

  insert into friend_requests (sender_id, receiver_id) values (v_me, p_receiver_id) returning id into v_new_id;
  return json_build_object('status', 'request_sent', 'request_id', v_new_id);
end;
$$;

create or replace function public.respond_to_friend_request(p_request_id uuid, p_accept boolean)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_request friend_requests%rowtype;
  v_lo uuid;
  v_hi uuid;
begin
  if v_me is null then
    return json_build_object('status', 'signed_out');
  end if;

  select * into v_request from friend_requests where id = p_request_id;

  if not found or v_request.receiver_id <> v_me or v_request.status <> 'pending' then
    return json_build_object('status', 'error', 'message', 'Request not found.');
  end if;

  if p_accept then
    update friend_requests set status = 'accepted', updated_at = now() where id = p_request_id;
    v_lo := least(v_request.sender_id, v_request.receiver_id);
    v_hi := greatest(v_request.sender_id, v_request.receiver_id);
    insert into friendships (user_a, user_b) values (v_lo, v_hi) on conflict do nothing;
    return json_build_object('status', 'friends');
  else
    update friend_requests set status = 'rejected', updated_at = now() where id = p_request_id;
    return json_build_object('status', 'rejected');
  end if;
end;
$$;

create or replace function public.cancel_friend_request(p_request_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_request friend_requests%rowtype;
begin
  if v_me is null then
    return json_build_object('status', 'signed_out');
  end if;

  select * into v_request from friend_requests where id = p_request_id;

  if not found or v_request.sender_id <> v_me or v_request.status <> 'pending' then
    return json_build_object('status', 'error', 'message', 'Request not found.');
  end if;

  update friend_requests set status = 'cancelled', updated_at = now() where id = p_request_id;
  return json_build_object('status', 'cancelled');
end;
$$;

create or replace function public.remove_friend(p_other_user_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_lo uuid;
  v_hi uuid;
begin
  if v_me is null then
    return json_build_object('status', 'signed_out');
  end if;

  v_lo := least(v_me, p_other_user_id);
  v_hi := greatest(v_me, p_other_user_id);

  delete from friendships where user_a = v_lo and user_b = v_hi;
  return json_build_object('status', 'none');
end;
$$;

-- NOT security definer, unlike the functions above - doesn't need to be.
-- RLS already lets a signed-in user see any friend_requests/friendships row
-- they're a party to, which is exactly what's needed to determine their
-- relationship with one specific other user.
create or replace function public.get_relationship_status(p_other_user_id uuid)
returns json
language plpgsql
stable
as $$
declare
  v_me uuid := auth.uid();
  v_lo uuid;
  v_hi uuid;
  v_incoming_id uuid;
  v_outgoing_id uuid;
begin
  if v_me is null then
    return json_build_object('status', 'signed_out');
  end if;
  if v_me = p_other_user_id then
    return json_build_object('status', 'self');
  end if;

  v_lo := least(v_me, p_other_user_id);
  v_hi := greatest(v_me, p_other_user_id);

  if exists(select 1 from friendships where user_a = v_lo and user_b = v_hi) then
    return json_build_object('status', 'friends');
  end if;

  select id into v_incoming_id from friend_requests
  where sender_id = p_other_user_id and receiver_id = v_me and status = 'pending';

  if found then
    return json_build_object('status', 'request_received', 'request_id', v_incoming_id);
  end if;

  select id into v_outgoing_id from friend_requests
  where sender_id = v_me and receiver_id = p_other_user_id and status = 'pending';

  if found then
    return json_build_object('status', 'request_sent', 'request_id', v_outgoing_id);
  end if;

  return json_build_object('status', 'none');
end;
$$;

-- Security definer: needs to read the OTHER party's profiles/habits, which
-- plain RLS wouldn't allow (that's the whole point of RLS on those tables).
-- current_streak is deliberately computed from that user's PUBLIC habits
-- only (is_public = true) - same privacy boundary as get_public_profile, so
-- a friend request never surfaces more than the public profile already
-- would. Basic identity (avatar/name/username) is shown regardless of
-- profiles.is_public though - sending/receiving a request is a direct,
-- targeted interaction between two specific people, not anonymous
-- discovery, so it isn't gated by the "discoverable" flag the way Discover
-- search results are.
create or replace function public.list_friend_requests(p_today date default current_date)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_incoming json;
  v_outgoing json;
begin
  if v_me is null then
    return json_build_object('incoming', '[]'::json, 'outgoing', '[]'::json);
  end if;

  select coalesce(json_agg(json_build_object(
    'request_id', fr.id,
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'current_streak', coalesce((
      select max(public.habit_current_streak(h.history, p_today))
      from habits h where h.user_id = p.id and h.is_public = true
    ), 0)
  ) order by fr.created_at desc), '[]'::json)
  into v_incoming
  from friend_requests fr
  join profiles p on p.id = fr.sender_id
  where fr.receiver_id = v_me and fr.status = 'pending';

  select coalesce(json_agg(json_build_object(
    'request_id', fr.id,
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'current_streak', coalesce((
      select max(public.habit_current_streak(h.history, p_today))
      from habits h where h.user_id = p.id and h.is_public = true
    ), 0)
  ) order by fr.created_at desc), '[]'::json)
  into v_outgoing
  from friend_requests fr
  join profiles p on p.id = fr.receiver_id
  where fr.sender_id = v_me and fr.status = 'pending';

  return json_build_object('incoming', v_incoming, 'outgoing', v_outgoing);
end;
$$;

grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.get_relationship_status(uuid) to authenticated;
grant execute on function public.list_friend_requests(date) to authenticated;
