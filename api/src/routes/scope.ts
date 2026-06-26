import { Router } from 'express';
// POST /api/scope  { roomData } -> structured IICRC scope (narrative + line items).
// STUB. Implementation: build prompt from notes/photos/readings + IICRC corpus,
// call Claude (Haiku draft -> Sonnet final), run validation pass (no invented
// line items), return structured JSON for the report and ESX.
const r = Router();
r.post('/', async (_req, res) => {
  res.status(501).json({ error: 'not implemented', module: 'scopes' });
});
export default r;
