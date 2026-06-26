import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import health from './routes/health.js';
import scope from './routes/scope.js';
import ocr from './routes/ocr.js';
import report from './routes/report.js';
import esx from './routes/esx.js';

// Minimal backend for the few things that MUST be server-side:
//  - Claude calls (scope generation, meter OCR) so the API key never ships to the client
//  - PDF report generation
//  - ESX (Xactimate) file generation
// All ordinary CRUD goes frontend -> Supabase directly (RLS enforced).

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

app.use('/api/health', health);
app.use('/api/scope', scope);
app.use('/api/ocr', ocr);
app.use('/api/report', report);
app.use('/api/esx', esx);

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`api on :${port}`));
