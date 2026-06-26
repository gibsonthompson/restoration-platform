# Reports module (carrier-ready export)

Three report types + a full project export. Generated server-side (POST /api/report)
as branded PDF from REAL captured data with intact timestamps/GPS.

Types: preliminary_report, drying_report, schedule_of_loss, full_export.

Red flags the generator must never produce (these get claims scrubbed):
- missing dates/times, identical daily readings, finals exactly equal to dry standard,
  no environmental readings, equipment-log mismatch, no moisture-map diagram.

Principle: faithful rendering of evidence, never an AI narrative that can drift.
