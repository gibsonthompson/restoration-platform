# Restoration Documentation Platform — Project Doc

A field documentation and claims platform for water/fire/mold restoration contractors, modeled on Encircle, built free-stack and PWA-first, multi-tenant from day one. Reliable Solutions is the first tenant; the platform is standalone and productizable later (same relationship CallBird has to VoiceAI Connect).

Last updated: research synthesis stage. No app code written yet. This is the planning spec.

---

## 1. What we are building and why

Restoration contractors get paid by insurance carriers for work they can prove they did. Adjusters scrub line items that lack documentation. The whole product exists to capture bulletproof field evidence (photos, moisture readings, drying logs, sketches, scope) and turn it into defensible reports and a Xactimate-ready estimate, so the contractor gets paid in full without back-and-forth.

The industry truth that drives every feature: "You don't get paid for the work you did, you get paid for the work you documented."

Our build is a near-complete replication of Encircle's feature set, with three deliberate upgrades (AI scope from field notes, structured ESX export, real-time multi-user) and two deliberate downgrades forced by the free/PWA constraints (manual sketch editor instead of auto-CV floor plans, metered-not-free AI). Both downgrades preserve the outcome that actually matters.

---

## 2. Core constraints (these shape every decision)

1. **Free.** No paid partnerships, no per-scan vendor fees, no hardware. The only unavoidable cost is LLM/vision inference (cheap, metered), plus eventual storage scale.
2. **PWA-first.** No Apple Developer fee, no native build initially. React PWA. Accept the iOS offline-reliability ceiling and architect a Capacitor/Expo escape hatch so the same codebase can be wrapped native later without a rewrite.
3. **Multi-tenant from day one.** Every entity is tenant-scoped. Multiple users per company with roles. RSA is tenant #1.
4. **Lives on the VoiceAI Connect Supabase project but logically separate**, prefix-isolated tables (proposed prefix `resto_`), the same way Forward Fitness uses `iron_` tables. Not wired to VoiceAI Connect.

---

## 3. Strategic findings that de-risk the project

These came out of the research and change the difficulty calculus. Worth keeping front of mind.

- **The floor-plan "moat" does not exist.** Encircle does not build computer vision. It integrates CubiCasa (a paid Finnish vendor) for auto floor plans, which is why turnaround is hours, not instant. Their own core sketch tool (the moisture map) is a manual canvas editor (Move/Draw/Place/Filter/Grid). We replicate the manual canvas free in the browser and skip auto-CV entirely (or add it later via Apple RoomPlan if we ever go native).
- **The Xactimate integration has two tiers, and only one needs permission.** The ESX file is a zipped-XML container that imports the sketch, measurements, photos, and line items. Generating an ESX and handing it to the user (what magicplan and DocuSketch do) requires no Verisk partnership. The native in-Xactimate "Property Data Request" requires being an approved Verisk data provider (gated). We take the file-delivery tier. Same customer outcome.
- **The S500 engine is deterministic math.** GPP, dew point, vapor pressure, and S500 equipment sizing are formulas plus standard tables. No vendor, no AI, no cost.
- **The AI scope engine is our existing pattern.** Orchestrate Claude behind a domain corpus with validation guardrails, identical in shape to the VoiceAI Connect assistant-config architecture. The moat is the IICRC corpus + eval layer, not the model call.
- **Pricing model is flat per-shop SaaS** (Encircle ~$250–650/mo, unlimited users, floor plans metered). Maps cleanly onto a Stripe + Supabase setup later.

The two genuinely hard things in this category (auto-CV floor plans, Verisk partnership) are both optional. Everything load-bearing is free and in-stack.

---

## 4. Information architecture (the real hierarchy)

Derived from the live-app screenshots. Every screen is one level of this tree.

```
TENANT (restoration company)
├── Users (owner, manager/PM, lead_tech, tech)  + org settings
└── CLAIM   ("Job Number #6" / "Project #5")        ← top-level work entity
    ├── claim metadata (policyholder, carrier/contractor/assignment IDs,
    │                    address+geocode, dates, insurer, adjuster, type of loss, CAT code)
    ├── Documents      (generated reports + uploads; status: missing info / needs signature / signed)
    ├── General Notes
    ├── Share / "Network"  (cross-company sharing with estimators/adjusters)
    └── STRUCTURE   (Main Building, Basement, Second Level)
        ├── Floor Plans      (structure-level; manual sketch or optional import)
        ├── Hydro            (S500 water-mitigation engine — see §7)
        ├── Scopes           (AI "generate a scope of work")
        └── ROOM   (Exterior, Tool Room, Storage Room, Corridor, ...)
            ├── Photos & Videos   (date-grouped, geo/time-stamped, count badge)
            ├── Notes             (free text; measurements/scope; note templates)
            ├── Contents          (inventory items; AI descriptions; pre-existing damage proof)
            └── Sketches          (Moisture Maps; canvas editor)
```

