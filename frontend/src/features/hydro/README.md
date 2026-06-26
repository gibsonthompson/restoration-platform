# Hydro module (S500 water mitigation engine)

Build order within this module:
1. `psychrometrics.ts` — pure functions: GPP, dew point, vapor pressure. Deterministic, unit-tested.
2. Equipment sizing — S500 air-mover / dehu counts from chamber dimensions + class of loss.
3. Visits + Job Setup task list (org-customizable, stored in resto_org_settings.default_task_list).
4. Drying chambers (group rooms, affected/unaffected).
5. Dry standards (per material + meter).
6. Readings capture (+ meter OCR via /api/ocr).
7. Alerts (rule engine over readings).

Tables: resto_hydro_visits, resto_drying_chambers, resto_chamber_rooms,
resto_dry_standards, resto_readings, resto_equipment, resto_alerts.
