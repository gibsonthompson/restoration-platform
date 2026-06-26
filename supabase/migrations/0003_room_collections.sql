-- 0003_room_collections.sql
-- The four room collections: media, notes, contents, sketches. Plus claim-level docs/shares.

create table if not exists resto_media (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references resto_orgs(id) on delete cascade,
  room_id       uuid references resto_rooms(id) on delete cascade,
  claim_id      uuid references resto_claims(id) on delete cascade,
  type          text not null check (type in ('photo','video')),
  storage_path  text not null,
  captured_at   timestamptz,
  lat           double precision,
  lng           double precision,
  exif          jsonb,
  caption       text,
  is_pre_existing_damage boolean not null default false,
  tags          text[],
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists resto_media_room_idx on resto_media(room_id);

create table if not exists resto_notes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references resto_orgs(id) on delete cascade,
  claim_id    uuid references resto_claims(id) on delete cascade,
  room_id     uuid references resto_rooms(id) on delete cascade,   -- null = claim-level general note
  author_id   uuid references auth.users(id),
  body        text not null default '',
  template_id text,
  created_at  timestamptz not null default now()
);
create index if not exists resto_notes_room_idx on resto_notes(room_id);

create table if not exists resto_contents_items (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references resto_orgs(id) on delete cascade,
  room_id       uuid not null references resto_rooms(id) on delete cascade,
  media_id      uuid references resto_media(id) on delete set null,
  description   text,
  brand         text,
  model         text,
  serial        text,
  quantity      int default 1,
  condition     text,
  disposition   text check (disposition in ('restorable','non_restorable','disposed')),
  pre_existing_damage_media_id uuid references resto_media(id) on delete set null,
  replacement_cost numeric,
  acv           numeric,
  created_at    timestamptz not null default now()
);
create index if not exists resto_contents_room_idx on resto_contents_items(room_id);

create table if not exists resto_sketches (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references resto_orgs(id) on delete cascade,
  room_id       uuid references resto_rooms(id) on delete cascade,
  chamber_id    uuid,  -- fk added in hydro migration
  type          text not null check (type in ('moisture_map','floor_plan','room_sketch')),
  canvas_json   jsonb not null default '{}',   -- vector scene: walls, wet areas, equipment, reading pins
  thumbnail_path text,
  author_id     uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists resto_sketches_room_idx on resto_sketches(room_id);

alter table resto_media          enable row level security;
alter table resto_notes          enable row level security;
alter table resto_contents_items enable row level security;
alter table resto_sketches       enable row level security;

create policy resto_media_all on resto_media for all
  using (org_id in (select resto_user_org_ids())) with check (org_id in (select resto_user_org_ids()));
create policy resto_notes_all on resto_notes for all
  using (org_id in (select resto_user_org_ids())) with check (org_id in (select resto_user_org_ids()));
create policy resto_contents_all on resto_contents_items for all
  using (org_id in (select resto_user_org_ids())) with check (org_id in (select resto_user_org_ids()));
create policy resto_sketches_all on resto_sketches for all
  using (org_id in (select resto_user_org_ids())) with check (org_id in (select resto_user_org_ids()));
