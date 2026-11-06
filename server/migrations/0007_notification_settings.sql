-- Per-user switches for each kind of push notification. A user with no row gets the defaults (all on).
create table public.notification_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  friend_requests boolean not null default true,
  challenge_invites boolean not null default true,
  leaderboard_passed boolean not null default true,
  challenge_ended boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger notification_settings_updated_at before update on public.notification_settings
  for each row execute function public.set_updated_at();

alter table public.notification_settings enable row level security;
create policy notification_settings_owner on public.notification_settings
  for all to app_user using (user_id = app.uid()) with check (user_id = app.uid());
grant select, insert, update, delete on public.notification_settings to app_user;

-- One device token belongs to exactly one account at a time: when someone signs in with another
-- account on the same phone, the token moves instead of notifying the previous user.
create unique index push_tokens_token_key on public.push_tokens (token);
