-- #176: 0062's leaderboard_race_steps replaced 0059's day-by-day leaderboard_race (#145), which was
-- kept only so the build before it kept working while 0062 deployed. Nothing calls it now.
drop function if exists public.leaderboard_race(integer);
