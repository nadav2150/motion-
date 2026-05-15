// Smoke test the brand scraper against a real URL.
// Run: npx tsx scripts/smoke-brand-scrape.ts https://artlist.io/

import "dotenv/config";
import { scrapeBrand } from "../app/lib/brand-scrape";

const url = process.argv[2] || "https://artlist.io/";
console.log(`[smoke] scraping ${url}`);
const result = await scrapeBrand(url);
console.log(JSON.stringify(result, null, 2));
