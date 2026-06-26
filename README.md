# Restoration Documentation Platform

Field documentation + claims platform for property restoration (water/fire/mold),
modeled on Encircle. Free-stack, PWA-first, multi-tenant from day one.
Reliable Solutions is tenant #1; the platform is standalone and productizable later.

See `Restoration_Documentation_Platform_Project_Doc.md` (the spec) for the full
research, data model, module specs, and report requirements. This repo is the
Phase-1 foundation scaffold: tenancy + auth + the claim/structure/room spine.

## Stack
- **frontend/** React + TypeScript + Vite PWA, Tailwind, Supabase JS, Dexie (offline).
- **supabase/** SQL migrations (all `resto_*` tables + multi-tenant RLS).
- **api/** Minimal Express backend for the few server-side-only jobs:
  Claude calls (scope, OCR), PDF report generation, ESX export.

## Architecture decisions (the critical ones)
- **Multi-tenancy via RLS.** Every table carries `org_id`; policies are a single
  fast predicate (`org_id in (select resto_user_org_ids())`), never a deep join.
  Membership helpers are SECURITY DEFINER to avoid RLS recursion. Org creation
  goes through `resto_create_org()` to dodge the chicken-and-egg.
- **CRUD goes frontend -> Supabase directly.** The Express backend exists ONLY
  for server-side-only concerns (LLM key, PDF, ESX). Keeps the system simple.
- **Offline sync is explicit, not delegated to the service worker.** Field data
  integrity must not depend on opaque SW cache behavior. See `syncQueue.ts`.
- **iOS PWA is the known risk.** No Background Sync, possible storage eviction.
  Mitigate with aggressive foreground sync + upload-as-you-go. Escape hatch:
  the codebase is Capacitor/Expo-wrappable later without a rewrite. Stress-test
  on real iPhones before building deep.

## Setup

### 1. Database (Supabase)
Create a Supabase project (or reuse the shared one; tables are `resto_`-prefixed
and isolated). Run the migrations in order:

```
supabase/migrations/0001_init_tenancy.sql
0002_claims_structures_rooms.sql
0003_room_collections.sql
0004_hydro.sql
0005_documents_shares.sql
0006_storage.sql
```

Paste each into the Supabase SQL editor in order, or use the Supabase CLI.

### 2. Frontend
```
cd frontend
cp .env.example .env.local      # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev                     # http://localhost:5173
```

### 3. API (optional until you build scope/reports/esx)
```
cd api
cp .env.example .env            # fill ANTHROPIC_API_KEY + SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev                     # http://localhost:8787
```

## What works now
Sign up -> create org -> add claims (full Edit Home form) -> structures -> rooms
-> room tabs (Notes wired end to end as the reference; Photos/Contents/Sketches
scaffolded). All tenant-isolated by RLS.

## What's stubbed (and where)
- Offline sync internals: `frontend/src/lib/syncQueue.ts`
- Hydro engine: `frontend/src/features/hydro/`
- AI scope: `frontend/src/features/scopes/` + `api/src/routes/scope.ts`
- Reports/export: `frontend/src/features/reports/` + `api/src/routes/report.ts`
- Sketch/moisture-map editor: `frontend/src/features/sketch/`
- ESX export: `api/src/routes/esx.ts`
- Cross-org "Network" share reads: see note in `0005_documents_shares.sql`

## Next vertical slice
Prove the spine end to end: one claim -> structure -> room -> capture photos +
a note -> generate a basic report PDF. Exercises tenancy, capture, offline sync,
and report generation in one thin line before going deep on Hydro.
