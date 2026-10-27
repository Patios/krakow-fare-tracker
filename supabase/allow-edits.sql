-- Optional. supabase/schema.sql already includes this and can be run again.
-- Dashboard > SQL Editor > New query.

alter table public.fare_routes
  add column if not exists outbound_depart time,
  add column if not exists outbound_arrive time,
  add column if not exists return_depart time,
  add column if not exists return_arrive time;

grant update on public.fare_routes to authenticated;
grant update on public.fare_prices to authenticated;

do $$
begin
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
