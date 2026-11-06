-- Shared foods (the seeded starter set, later Open Food Facts) are unique by name so the seed can be
-- re-run safely after editing server/data/foods.json. A user's own foods are unique per user, so
-- people cannot end up with accidental duplicates, but two users may each have a "Mom's kibbeh".
create unique index foods_shared_name_key on public.foods (lower(name)) where source <> 'user';
create unique index foods_user_name_key on public.foods (created_by, lower(name)) where source = 'user';
