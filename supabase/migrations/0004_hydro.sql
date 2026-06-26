-- 0004_hydro.sql
-- S500 water mitigation engine: visits, chambers, dry standards, readings, equipment, alerts.

create table if not exists resto_hydro_visits (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references resto_orgs(id) on delete cascade,
  claim_id     uuid not null references resto_claims(id) on delete cascade,
  structure_id uuid references resto_structures(id) on delete cascade,
  label        text not null,                 -- 'Job Setup', 'Visit 1', ...
  visit_date   date not null default current_date,
  status       text not null default 'in_progress' check (status in ('in_progress','complete')),
  task_state   jsonb not null default '[]',   -- checklist progress
  created_at   timestamptz not null default now()
);

create table if not exists resto_drying_chambers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references resto_orgs(id) on delete cascade,
  structure_id uuid not null references resto_structures(id) on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now()
);

create table if not exists resto_chamber_rooms (
  chamber_id uuid not null references resto_drying_chambers(id) on delete cascade,
  room_id    uuid not null references resto_rooms(id) on delete cascade,
  org_id     uuid not null references resto_orgs(id) on delete cascade,
  affected   boolean not null default true,
  primary key (chamber_id, room_id)
);

create table if not exists resto_dry_standards (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references resto_orgs(id) on delete cascade,
  chamber_id  uuid not null references resto_drying_chambers(id) on delete cascade,
  material    text not null,
  meter       text,
  goal_value  numeric,
  source_note text,
  captured_at timestamptz not null default now()
);

create table if not exists resto_readings (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references resto_orgs(id) on delete cascade,
  visit_id       uuid references resto_hydro_visits(id) on delete cascade,
  chamber_id     uuid references resto_drying_chambers(id) on delete cascade,
  reading_type   text not null check (reading_type in ('psychrometric','material_mc','dehu_outlet','exterior')),
  location_label text,                 -- numbered point tied to a physical spot
  temp_f         numeric,
  rh_pct         numeric,
  gpp            numeric,              -- computed client/server side and stored
  dew_point      numeric,
  material_mc    numeric,
  meter_media_id uuid references resto_media(id) on delete set null,
  captured_at    timestamptz not null default now(),
  lat            double precision,
  lng            double precision
);
create index if not exists resto_readings_visit_idx on resto_readings(visit_id);

create table if not exists resto_equipment (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references resto_orgs(id) on delete cascade,
  chamber_id          uuid not null references resto_drying_chambers(id) on delete cascade,
  type                text not null check (type in ('air_mover','dehumidifier','air_scrubber','heater')),
  make_model          text,
  serial              text,
  placed_at           timestamptz,
  removed_at          timestamptz,
  calculated_required int,
  actual_placed       int,
  created_at          timestamptz not null default now()
);

create table if not exists resto_alerts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references resto_orgs(id) on delete cascade,
  chamber_id uuid references resto_drying_chambers(id) on delete cascade,
  visit_id   uuid references resto_hydro_visits(id) on delete cascade,
  rule       text,
  severity   text default 'warning',
  message    text,
  status     text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now()
);

-- late FK from sketches.chamber_id
alter table resto_sketches
  add constraint resto_sketches_chamber_fk
  foreign key (chamber_id) references resto_drying_chambers(id) on delete set null;

alter table resto_hydro_visits    enable row level security;
alter table resto_drying_chambers enable row level security;
alter table resto_chamber_rooms   enable row level security;
alter table resto_dry_standards   enable row level security;
alter table resto_readings        enable row level security;
alter table resto_equipment       enable row level security;
alter table resto_alerts          enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'resto_hydro_visits','resto_drying_chambers','resto_chamber_rooms',
    'resto_dry_standards','resto_readings','resto_equipment','resto_alerts'
  ]
  loop
    execute format(
      'create policy %1$s_all on %1$s for all using (org_id in (select resto_user_org_ids())) with check (org_id in (select resto_user_org_ids()));',
      t
    );
  end loop;
end $$;
