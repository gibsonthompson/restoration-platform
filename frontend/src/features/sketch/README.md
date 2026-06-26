# Sketch / Moisture Map module (manual canvas)

Free, PWA-friendly replacement for auto-CV floor plans. Canvas/SVG editor with
the Encircle toolbar: Move / Draw / Place / Filter / Grid.

Object model (stored in resto_sketches.canvas_json):
- walls (polylines), wet-area polygons, placed equipment (air movers/dehu),
  reading pins (numbered, tie to resto_readings.location_label), labels.

Later (only if we go native): optional Apple RoomPlan auto-scan. Export path to
Xactimate is the ESX generator (POST /api/esx), which needs no Verisk partnership.
