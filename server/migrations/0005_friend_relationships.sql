-- Everyone I have a friendship row with, with the other person's SAFE profile fields (never weight,
-- height, goals). A security-definer function is needed because pending requesters and users I have
-- blocked are not "friends", so the profile_cards view (self + friends + challenge mates) cannot show
-- them. It still only ever returns rows involving the caller, and a block is invisible to the
-- blocked person (the row is hidden unless the caller is the blocker).
create function public.my_relationships()
returns table (
  friendship_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  status text,
  direction text,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select f.id, p.id, p.username, p.display_name, p.avatar_url, f.status,
         case when f.requester_id = app.uid() then 'outgoing' else 'incoming' end,
         f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = app.uid() then f.addressee_id else f.requester_id end
  where app.uid() in (f.requester_id, f.addressee_id)
    and (f.status <> 'blocked' or f.requester_id = app.uid());
$$;

revoke execute on function public.my_relationships() from public;
grant execute on function public.my_relationships() to app_user;
