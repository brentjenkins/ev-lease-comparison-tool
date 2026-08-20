import { Router } from 'express';
import { scrapeListing } from '../lib/scraper.js';

export const scrapeRouter = Router();

scrapeRouter.post('/', async (req, res) => {
  const { url } = req.body || {};
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'A valid http(s) url is required' });
  }
  try {
    const guess = await scrapeListing(url);
    res.json(guess);
  } catch (err) {
    res.status(502).json({ error: `Could not scrape that page: ${err.message}` });
  }
});
