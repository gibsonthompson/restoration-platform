import { Router } from 'express';
// POST /api/report  { claimId, type } -> branded PDF from real captured data.
// type: preliminary_report | drying_report | schedule_of_loss | full_export.
// STUB. Pull claim graph via service-role, render PDF, store, return path.
const r = Router();
r.post('/', async (_req, res) => {
  res.status(501).json({ error: 'not implemented', module: 'reports' });
});
export default r;
