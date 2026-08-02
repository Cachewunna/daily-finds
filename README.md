# Daily Finds

A free daily Buyee/Mercari search tracker. It checks the configured searches, remembers listing IDs, and publishes only newly discovered listings to a mobile-friendly feed.

## First run

```bash
npm install
npx playwright install chromium
BASELINE=true npm run scrape
```

The baseline run records everything currently listed without filling the feed. Future `npm run scrape` runs publish unseen listings.

## Daily timing

The included GitHub Action runs at 20:15 UTC, which is 06:15 Melbourne time during AEST and 07:15 during AEDT. GitHub schedules can start later during busy periods.

## Feed

Publish the `public` directory with GitHub Pages. Saved and dismissed states stay in the current browser through local storage.

## Change searches

Edit `searches.json`. Keep the full Buyee URL exactly as configured; the scraper normalises `page=1` and `limit=100` automatically.
