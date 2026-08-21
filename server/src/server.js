import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import './db.js';
import { evsRouter } from './routes/evs.js';
import { leasesRouter } from './routes/leases.js';
import { scrapeRouter } from './routes/scrape.js';
import { makesRouter } from './routes/makes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
app.use(express.json());

app.use('/api/evs', evsRouter);
app.use('/api/leases', leasesRouter);
app.use('/api/scrape', scrapeRouter);
app.use('/api/makes', makesRouter);

// In production, serve the built frontend from web/dist on the same port.
const webDist = join(__dirname, '..', '..', 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res) => res.sendFile(join(webDist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Lease Comparison API listening on http://localhost:${PORT}`);
});
