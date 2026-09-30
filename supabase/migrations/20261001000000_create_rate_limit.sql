-- Shared rate limiter and throttle — leaf `5.k.vi.zo`.

create table if not exists public.rate_limit (
  bucket_key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket_key, window_start)
);

alter table public.rate_limit enable row level security;
revoke all on public.rate_limit from anon, authenticated;
grant all on public.rate_limit to service_role;

create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
as $$ declare
  v_now timestamptz := now();
  v_window_start timestamptz := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.rate_limit (bucket_key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (bucket_key, window_start)
  do update set count = rate_limit.count + 1
  returning count into v_count;

  if v_count > p_max then
    return false;
  end if;
  return true;
end;
 $$;

revoke execute on function public.check_rate_limit(text, integer, integer) from anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
