-- Row Level Security. Principles:
--  * Nothing is readable without being logged in (anon gets no table access at all).
--  * Tables with sensitive columns (profiles, runs) are OWNER-ONLY. Friends read a narrow VIEW instead,
--    because RLS is row-level and cannot hide individual columns.
--  * challenge_scores has no write policy: only security-definer functions (Phase 6) may write it.
--  * Helper functions are security definer with a pinned search_path so policies can look at other
--    tables without triggering recursive policy evaluation.

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  );
$$;

create function public.is_challenge_creator(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.challenges c where c.id = cid and c.creator_id = auth.uid());
$$;

create function public.is_joined_member(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.challenge_members m
    where m.challenge_id = cid and m.user_id = auth.uid() and m.status = 'joined'
  );
$$;

-- Creator, or anyone invited/joined: lets invitees see what they were invited to before accepting.
create function public.is_challenge_participant(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_challenge_creator(cid)
    or exists (
      select 1 from public.challenge_members m
      where m.challenge_id = cid and m.user_id = auth.uid() and m.status in ('invited', 'joined')
    );
$$;

-- Two users are "challenge mates" when both are joined in a common challenge (needed to show names
-- on a leaderboard even if the two are not friends).
create function public.shares_challenge(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.challenge_members me
    join public.challenge_members them on them.challenge_id = me.challenge_id
    where me.user_id = auth.uid() and me.status = 'joined'
      and them.user_id = other and them.status = 'joined'
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.runs enable row level security;
alter table public.run_points enable row level security;
alter table public.foods enable row level security;
alter table public.food_logs enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;
alter table public.challenge_scores enable row level security;
alter table public.push_tokens enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: owner only. (The brief said "owner and friends"; friends would then see weight, height and
-- calorie goal, so they get the limited profile_cards view instead.)
-- Rows are created by the signup trigger, so there is no insert policy.
-- ---------------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Safe, public-ish fields for me, my friends and my challenge mates.
create view public.profile_cards as
  select p.id, p.username, p.display_name, p.avatar_url
  from public.profiles p
  where p.id = auth.uid() or public.are_friends(auth.uid(), p.id) or public.shares_challenge(p.id);

-- Exact-username lookup for "add a friend". Returns at most one row, and nothing if that user has
-- blocked the caller. Not an open select, so usernames cannot be enumerated.
create function public.find_profile_by_username(p_username text)
returns table (id uuid, username text, display_name text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_url
  from public.profiles p
  where p.username = lower(p_username)
    and p.id <> auth.uid()
    and not exists (
      select 1 from public.friendships f
      where f.status = 'blocked' and f.requester_id = p.id and f.addressee_id = auth.uid()
    );
$$;

-- ---------------------------------------------------------------------------
-- friendships
-- ---------------------------------------------------------------------------
create policy friendships_select on public.friendships
  for select to authenticated
  using (
    auth.uid() in (requester_id, addressee_id)
    -- A blocked user must not be able to see (or learn about) the block.
    and (status <> 'blocked' or requester_id = auth.uid())
  );
create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending');
-- Only the addressee can accept, and only a pending request.
create policy friendships_accept on public.friendships
  for update to authenticated
  using (addressee_id = auth.uid() and status = 'pending')
  with check (addressee_id = auth.uid() and status = 'accepted');
create policy friendships_delete on public.friendships
  for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id) and (status <> 'blocked' or requester_id = auth.uid()));

-- The accept policy alone would let the addressee rewrite WHO the request is from.
create function public.friendships_lock_parties() returns trigger
language plpgsql as $$
begin
  if new.requester_id <> old.requester_id or new.addressee_id <> old.addressee_id then
    raise exception 'friendship parties are immutable';
  end if;
  return new;
end;
$$;
create trigger friendships_lock_parties before update on public.friendships
  for each row execute function public.friendships_lock_parties();

-- Blocking replaces any existing relationship with a one-way blocked row owned by the blocker.
create function public.block_user(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if target = auth.uid() then
    raise exception 'cannot block yourself';
  end if;
  delete from public.friendships f
  where (f.requester_id = auth.uid() and f.addressee_id = target)
     or (f.requester_id = target and f.addressee_id = auth.uid());
  insert into public.friendships (requester_id, addressee_id, status)
  values (auth.uid(), target, 'blocked');
end;
$$;

-- ---------------------------------------------------------------------------
-- runs / run_points: owner only. Friends get route_polyline_public through friend_runs.
-- ---------------------------------------------------------------------------
create policy runs_owner on public.runs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy run_points_owner on public.run_points
  for all to authenticated
  using (exists (select 1 from public.runs r where r.id = run_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.runs r where r.id = run_id and r.user_id = auth.uid()));

-- What a friend may see about my runs: no full route, no calories, no suspicious flag.
create view public.friend_runs as
  select r.id, r.user_id, r.started_at, r.ended_at, r.distance_m, r.moving_time_s,
         r.avg_pace_s_per_km, r.route_polyline_public
  from public.runs r
  where public.are_friends(auth.uid(), r.user_id);

-- ---------------------------------------------------------------------------
-- foods: shared foods readable by everyone, user foods only by their creator.
-- ---------------------------------------------------------------------------
create policy foods_select on public.foods
  for select to authenticated using (source <> 'user' or created_by = auth.uid());
create policy foods_insert on public.foods
  for insert to authenticated with check (source = 'user' and created_by = auth.uid());
create policy foods_update on public.foods
  for update to authenticated
  using (source = 'user' and created_by = auth.uid())
  with check (source = 'user' and created_by = auth.uid());
create policy foods_delete on public.foods
  for delete to authenticated using (source = 'user' and created_by = auth.uid());

-- food_logs: owner only, no exceptions (not even friends or challenge mates).
create policy food_logs_owner on public.food_logs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- challenges
-- ---------------------------------------------------------------------------
create policy challenges_select on public.challenges
  for select to authenticated using (public.is_challenge_participant(id));
create policy challenges_insert on public.challenges
  for insert to authenticated with check (creator_id = auth.uid() and status = 'draft');
-- The creator can edit only before it starts, and cannot activate it (a scheduled job does that).
create policy challenges_update on public.challenges
  for update to authenticated
  using (creator_id = auth.uid() and status = 'draft' and starts_at > now())
  with check (creator_id = auth.uid() and status = 'draft' and starts_at > now());
create policy challenges_delete on public.challenges
  for delete to authenticated using (creator_id = auth.uid() and status = 'draft');

-- challenge_members
create policy challenge_members_select on public.challenge_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_joined_member(challenge_id) or public.is_challenge_creator(challenge_id));
create policy challenge_members_insert on public.challenge_members
  for insert to authenticated
  with check (
    -- the creator invites accepted friends...
    (public.is_challenge_creator(challenge_id) and user_id <> auth.uid() and status = 'invited'
      and public.are_friends(auth.uid(), user_id))
    -- ...and adds themselves as the first joined member.
    or (public.is_challenge_creator(challenge_id) and user_id = auth.uid() and status = 'joined')
  );
-- An invited/joined user may accept, decline or leave; declined/left are final for the client.
create policy challenge_members_respond on public.challenge_members
  for update to authenticated
  using (user_id = auth.uid() and status in ('invited', 'joined'))
  with check (user_id = auth.uid() and status in ('joined', 'declined', 'left'));

create function public.challenge_members_stamp_joined() returns trigger
language plpgsql as $$
begin
  if new.status = 'joined' and (tg_op = 'INSERT' or old.status <> 'joined') then
    new.joined_at = now();
  end if;
  return new;
end;
$$;
create trigger challenge_members_stamp_joined before insert or update on public.challenge_members
  for each row execute function public.challenge_members_stamp_joined();

-- challenge_scores: members can read; NOBODY can write through the API.
create policy challenge_scores_select on public.challenge_scores
  for select to authenticated using (public.is_joined_member(challenge_id));
revoke insert, update, delete on public.challenge_scores from anon, authenticated;

-- push_tokens: owner only
create policy push_tokens_owner on public.push_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants for the views and RPC functions (logged-in users only)
-- ---------------------------------------------------------------------------
revoke all on public.profile_cards, public.friend_runs from anon;
grant select on public.profile_cards, public.friend_runs to authenticated;
revoke execute on function public.find_profile_by_username(text), public.block_user(uuid) from public, anon;
grant execute on function public.find_profile_by_username(text), public.block_user(uuid) to authenticated;
