-- Challenge scoring. Everything here is SECURITY DEFINER and is the ONLY thing that writes
-- challenge_scores (clients have no write access to it at all). Scores are derived from runs and food
-- logs, never supplied by anyone.
--
-- Units: distance challenges score in METRES (target_value is metres too), run_count challenges in runs,
-- kcal_streak challenges in days.
--
-- Rules (documented assumptions):
--  * A run counts if it STARTED inside [starts_at, ends_at). Suspicious runs never count.
--  * run_count only counts runs of at least 1000 m.
--  * Runs count from the challenge start even if the member joined later (the score is always a pure
--    function of the member's data and the window, so a recompute can never disagree with the triggers).
--  * kcal_streak counts local calendar days (in the member's own profiles.timezone) whose logged
--    calories are within +/-10% of daily_kcal_goal. Only COMPLETED days count (a day still in progress
--    does not, so the score never flickers and the leaderboard does not hint at today's intake).
--  * Tie-break: whoever reached the current value first (earlier reached_at) ranks higher.

create index challenges_status_idx on public.challenges (status, starts_at, ends_at);

-- A member's value in a challenge, computed from scratch.
create function public.challenge_member_value(p_challenge uuid, p_user uuid)
returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.challenges%rowtype;
  tz text;
  goal int;
  v numeric := 0;
begin
  select * into c from public.challenges where id = p_challenge;
  if not found then
    return 0;
  end if;

  if c.type = 'distance' then
    select coalesce(sum(r.distance_m), 0) into v
    from public.runs r
    where r.user_id = p_user and not r.suspicious
      and r.started_at >= c.starts_at and r.started_at < c.ends_at;

  elsif c.type = 'run_count' then
    select count(*) into v
    from public.runs r
    where r.user_id = p_user and not r.suspicious and r.distance_m >= 1000
      and r.started_at >= c.starts_at and r.started_at < c.ends_at;

  else -- kcal_streak
    select case when exists (select 1 from pg_timezone_names n where n.name = p.timezone)
                then p.timezone else 'UTC' end,
           p.daily_kcal_goal
      into tz, goal
    from public.profiles p where p.id = p_user;
    if goal is null or goal <= 0 then
      return 0;
    end if;

    select count(*) into v
    from (
      select l.log_date
      from public.food_logs l
      where l.user_id = p_user
        -- the window, as calendar days in the member's own time zone
        and l.log_date >= (c.starts_at at time zone tz)::date
        and l.log_date <= ((c.ends_at - interval '1 microsecond') at time zone tz)::date
        -- completed days only (everything counts once the challenge itself is over)
        and (now() >= c.ends_at or l.log_date < (now() at time zone tz)::date)
      group by l.log_date
      having abs(sum(l.kcal) - goal) <= goal * 0.10
    ) days;
  end if;

  return v;
end;
$$;

-- Recomputes ONE member's score row. reached_at only moves when the value changes, so recomputing an
-- unchanged value never reshuffles a tie.
create function public.refresh_member_score(p_challenge uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.challenges%rowtype;
  v numeric;
begin
  select * into c from public.challenges where id = p_challenge;
  if not found then
    return;
  end if;
  if not exists (
    select 1 from public.challenge_members m
    where m.challenge_id = p_challenge and m.user_id = p_user and m.status = 'joined'
  ) then
    return;
  end if;

  v := public.challenge_member_value(p_challenge, p_user);
  begin
    insert into public.challenge_scores as s (challenge_id, user_id, value, reached_at, updated_at)
    values (p_challenge, p_user, v, case when v = 0 then c.starts_at else now() end, now())
    on conflict (challenge_id, user_id) do update
      set value = excluded.value,
          reached_at = case when s.value is distinct from excluded.value then now() else s.reached_at end,
          updated_at = case when s.value is distinct from excluded.value then now() else s.updated_at end;
  exception when foreign_key_violation then
    -- The member is being deleted (cascade) while one of their rows triggered this: nothing to score.
    null;
  end;
end;
$$;

-- The source of truth: rebuilds every joined member's score from scratch and drops rows of people who
-- are no longer joined. Safe to run at any time.
create function public.recompute_challenge_scores(p_challenge uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  m record;
begin
  delete from public.challenge_scores s
  where s.challenge_id = p_challenge
    and not exists (
      select 1 from public.challenge_members cm
      where cm.challenge_id = p_challenge and cm.user_id = s.user_id and cm.status = 'joined'
    );
  for m in
    select cm.user_id from public.challenge_members cm
    where cm.challenge_id = p_challenge and cm.status = 'joined'
  loop
    perform public.refresh_member_score(p_challenge, m.user_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers: keep scores current, for ACTIVE challenges only.
-- ---------------------------------------------------------------------------

create function public.on_run_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := case tg_op when 'DELETE' then old.user_id else new.user_id end;
  cid uuid;
begin
  for cid in
    select c.id
    from public.challenges c
    join public.challenge_members m
      on m.challenge_id = c.id and m.user_id = uid and m.status = 'joined'
    where c.status = 'active' and c.type in ('distance', 'run_count')
  loop
    perform public.refresh_member_score(cid, uid);
  end loop;
  return null;
end;
$$;
create trigger runs_challenge_scores
  after insert or delete or update of distance_m, suspicious, started_at on public.runs
  for each row execute function public.on_run_changed();

create function public.on_food_log_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := case tg_op when 'DELETE' then old.user_id else new.user_id end;
  cid uuid;
begin
  for cid in
    select c.id
    from public.challenges c
    join public.challenge_members m
      on m.challenge_id = c.id and m.user_id = uid and m.status = 'joined'
    where c.status = 'active' and c.type = 'kcal_streak'
  loop
    perform public.refresh_member_score(cid, uid);
  end loop;
  return null;
end;
$$;
create trigger food_logs_challenge_scores
  after insert or delete or update of kcal, log_date on public.food_logs
  for each row execute function public.on_food_log_changed();

-- Changing the calorie goal or time zone changes which days qualify.
create function public.on_profile_goal_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
begin
  for cid in
    select c.id
    from public.challenges c
    join public.challenge_members m
      on m.challenge_id = c.id and m.user_id = new.id and m.status = 'joined'
    where c.status = 'active' and c.type = 'kcal_streak'
  loop
    perform public.refresh_member_score(cid, new.id);
  end loop;
  return null;
end;
$$;
create trigger profiles_challenge_scores
  after update of daily_kcal_goal, timezone on public.profiles
  for each row execute function public.on_profile_goal_changed();

-- Joining an active challenge (a late joiner) scores them straight away; leaving or declining removes
-- them from the leaderboard.
create function public.on_challenge_member_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'joined' then
    if exists (select 1 from public.challenges c where c.id = new.challenge_id and c.status = 'active') then
      perform public.refresh_member_score(new.challenge_id, new.user_id);
    end if;
  elsif new.status in ('left', 'declined') then
    delete from public.challenge_scores s
    where s.challenge_id = new.challenge_id and s.user_id = new.user_id;
  end if;
  return null;
end;
$$;
create trigger challenge_members_scores
  after insert or update of status on public.challenge_members
  for each row execute function public.on_challenge_member_changed();

-- ---------------------------------------------------------------------------
-- The scheduler's single entry point: draft -> active at starts_at, active -> ended at ends_at (with
-- a final recompute and the winner recorded). Idempotent, so overlapping callers do no harm.
-- Returns what changed so the server can notify the members.
-- ---------------------------------------------------------------------------
create function public.advance_challenges()
returns table (challenge_id uuid, change text)
language plpgsql security definer set search_path = '' as $$
declare
  ids uuid[];
  cid uuid;
begin
  with moved as (
    update public.challenges set status = 'active'
    where status = 'draft' and starts_at <= now()
    returning id
  )
  select coalesce(array_agg(id), '{}') into ids from moved;
  foreach cid in array ids loop
    perform public.recompute_challenge_scores(cid); -- everyone starts on the board
    challenge_id := cid;
    change := 'activated';
    return next;
  end loop;

  with moved as (
    update public.challenges set status = 'ended'
    where status = 'active' and ends_at <= now()
    returning id
  )
  select coalesce(array_agg(id), '{}') into ids from moved;
  foreach cid in array ids loop
    perform public.recompute_challenge_scores(cid); -- final numbers, then crown the winner
    update public.challenges c
      set winner_id = (
        select s.user_id from public.challenge_scores s
        where s.challenge_id = cid and s.value > 0
        order by s.value desc, s.reached_at asc, s.user_id
        limit 1
      )
    where c.id = cid;
    challenge_id := cid;
    change := 'ended';
    return next;
  end loop;
end;
$$;

-- Only the server's own (owner) connection may call these directly; app_user gets nothing.
revoke execute on function
  public.challenge_member_value(uuid, uuid),
  public.refresh_member_score(uuid, uuid),
  public.recompute_challenge_scores(uuid),
  public.advance_challenges()
from public;
