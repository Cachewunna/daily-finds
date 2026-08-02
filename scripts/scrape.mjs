import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const dataDir = path.join(root, "data");
const publicDataDir = path.join(root, "public", "data");
const searches = JSON.parse(await readFile(path.join(root, "searches.json"), "utf8"));
const maxPages = Number(process.env.MAX_PAGES || 20);
const isBaseline = process.env.BASELINE === "true";

await mkdir(dataDir, { recursive: true });
await mkdir(publicDataDir, { recursive: true });

const readJson = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch { return fallback; }
};

const seenFile = path.join(dataDir, "seen.json");
const feedFile = path.join(publicDataDir, "feed.json");
const seen = await readJson(seenFile, {});
const previousFeed = await readJson(feedFile, { generatedAt: null, baselineComplete: false, items: [] });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "en-AU", viewport: { width: 1440, height: 1000 } });

async function scrapePage(url, search) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('a[href*="/mercari/item/"]').first().waitFor({ state: "attached", timeout: 30000 });
  return page.locator('a[href*="/mercari/item/"]').evaluateAll((anchors, meta) => anchors.map((a) => {
    const href = new URL(a.getAttribute("href"), location.origin).href;
    const id = href.match(/\/mercari\/item\/([^?]+)/)?.[1];
    const img = a.querySelector("img.thumbnail, img");
    const title = img?.getAttribute("alt")?.trim() || "Untitled listing";
    const text = (a.textContent || "").replace(/\s+/g, " ").trim();
    const yen = text.match(/([\d,]+)\s*YEN/i)?.[1];
    const aud = text.match(/AU\$([\d,.]+)/i)?.[1];
    let image = img?.getAttribute("src") || img?.getAttribute("data-src") || "";
    if (image.startsWith("//")) image = `https:${image}`;
    return id ? {
      id, title, url: href, image,
      priceYen: yen ? Number(yen.replaceAll(",", "")) : null,
      priceAud: aud ? Number(aud.replaceAll(",", "")) : null,
      searchIds: [meta.id], searchLabels: [meta.label]
    } : null;
  }, search).filter(Boolean));
}

const collected = new Map();
const errors = [];

for (const search of searches) {
  const base = new URL(search.url);
  base.searchParams.set("page", "1");
  base.searchParams.set("limit", "100");
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    base.searchParams.set("page", String(pageNumber));
    try {
      const items = await scrapePage(base.href, search);
      for (const item of items) {
        const existing = collected.get(item.id);
        if (existing) {
          if (!existing.searchIds.includes(search.id)) existing.searchIds.push(search.id);
          if (!existing.searchLabels.includes(search.label)) existing.searchLabels.push(search.label);
        } else collected.set(item.id, item);
      }
      if (items.length < 95) break;
    } catch (error) {
      errors.push({ search: search.label, page: pageNumber, message: error.message });
      break;
    }
  }
}

await browser.close();
const now = new Date().toISOString();
const allCurrent = [...collected.values()];
const newItems = allCurrent.filter((item) => !seen[item.id]).map((item) => ({ ...item, firstSeen: now }));
for (const item of allCurrent) seen[item.id] = seen[item.id] || now;

const publishItems = isBaseline && !previousFeed.baselineComplete
  ? previousFeed.items
  : [...newItems, ...previousFeed.items].slice(0, 3000);

await writeFile(seenFile, JSON.stringify(seen, null, 2) + "\n");
await writeFile(feedFile, JSON.stringify({
  generatedAt: now,
  baselineComplete: true,
  scanned: allCurrent.length,
  newCount: isBaseline && !previousFeed.baselineComplete ? 0 : newItems.length,
  errors,
  items: publishItems
}, null, 2) + "\n");

console.log(JSON.stringify({ scanned: allCurrent.length, newItems: newItems.length, published: publishItems.length, errors }, null, 2));
