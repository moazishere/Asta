-- Core schema. Row Level Security lives in 0002_rls.sql so each concern stays reviewable on its own.

-- Shared trigger: keep updated_at honest without trusting the client.
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user. Created by the signup trigger below, completed by onboarding.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username = lower(username) and username ~ '^[a-z0-9_]{3,20}$'),
  display_name text,
  avatar_url text,
  height_cm numeric(5, 1) check (height_cm between 80 and 260),
  weight_kg numeric(5, 1) check (weight_kg between 20 and 400),
  birth_year int check (birth_year between 1900 and 2100),
  sex text check (sex in ('male', 'female')),
  daily_kcal_goal int check (daily_kcal_goal between 800 and 10000),
  timezone text not null default 'UTC',
  -- Null until the user finishes onboarding; the app routes on this.
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- A profile row appears the moment someone signs up. The username is a temporary placeholder that
-- onboarding replaces. search_path is pinned because this function is security definer.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    'user_' || substr(replace(new.id::text, '-', ''), 1, 8),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- friendships
-- ---------------------------------------------------------------------------
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
-- One row per unordered pair, so A->B and B->A can never both exist.
create unique index friendships_pair_key on public.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_status_idx on public.friendships (addressee_id, status);
create index friendships_requester_idx on public.friendships (requester_id);
create trigger friendships_updated_at before update on public.friendships
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- runs + run_points
-- ---------------------------------------------------------------------------
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  distance_m numeric(10, 1) not null check (distance_m >= 0),
  moving_time_s int not null check (moving_time_s >= 0),
  avg_pace_s_per_km int check (avg_pace_s_per_km > 0),
  kcal_est int check (kcal_est >= 0),
  -- Full route (encoded polyline). Owner only.
  route_polyline text,
  -- Same route minus the first and last ~200 m so friends cannot learn where someone lives.
  route_polyline_public text,
  suspicious boolean not null default false,
  created_at timestamptz not null default now(),
  check (ended_at >= started_at)
);
create index runs_user_started_idx on public.runs (user_id, started_at desc);

-- Server-side anti-cheat: the client flags runs above ~20 km/h average, but a modified client could
-- send suspicious=false, so the database decides too. A flag can be set here but never cleared.
create function public.flag_suspicious_run() returns trigger
language plpgsql as $$
begin
  if new.moving_time_s > 0 and (new.distance_m / new.moving_time_s) > (20.0 / 3.6) then
    new.suspicious = true;
  end if;
  if tg_op = 'UPDATE' and old.suspicious then
    new.suspicious = true;
  end if;
  return new;
end;
$$;
create trigger runs_flag_suspicious before insert or update on public.runs
  for each row execute function public.flag_suspicious_run();

create table public.run_points (
  run_id uuid not null references public.runs (id) on delete cascade,
  seq int not null,
  recorded_at timestamptz not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  altitude_m real,
  accuracy_m real,
  speed_mps real,
  primary key (run_id, seq)
);
-- The primary key already gives us (run_id, seq); keep an explicit name for documentation.
create index run_points_run_seq_idx on public.run_points (run_id, seq);

-- ---------------------------------------------------------------------------
-- foods + food_logs
-- ---------------------------------------------------------------------------
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_ar text,
  barcode text,
  kcal_per_100g numeric(7, 2) not null check (kcal_per_100g >= 0),
  protein_g numeric(6, 2) not null default 0 check (protein_g >= 0),
  carbs_g numeric(6, 2) not null default 0 check (carbs_g >= 0),
  fat_g numeric(6, 2) not null default 0 check (fat_g >= 0),
  serving_g numeric(7, 2) check (serving_g > 0),
  source text not null check (source in ('custom', 'off', 'user')),
  created_by uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- User foods must have an owner; shared foods (custom/off) are seeded by migrations and have none.
  check ((source = 'user') = (created_by is not null))
);
create index foods_name_idx on public.foods (lower(name));
create index foods_barcode_idx on public.foods (barcode) where barcode is not null;

create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  log_date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id uuid references public.foods (id) on delete set null,
  custom_name text,
  grams numeric(7, 2) check (grams > 0),
  -- Macros are a snapshot taken at log time, so editing/deleting a food never rewrites history.
  kcal numeric(7, 2) not null check (kcal >= 0),
  protein_g numeric(6, 2) not null default 0,
  carbs_g numeric(6, 2) not null default 0,
  fat_g numeric(6, 2) not null default 0,
  created_at timestamptz not null default now(),
  check (food_id is not null or custom_name is not null)
);
create index food_logs_user_date_idx on public.food_logs (user_id, log_date);

-- ---------------------------------------------------------------------------
-- challenges
-- ---------------------------------------------------------------------------
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  type text not null check (type in ('distance', 'run_count', 'kcal_streak')),
  target_value numeric(10, 1) not null check (target_value > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'ended')),
  winner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index challenges_creator_idx on public.challenges (creator_id);

create table public.challenge_members (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined', 'declined', 'left')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (challenge_id, user_id)
);
create index challenge_members_user_idx on public.challenge_members (user_id, status);

-- Written ONLY by security-definer functions (Phase 6); no client policy exists for this table.
create table public.challenge_scores (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  value numeric(10, 1) not null default 0,
  -- When the user first reached the current value. Used for tie-breaks; recomputes must preserve it.
  reached_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index challenge_scores_leaderboard_idx on public.challenge_scores (challenge_id, value desc);

-- ---------------------------------------------------------------------------
-- push_tokens
-- ---------------------------------------------------------------------------
create table public.push_tokens (
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  primary key (user_id, token)
);
