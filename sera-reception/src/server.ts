import * as dotenv from 'dotenv';
import express from 'express';
import { resolve } from 'path';
import { createPublicReceptionRouter } from '../../src/reception/publicReceptionRouter';

// A service deployment uses its own .env. The second load keeps local development
// compatible with the existing root .env while Reception is being separated.
dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(process.cwd(), '../.env'), override: false });

const app = express();
const port = Number(process.env.RECEPTION_PORT || 3002);
const origins = (process.env.SERA_RECEPTION_CORS_ORIGINS || process.env.SERA_CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));
app.use('/api/reception', createPublicReceptionRouter((origin) => !origin || origins.includes(origin)));

app.listen(port, () => {
  console.log(`[SERA Reception] Public service listening on port ${port}`);
});
