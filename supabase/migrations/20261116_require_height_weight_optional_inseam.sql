-- The test project has no saved rows. If rows are added before this migration,
-- fill their height and weight first; unknown values must not be invented.
alter table public.user_measurements
  add column weight_kg numeric(5, 1) not null check (weight_kg between 20 and 350),
  add column weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lb'));

alter table public.user_measurements
  alter column height_cm set not null,
  alter column inseam_cm drop not null;
