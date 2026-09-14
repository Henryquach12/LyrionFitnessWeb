-- Read-only metadata check for Supabase SQL Editor. No signup records are read.
-- Inspect an existing email/signup table before running waitlist.sql.
select
  n.nspname as table_schema,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  has_table_privilege('service_role', c.oid, 'SELECT') as server_can_select,
  has_table_privilege('service_role', c.oid, 'INSERT') as server_can_insert,
  has_table_privilege('anon', c.oid, 'SELECT') as anonymous_select_grant,
  has_table_privilege('anon', c.oid, 'INSERT') as anonymous_insert_grant,
  (
    select jsonb_agg(jsonb_build_object(
      'name', a.attname,
      'type', format_type(a.atttypid, a.atttypmod),
      'required', a.attnotnull
    ) order by a.attnum)
    from pg_attribute a
    where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  ) as columns,
  exists (
    select 1
    from pg_index i
    join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
    where i.indrelid = c.oid and i.indisunique and i.indisvalid
      and i.indnkeyatts = 1 and i.indpred is null and a.attname = 'email'
  ) as unique_email
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and n.nspname not in ('pg_catalog', 'information_schema', 'auth', 'storage', 'realtime', 'supabase_migrations', 'vault', 'extensions')
  and n.nspname not like 'pg_%'
  and (
    c.relname ilike '%waitlist%'
    or c.relname ilike '%signup%'
    or exists (
      select 1 from pg_attribute a
      where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        and a.attname in ('email', 'email_address')
    )
  )
order by n.nspname, c.relname;
