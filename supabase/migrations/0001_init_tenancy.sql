-- 0001_init_tenancy.sql
-- Multi-tenant foundation: orgs, members, settings, RLS helpers, policies.
-- Design notes:
--  * Every domain table carries org_id (denormalized) so RLS is a fast single
--    predicate, never a deep join. This is intentional.
--  * Membership lookups use SECURITY DEFINER helper functions to avoid RLS
--    recursion on resto_org_members.
--  * Org creation is done via resto_create_org() to dodge the chicken-and-egg
--    (you cannot insert a member for an org you are not yet a member of).

create extension if not exists "pgcrypto";

create table if not exists resto_orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  plan        text not null default 'trial',
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

do $$ begin
  create type resto_role as enum ('owner','manager','lead_tech','tech');
exception when duplicate_object then null; end $$;

create table if not exists resto_org_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references resto_orgs(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        resto_role not null default 'tech',
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

create table if not exists resto_org_settings (
  org_id            uuid primary key references resto_orgs(id) on delete cascade,
  default_task_list jsonb not null default '[]',
  note_templates    jsonb not null default '[]',
  material_library  jsonb not null default '[]',
  equipment_catalog jsonb not null default '[]',
  report_branding   jsonb not null default '{}',
  updated_at        timestamptz not null default now()
);

-- org_ids the current user belongs to (bypasses RLS to prevent recursion)
create or replace function resto_user_org_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select org_id from resto_org_members where user_id = auth.uid()
$$;

-- true if current user holds one of the given roles in target org
create or replace function resto_has_role(target_org uuid, roles resto_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from resto_org_members
    where org_id = target_org and user_id = auth.uid() and role = any(roles)
  )
$$;

-- atomic org creation + owner membership + settings row
create or replace function resto_create_org(org_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_org uuid;
begin
  insert into resto_orgs (name) values (org_name) returning id into new_org;
  insert into resto_org_members (org_id, user_id, role) values (new_org, auth.uid(), 'owner');
  insert into resto_org_settings (org_id) values (new_org);
  return new_org;
end;
$$;

alter table resto_orgs        enable row level security;
alter table resto_org_members enable row level security;
alter table resto_org_settings enable row level security;

create policy resto_orgs_select on resto_orgs for select
  using (id in (select resto_user_org_ids()));
create policy resto_orgs_update on resto_orgs for update
  using (resto_has_role(id, array['owner']::resto_role[]));

create policy resto_members_select on resto_org_members for select
  using (org_id in (select resto_user_org_ids()));
create policy resto_members_write on resto_org_members for all
  using (resto_has_role(org_id, array['owner','manager']::resto_role[]))
  with check (resto_has_role(org_id, array['owner','manager']::resto_role[]));

create policy resto_settings_select on resto_org_settings for select
  using (org_id in (select resto_user_org_ids()));
create policy resto_settings_write on resto_org_settings for all
  using (resto_has_role(org_id, array['owner','manager']::resto_role[]))
  with check (resto_has_role(org_id, array['owner','manager']::resto_role[]));
