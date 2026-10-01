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
set search_path = public, pg_temp
as $$ declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
begin
  if p_window_seconds is null or p_window_seconds < 1 or p_max is null or p_max < 0 then
    raise exception 'invalid rate limit arguments';
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limit (bucket_key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (bucket_key, window_start)
  do update set count = rate_limit.count + 1
  returning count into v_count;

  -- Housekeeping: about 1% of calls drop counters older than two days, so the
  -- table stays small without a scheduled job.
  if random() < 0.01 then
    delete from public.rate_limit where window_start < v_now - interval '2 days';
  end if;

  if v_count > p_max then
    return false;
  end if;
  return true;
end;
 $$;

-- PUBLIC holds EXECUTE by default, and anon/authenticated inherit it: revoking
-- from those two roles alone leaves the function callable over PostgREST.
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
