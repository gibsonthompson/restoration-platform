import { Router } from 'express';
// POST /api/ocr  { imageBase64 } -> { tempF, rhPct }. Claude vision reads the meter.
// STUB.
const r = Router();
r.post('/', async (_req, res) => {
  res.status(501).json({ error: 'not implemented', module: 'hydro/meter-ocr' });
});
export default r;
