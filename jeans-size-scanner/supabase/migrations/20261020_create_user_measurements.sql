create table public.user_measurements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  waist_cm numeric(5, 1) not null check (waist_cm between 40 and 200),
  hip_cm numeric(5, 1) not null check (hip_cm between 50 and 220),
  inseam_cm numeric(5, 1) not null check (inseam_cm between 40 and 120),
  height_cm numeric(5, 1) check (height_cm between 100 and 230),
  thigh_cm numeric(5, 1) check (thigh_cm between 25 and 100),
  created_at timestamptz not null default now()
);

alter table public.user_measurements enable row level security;

revoke all on public.user_measurements from anon;
grant select, insert, update, delete on public.user_measurements to authenticated;

create policy "Users can read their own measurements"
  on public.user_measurements for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own measurements"
  on public.user_measurements for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can edit their own measurements"
  on public.user_measurements for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own measurements"
  on public.user_measurements for delete to authenticated
  using ((select auth.uid()) = user_id);
