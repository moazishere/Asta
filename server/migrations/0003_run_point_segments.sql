-- A run can be paused and resumed. Points belong to a "segment" (0, 1, 2, ... one per resume), and
-- distance is only measured BETWEEN points of the same segment, so the straight line across a pause
-- (where the runner may have travelled anywhere) never counts as distance.
alter table public.run_points add column segment int not null default 0 check (segment >= 0);
