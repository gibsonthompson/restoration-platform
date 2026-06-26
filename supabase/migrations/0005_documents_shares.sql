-- 0005_documents_shares.sql
-- Generated reports + uploads, e-signatures, and the cross-org "Network" share seam.

create table if not exists resto_documents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references resto_orgs(id) on delete cascade,
  claim_id     uuid not null references resto_claims(id) on delete cascade,
  type         text not null check (type in
                 ('preliminary_report','drying_report','schedule_of_loss','full_export','upload','esx')),
  storage_path text,
  title        text,
  status       text not null default 'draft' check (status in
                 ('draft','missing_info','needs_signature','signed','final')),
  generated_at timestamptz,
  signed_at    timestamptz,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index if not exists resto_documents_claim_idx on resto_documents(claim_id);

create table if not exists resto_signatures (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references resto_orgs(id) on delete cascade,
  document_id     uuid not null references resto_documents(id) on delete cascade,
  signer_name     text,
  signer_role     text,
  signature_path  text,
  signed_at       timestamptz not null default now(),
  ip              text
);

-- The one controlled cross-tenant seam. A claim can be shared to an outside
-- user or org. NOTE (critical, intentionally stubbed for the foundation):
-- granting the shared party SELECT on the underlying claim/structure/room/media
-- rows requires extending those tables' RLS to also allow access when a matching
-- row exists here. That cross-org read policy is a TODO and should be added
-- deliberately, with care, when the Network feature is built. For now this table
-- only records intent and is managed by the owning org.
create table if not exists resto_claim_shares (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references resto_orgs(id) on delete cascade,  -- owning org
  claim_id            uuid not null references resto_claims(id) on delete cascade,
  shared_with_user_id uuid references auth.users(id),
  shared_with_org_id  uuid references resto_orgs(id),
  role                text not null default 'viewer' check (role in ('viewer','estimator')),
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now()
);

alter table resto_documents     enable row level security;
alter table resto_signatures    enable row level security;
alter table resto_claim_shares  enable row level security;

create policy resto_documents_all on resto_documents for all
  using (org_id in (select resto_user_org_ids())) with check (org_id in (select resto_user_org_ids()));
create policy resto_signatures_all on resto_signatures for all
  using (org_id in (select resto_user_org_ids())) with check (org_id in (select resto_user_org_ids()));
create policy resto_claim_shares_all on resto_claim_shares for all
  using (org_id in (select resto_user_org_ids())) with check (org_id in (select resto_user_org_ids()));
