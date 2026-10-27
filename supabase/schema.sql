-- Safe to run again. Existing tables, columns and policies are left in place.
-- Run this once in the same Supabase project as Copy Paster:
-- Dashboard > SQL Editor > New query.
-- Then, in Authentication > URL configuration, allow:
--   http://localhost:43123/
--   https://patios.github.io/krakow-fare-tracker/

create table if not exists public.fare_routes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  destination_iata text not null check (destination_iata ~ '^[A-Z]{3}$'),
  outbound_from date not null,
  outbound_to date,
  return_date date,
  outbound_depart time,
  outbound_arrive time,
  return_depart time,
  return_arrive time,
  created_at timestamptz not null default now()
);

create table if not exists public.fare_prices (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  route_id uuid not null references public.fare_routes(id) on delete cascade,
  airline text not null check (airline in ('ryanair', 'wizzair')),
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null default 'PLN' check (currency = 'PLN'),
  checked_on date not null,
  outbound_depart time,
  outbound_arrive time,
  return_depart time,
  return_arrive time,
  created_at timestamptz not null default now()
);

alter table public.fare_prices
  add column if not exists auto_flights text;

alter table public.fare_routes
  add column if not exists auto_refresh boolean not null default false;

alter table public.fare_routes
  add column if not exists outbound_depart time,
  add column if not exists outbound_arrive time,
  add column if not exists return_depart time,
  add column if not exists return_arrive time;

create index if not exists fare_routes_user_id_idx on public.fare_routes (user_id);
create index if not exists fare_prices_user_id_idx on public.fare_prices (user_id);
create index if not exists fare_prices_route_id_idx on public.fare_prices (route_id);

alter table public.fare_routes enable row level security;
alter table public.fare_prices enable row level security;

grant select, insert, update, delete on public.fare_routes to authenticated;
grant select, insert, update, delete on public.fare_prices to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'fare_routes' and policyname = 'Users can read their own fare routes'
  ) then
    create policy "Users can read their own fare routes"
      on public.fare_routes for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'fare_routes' and policyname = 'Users can add their own fare routes'
  ) then
    create policy "Users can add their own fare routes"
      on public.fare_routes for insert to authenticated
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'fare_routes' and policyname = 'Users can delete their own fare routes'
  ) then
    create policy "Users can delete their own fare routes"
      on public.fare_routes for delete to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'fare_routes' and policyname = 'Users can update their own fare routes'
  ) then
    create policy "Users can update their own fare routes"
      on public.fare_routes for update to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'fare_prices' and policyname = 'Users can read their own fare prices'
  ) then
    create policy "Users can read their own fare prices"
      on public.fare_prices for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'fare_prices' and policyname = 'Users can add their own fare prices'
  ) then
    create policy "Users can add their own fare prices"
      on public.fare_prices for insert to authenticated
      with check (
        (select auth.uid()) = user_id
        and exists (
          select 1 from public.fare_routes
          where id = route_id and user_id = (select auth.uid())
        )
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'fare_prices' and policyname = 'Users can delete their own fare prices'
  ) then
    create policy "Users can delete their own fare prices"
      on public.fare_prices for delete to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'fare_prices' and policyname = 'Users can update their own fare prices'
  ) then
    create policy "Users can update their own fare prices"
      on public.fare_prices for update to authenticated
      using ((select auth.uid()) = user_id)
      with check (
        (select auth.uid()) = user_id
        and exists (
          select 1 from public.fare_routes
          where id = route_id and user_id = (select auth.uid())
        )
      );
  end if;
end $$;
