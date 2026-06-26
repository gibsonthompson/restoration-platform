-- 0002_claims_structures_rooms.sql
-- Core hierarchy: claim -> structure -> room. org_id on every table.

-- Standard tenant RLS macro applied per table below (all-access for org members).
-- Finer per-role gating (e.g. only owner/manager can delete claims) can be
-- layered later; for the foundation, any org member can CRUD their org's rows.

create table if not exists resto_claims (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references resto_orgs(id) on delete cascade,
  policyholder_name       text,
  policyholder_email      text,
  policyholder_phone      text,
  address                 text,
  lat                     double precision,
  lng                     double precision,
  carrier_identifier      text,
  contractor_identifier   text,
  assignment_identifier   text,
  date_of_loss            date,
  date_created            date default current_date,
  insurance_company       text,
  broker_agent            text,
  project_manager         text,
  adjuster                text,
  policy_number           text,
  type_of_loss            text check (type_of_loss in ('water','fire','mold','other')),
  category_of_water       int  check (category_of_water between 1 and 3),
  class_of_water          int  check (class_of_water between 1 and 4),
  cat_code                text,
  status                  text not null default 'open',
  created_by              uuid references auth.users(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists resto_claims_org_idx on resto_claims(org_id);

create table if not exists resto_structures (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references resto_orgs(id) on delete cascade,
  claim_id      uuid not null references resto_claims(id) on delete cascade,
  name          text not null,
  cover_media_id uuid,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists resto_structures_claim_idx on resto_structures(claim_id);

create table if not exists resto_rooms (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references resto_orgs(id) on delete cascade,
  structure_id  uuid not null references resto_structures(id) on delete cascade,
  name          text not null,
  cover_media_id uuid,
  sort_order    int not null default 0,
  length_ft     numeric,
  width_ft      numeric,
  height_ft     numeric default 8,
  flooring_type text,
  created_at    timestamptz not null default now()
);
create index if not exists resto_rooms_structure_idx on resto_rooms(structure_id);

alter table resto_claims     enable row level security;
alter table resto_structures enable row level security;
alter table resto_rooms      enable row level security;

create policy resto_claims_all on resto_claims for all
  using (org_id in (select resto_user_org_ids()))
  with check (org_id in (select resto_user_org_ids()));
create policy resto_structures_all on resto_structures for all
  using (org_id in (select resto_user_org_ids()))
  with check (org_id in (select resto_user_org_ids()));
create policy resto_rooms_all on resto_rooms for all
  using (org_id in (select resto_user_org_ids()))
  with check (org_id in (select resto_user_org_ids()));
