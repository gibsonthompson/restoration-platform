import { Router } from 'express';
// POST /api/esx  { claimId } -> Xactimate ESX (zipped XML) file.
// STUB. No Verisk partnership needed: we generate a valid ESX and the user imports it.
// Validate against a real Xactimate instance early.
const r = Router();
r.post('/', async (_req, res) => {
  res.status(501).json({ error: 'not implemented', module: 'esx' });
});
export default r;
