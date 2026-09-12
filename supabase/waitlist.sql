-- Run once in your Supabase project's SQL Editor before enabling the form.
-- Names and emails are private. The website has no public read endpoint.
begin;

create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  email text not null unique check (
    char_length(email) <= 254 and email = lower(btrim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  created_at timestamptz not null default now(),
  source text not null default 'lyrion-website'
);

alter table public.waitlist_signups enable row level security;
revoke all on table public.waitlist_signups from public, anon, authenticated;
grant insert, select on table public.waitlist_signups to service_role;
-- No anon/authenticated policies: only the server's secret key can insert.
-- A UNIQUE email plus ON CONFLICT DO NOTHING keeps retries idempotent.

commit;