Navigation note: the bottom nav changes by depth. Claim-list level shows fewer tabs; inside a claim it expands (Home / Job Events / Search / Notifications / Network). Replicate that depth-aware nav.

Cross-cutting object: a **drying chamber** (in Hydro) is a named group of rooms that cuts across the room tree. A **moisture map** is a shared object referenced by both a room's Sketches tab and a Hydro chamber.

---

## 5. Multi-tenant architecture plan

### 5.1 Tenancy and isolation
- Every table carries `org_id`. Row-Level Security enforces org isolation on every row (same pattern as VoiceAI Connect).
- Table prefix `resto_` keeps the app walled off inside the shared Supabase project.
- Supabase Auth for identity. A `resto_org_members (org_id, user_id, role)` table makes multi-user-per-company real from day one.

### 5.2 Roles (map to the screenshots)
- **owner** — billing, org settings, everything.
- **manager / PM** — Hydro Dashboard (job-review view), all claims, report generation, sharing.
- **lead_tech** — full field capture + Hydro task list, can manage rooms/chambers.
- **tech** — capture (photos/notes/readings), task list view, limited edit.

Gate per-module and per-claim, reusing the team-member permission-gating concept already built on VoiceAI Connect.

### 5.3 Org-level configuration (first-class, not an afterthought)
`resto_org_settings` (JSONB) holds per-tenant: report branding (logo, colors, license #), default Hydro task list, note templates, dry-standard material library, equipment catalog. This is what makes the platform genuinely white-labelable per restoration company and what makes each generated PDF reflect the right brand.

### 5.4 Storage
Supabase Storage, path-prefixed `org_id/claim_id/...` for photos, videos, generated PDFs. RLS so one tenant can never read another's media. This is the heaviest cost/scale axis (one room can hold 40+ photos and videos); plan tiering and compression early.

### 5.5 Sharing / "Network" (the one controlled cross-tenant seam)
`resto_claim_shares (claim_id, shared_with_user_id | shared_with_org_id, role)` enables sharing a claim with an outside estimator or adjuster (view or estimator role). This is the seam for the Xactimate estimator handoff and the only place strict org isolation gets a deliberate exception.

### 5.6 Offline + multi-tenant together
Device caches only the signed-in org's active claims in IndexedDB. Every queued mutation carries `org_id` so sync can never cross tenants. (iOS PWA offline caveats in §11 still apply and are the first thing to stress-test.)

---

## 6. Data model (entities and key fields)

Illustrative, not final DDL. Enough to build from. All tables include `id`, `org_id`, `created_at`, `updated_at`, `created_by`, and a soft-delete/`deleted_at` where useful. All carry sync metadata (`client_id`, `synced_at`) for offline.

**resto_orgs** — name, branding settings (or via org_settings), plan, status.
**resto_org_members** — org_id, user_id, role.
**resto_org_settings** — org_id, default_task_list (jsonb), note_templates (jsonb), material_library (jsonb), equipment_catalog (jsonb), report_branding (jsonb).

**resto_claims** — policyholder_name, policyholder_email, policyholder_phone, address, lat, lng, carrier_identifier, contractor_identifier, assignment_identifier, date_of_loss, date_created, insurance_company, broker_agent, project_manager, adjuster, policy_number, type_of_loss (water|fire|mold|other), category_of_water (1|2|3, nullable), class_of_water (1|2|3|4, nullable), cat_code, status. (N/A flags handled as explicit nulls per the Edit Home form UX.)

**resto_structures** — claim_id, name, cover_photo_id, sort_order.

**resto_rooms** — structure_id, name, cover_photo_id, sort_order, dimensions (length, width, height; ceiling default 8ft), flooring_type.

**resto_media** — room_id, type (photo|video), storage_path, captured_at, lat, lng, exif (jsonb), caption, is_pre_existing_damage (bool), tags. Date-grouping is a query concern (group by captured_at date).

**resto_notes** — room_id (nullable for claim-level general notes), claim_id, author_id, body, template_id (nullable), created_at. This is where free-text scope lives (e.g. "Total sqft 24x14=336 / Water extraction 100 sqft / 2 fans 1 dehu").

**resto_contents_items** — room_id, photo_id, description, brand, model, serial, quantity, condition, disposition (restorable|non_restorable|disposed), pre_existing_damage_photo_id, replacement_cost, acv. Powers the Schedule of Loss.

**resto_sketches** — room_id (nullable), chamber_id (nullable), type (moisture_map|floor_plan|room_sketch), canvas_json (the vector scene: walls, wet-area polygons, placed equipment, reading pins, labels), thumbnail_path, author_id.

### Hydro entities
**resto_hydro_visits** — claim_id/structure_id, label ("Job Setup" | "Visit 1" ...), visit_date, status (in_progress|complete), task_state (jsonb checklist).
**resto_drying_chambers** — structure_id, name, tolerance settings.
**resto_chamber_rooms** — chamber_id, room_id, affected (bool). (Unaffected rooms still count toward chamber size for equipment math.)
**resto_dry_standards** — chamber_id, material, meter, goal_value, source_note (where the standard came from), captured_at.
**resto_readings** — visit_id, chamber_id, reading_type (psychrometric|material_mc|dehu_outlet|exterior), location_label (numbered point tied to a physical spot), temp_f, rh_pct, gpp (computed), dew_point (computed), material_mc, meter_photo_id, captured_at, lat, lng.
**resto_equipment** — chamber_id, type (air_mover|dehumidifier|air_scrubber|heater), make_model, serial, placed_at, removed_at, calculated_required (from S500), actual_placed.
**resto_alerts** — chamber_id/visit_id, rule, severity, message, status (open|resolved), created_at.

### Documents
**resto_documents** — claim_id, type (preliminary_report|drying_report|schedule_of_loss|full_export|upload|esx), storage_path, status (draft|missing_info|needs_signature|signed|final), generated_at, signed_at.
**resto_signatures** — document_id, signer_name, signer_role, signature_image_path, signed_at, ip (for the e-sign audit trail).

**resto_claim_shares** — claim_id, shared_with_user_id | shared_with_org_id, role (viewer|estimator), created_by.

---

## 7. Hydro — the S500 water mitigation engine

The most differentiated module. A guided, S500-based checklist with its own sub-hierarchy beside the room tree.

### 7.1 Visits
- Initial visit = "Job Setup" (Day 1, heavy task list, ~13 tasks, customizable at org and job level).
- Subsequent visits = "Visit 1", "Visit 2", ... with a reduced task list (mostly just log readings).
- Multiple users can work one visit at once (assign per chamber).

### 7.2 Job Setup task list (S500-derived, customizable)
Identify source of loss → set Category (1/2/3) and Class (1–4) → create drying chamber(s) (select rooms, mark affected/unaffected, name) → set Dry Standards (per material + meter, take reference reading) → moisture map (draw wet areas + place equipment) → room dimensions → equipment sizing (S500 calc) → exterior readings → dehumidifier readings → initial readings. Completing the chamber unlocks chamber-specific tasks.

### 7.3 Dry standards and completion targets
Per material and per meter. Take a reference reading on an unaffected area, or note the source if none exists. Reference dry standards: structural wood framing below ~19% MC, gypsum drywall below ~1%. Drying is "done" only when every numbered point reaches its standard (visual dryness is not acceptable to adjusters).

### 7.4 Psychrometric engine (deterministic, build it exactly)
For each psychrometric reading, from temp (F) and RH (%):
- Grains Per Pound: `GPP = W × 7000`, where `W = 0.622 × (Pv / (Pa − Pv))`, Pv = vapor pressure of water in air, Pa = atmospheric pressure.
- Dew point and vapor pressure from temp + RH (standard psychrometric formulas).
- Track GPP at: affected interior, unaffected interior, exterior, and dehumidifier outlet, to show the dehu is removing moisture and the chamber is trending dry.

### 7.5 S500 equipment sizing
- Air movers and dehumidifiers calculated from chamber dimensions and class of loss.
- Air movement: `CFM = (Room Volume × ACH) / 60`, ACH chosen by class.
- Output a recommended count that justifies the equipment line items on the invoice (the thing adjusters scrub most).

### 7.6 Alerts
Rule engine over readings: flag a chamber that is not trending dry, a reading that looks off, or a missing daily reading. Surface to PM dashboard for office-side course correction.

### 7.7 Meter OCR (AI upgrade)
Photograph the moisture meter; Claude vision extracts temp/RH and writes the reading. Preserves the meter photo as time-stamped proof (adjusters value this). Queue offline, process on reconnect.

---

## 8. Scopes — AI scope generation (our headline upgrade)

The single highest-value differentiator. Field techs already write the scope as a free-text note (real example captured: "Total sqft 24x14=336 / Water extraction: 100 sqft / Drywall removal- 14 sqft / Anti microbial- 100 sqft / 2 fans 1 dehu"). Encircle stores that as dumb text. We structure it.

Pipeline:
1. Gather all room data: notes, photos (captions/vision), readings, dimensions, moisture map, category/class.
2. Claude reconstructs a room-by-room IICRC-aligned scope: project narrative + line items in restoration language (water extraction sf, drywall removal lf/sf, antimicrobial sf, equipment days), with citations to S500/S520/S700 to justify each item.
3. Validation pass: only use data that exists, flag assumptions, never invent line items (the anti-hallucination guardrail is the whole point).
4. Output feeds two places: the report narrative, and the ESX line items for Xactimate.

Architecture is the VoiceAI Connect orchestration pattern: Claude + IICRC corpus (retrieval context) + eval/validation gate. Cost discipline per existing standing rules: Haiku for extraction/OCR/drafts, Sonnet for final scope, cache the corpus, batch.

---

## 9. Reports / full project export (carrier-ready)

The requested "export the whole project to send to clients/insurance." Research shows this is really three recognized report types plus a complete export. All must be generated from real captured data with intact timestamps and GPS. Fabricated-looking output gets claims scrubbed.

### 9.1 The three report types
1. **Preliminary report** (a.k.a. Initial / 24-hour / "driveway" report). Created on-site in the first 12–24 hours. Contains: cause of loss, pre-existing damage, photos/videos, initial scope of work, sketches. The fast first impression to the adjuster.
2. **Drying / Moisture report** (Dehumidification and Structural Drying Record). Contains: drying plan, S500 equipment calculations, moisture maps with numbered reading points, daily psychrometric and material readings over time showing progress, time-stamped meter photos, completion confirmation. This is the document that justifies the water invoice.
3. **Schedule of Loss** (contents). Item-by-item: photo, description, brand/model/serial, condition, disposition (restorable/non-restorable), replacement cost and ACV. Often a spreadsheet-style layout.

### 9.2 Full project export (the master document)
One comprehensive PDF telling the complete story start to finish, assembled from everything:
- Cover + claim header (policyholder, address, claim/policy numbers, adjuster, insurer, date of loss, type of loss, category + class of water, contractor license/brand from org settings).
- Cause of loss and source documentation.
- Pre-existing damage section (time-stamped, geo-tagged, liability protection).
- Per structure → per room: photos (wide + close, including meter shots), notes, sketches.
- Moisture map diagrams with numbered measurement points tied to physical locations.
- Daily drying logs: date/time-stamped readings at consistent points, environmental temp/RH/GPP, dehu outlet, exterior.
- Equipment log: what, where, how long (justifies rental line items).
- Dry standards + completion confirmation (all points reached standard).
- Scope of work / line items.
- Signatures (work authorization, certificate of completion/satisfaction).
- Embedded metadata note (date/time/GPS) for data integrity.

### 9.3 Red flags the generator must NEVER produce (adjuster rejection triggers)
- Missing dates/times on entries.
- Identical readings every day (statistically implausible).
- Final readings that exactly equal the dry standard.
- No environmental (temp/RH) readings.
- Equipment log that does not match what was on site.
- No moisture map diagram correlating point numbers to locations.
- A thin summary when daily field data exists.

Design principle: the report is a faithful rendering of captured data, never a generated narrative that could drift from the evidence. Generate server-side (PDF), pull media from storage, embed real timestamps.

### 9.4 Output mechanics
- Server-side PDF generation, branded per org settings.
- Clickable/embedded high-res media.
- Generated in the Documents tab with status (draft → needs signature → signed → final), filterable (Missing Information / Needs Signature / Signed), plus Upload and Generate buttons (matches the live UI).
- Shareable via the Network/share seam to adjusters.

---

## 10. Xactimate ESX export

- Generate a valid ESX (zipped-XML) carrying sketch geometry (walls, doors, windows, measurements), room dimensions, photos, and the structured scope line items.
- Deliver as a file the user imports into Xactimate (Online drag-and-drop, or Desktop Tools → Data Transfer → Import). No Verisk partnership required.
- Known limitation even in market leaders: imports often carry walls but drop stairs/cabinets. Aim to carry as much room geometry + line-item data as the format cleanly accepts; validate against a real Xactimate import early (load-bearing assumption to test).
- Ceiling height defaults to 8ft unless captured.

---

## 11. Tech stack and platform

- **Frontend:** React PWA. Offline-first via IndexedDB + Service Worker. Canvas/SVG for the sketch + moisture map editor (Move/Draw/Place/Filter/Grid toolbar). Camera/video via getUserMedia.
- **Backend:** existing Express/DigitalOcean pattern + Supabase (Postgres, Auth, Storage, Realtime). RLS for tenancy.
- **AI:** Anthropic API (Claude). Haiku for OCR/extraction/drafts, Sonnet for final scope. Vision for meter OCR and photo captioning.
- **PDF:** server-side generation for reports.
- **Realtime:** Supabase Realtime for multi-user live sync (a near-free win Encircle markets as a headline).

### iOS PWA reliability (the real risk to manage)
iOS Safari lacks Background Sync and can evict web storage. Field capture with large un-synced media queues is exactly the weak spot. Mitigations: aggressive foreground sync, upload-as-you-go (don't let a day's media pool locally), storage-pressure warnings, and an explicit "sync now" affordance. Escape hatch: keep the codebase Capacitor/Expo-wrappable so we can get native storage/background sync/camera later without a rewrite. Stress-test this on real iPhones before building deep.

---

## 12. Where we beat Encircle

1. **Structured scope from the field note** → Xactimate line items + ESX. Encircle leaves the note as text.
2. **Voice walkthrough → structured note + scope + captions** (Claude). Encircle is only now rolling this out.
3. **Real-time multi-user** via Supabase Realtime, nearly free.
4. **Meter OCR** parity via Claude vision.
5. **One-click full project export** that is genuinely complete and adjuster-shaped, with the red-flag checks baked in.

---

## 13. Build sequencing (dependency order)

Phased so each layer stands on the one before. No code yet; this is the order when we start.

1. **Foundation:** tenancy, auth, `resto_org_members`, roles, RLS, org settings, storage buckets.
2. **Claims:** CRUD + the full Edit Home form (all fields from §6) + claim list with search/status.
3. **Structures + Rooms:** the nesting, cover photos, reorder.
4. **Room workspace:** Photos & Videos (offline capture + sync first, this is the riskiest infra), Notes (+ templates), Contents, Sketches (canvas editor).
5. **Hydro:** visits, chambers, dry standards, the psychrometric engine, S500 equipment sizing, readings, alerts, moisture maps, meter OCR.
6. **Scopes:** AI scope generation + validation guardrails.
7. **Documents / Reports:** the three report types + full project export (PDF), statuses, e-sign.
8. **Xactimate ESX export.**
9. **Network / sharing.**
10. **Billing / productization** (later, when going multi-tenant commercial).

Suggested first vertical slice to prove the spine end to end: one claim → one structure → one room → capture photos + a note → generate a basic report PDF. That exercises tenancy, capture, offline sync, and report generation in one thin line before going deep on Hydro.

---

## 14. Open decisions (still to lock)

- **Report PDF tooling** (server-side library/approach).
- **Sketch editor implementation** (canvas vs SVG; object model for walls/wet-areas/equipment/reading-pins).
- **Offline sync strategy specifics** (conflict resolution, media upload queue, last-write-wins vs per-field merge).
- **ESX validation** against a real Xactimate instance (confirm how much geometry + line-item data imports cleanly).
- **Whether to add optional Apple RoomPlan auto-scan** if/when a native wrap happens (free, iOS-LiDAR-only).
- **Material library + equipment catalog seed data** (the S500 dry-standard tables and equipment specs to ship as org defaults).

---

## 15. Appendix — reference facts

- IICRC standards: S500 (water), S520 (mold), S700 (fire). Carriers/TPAs require S500-supporting documentation but generally do not mandate a specific software vendor (two carriers mandate MICA/Mitigate).
- Category of water: 1 clean, 2 gray, 3 black. Class of water: 1–4 by degree of saturation. Both drive scope and price; the 24–48h window moves Cat 1 → Cat 2/3.
- Dry standards (reference): structural wood framing below ~19% MC; gypsum drywall below ~1%.
- Drying logs required by S500 for Class 2+; carriers commonly require them for claims above ~$5,000.
- ESX = zipped XML; imports sketch, measurements, photos, line items into Xactimate. File delivery needs no Verisk partnership.
- Encircle uses CubiCasa (third party) for auto floor plans; its own moisture-map tool is a manual canvas.
