import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const curatedSeeds = JSON.parse(await readFile(path.join(ROOT, 'data/seeds.json'), 'utf8'));
const discoveredSeeds = JSON.parse(await readFile(path.join(ROOT, 'data/wikidata-seeds.json'), 'utf8'));
const blockedArticles = new Set([
  'Achaemenid coinage',
  'Banknotes of the Ukrainian hryvnia',
  'Brazilian real',
  'Coinage of Upper Canada',
  '50 haleru (World War II Bohemian and Moravian coin)',
  'Goryeo coinage',
  'Israeli new shekel',
  'Mogadishu currency',
  'Ukrainian Archangel Michael coins',
]);
const seedByArticle = new Map();
for (const seed of [...discoveredSeeds, ...curatedSeeds]) seedByArticle.set(seed.article, seed);
const seeds = [...seedByArticle.values()].filter((seed) => !blockedArticles.has(seed.article));
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'OriginMoneyGame/1.0 (https://github.com/JenS246/origin-money-game)';

function chunks(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

async function request(api, params) {
  const url = new URL(api);
  url.search = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

function plainText(value = '') {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/[—–]/g, '-')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSentence(extract = '') {
  const clean = plainText(extract).replace(/\[[^\]]+\]/g, '').trim();
  const match = clean.match(/^(.{40,360}?[.!?])(?:\s|$)/);
  return (match?.[1] || clean.slice(0, 300)).trim();
}

function slug(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function itemType(title) {
  if (/coin|quarter|dollar$|forint|koruna|krona|kroner|baht/i.test(title)) return 'coin';
  if (/note|bill/i.test(title)) return 'banknote';
  return 'currency';
}

function normalizeFileTitle(value = '') {
  return value.replace(/^File:/, '').replaceAll('_', ' ').trim();
}

const pageResults = [];
for (const batch of chunks(seeds, 25)) {
  const payload = await request(WIKIPEDIA_API, {
    action: 'query',
    redirects: '1',
    prop: 'pageimages|extracts|info',
    inprop: 'url',
    exintro: '1',
    explaintext: '1',
    piprop: 'name|thumbnail|original',
    pithumbsize: '1200',
    pilicense: 'free',
    titles: batch.map((seed) => seed.article).join('|'),
  });

  const aliases = new Map(batch.map((seed) => [seed.article, seed.article]));
  for (const item of payload.query?.normalized || []) aliases.set(item.from, item.to);
  for (const item of payload.query?.redirects || []) {
    for (const [key, value] of aliases) {
      if (value === item.from) aliases.set(key, item.to);
    }
  }

  for (const seed of batch) {
    const finalTitle = aliases.get(seed.article) || seed.article;
    const page = payload.query?.pages?.find((candidate) => candidate.title === finalTitle);
    if (!page || page.missing || (!seed.imageTitle && (!page.pageimage || !page.thumbnail?.source))) {
      console.warn(`skip: no free lead image for ${seed.article}`);
      continue;
    }
    pageResults.push({ seed, page: { ...page, pageimage: seed.imageTitle || page.pageimage } });
  }
}

const fileTitles = [...new Set(pageResults.map(({ page }) => `File:${page.pageimage}`))];
const commonsByTitle = new Map();
for (const batch of chunks(fileTitles, 50)) {
  const payload = await request(COMMONS_API, {
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'url|mime|size|canonicaltitle|extmetadata',
    iiurlwidth: '1200',
    iiextmetadatafilter: 'ImageDescription|Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms|AttributionRequired',
    titles: batch.join('|'),
  });
  for (const page of payload.query?.pages || []) {
    commonsByTitle.set(normalizeFileTitle(page.title), page.imageinfo?.[0]);
  }
}

const rejectedWords = /\b(map|logo|symbol|diagram|collage|montage|collection)\b/i;
const money = pageResults.flatMap(({ seed, page }) => {
  const imageInfo = commonsByTitle.get(normalizeFileTitle(page.pageimage));
  const description = plainText(imageInfo?.extmetadata?.ImageDescription?.value || '');
  const tooSmall = Math.max(imageInfo?.width || 0, imageInfo?.height || 0) < 400;
  const badMime = !/^image\/(jpeg|png|webp)$/i.test(imageInfo?.mime || '');
  if (!imageInfo?.thumburl || rejectedWords.test(page.pageimage) || tooSmall || badMime) {
    console.warn(`skip: unsuitable lead image for ${seed.article}`);
    return [];
  }

  const license = plainText(imageInfo.extmetadata?.LicenseShortName?.value || 'Unknown license');
  const author = plainText(
    imageInfo.extmetadata?.Artist?.value || imageInfo.extmetadata?.Credit?.value || 'Wikimedia Commons contributor',
  );
  return [{
    id: slug(seed.article),
    title: page.title,
    type: itemType(page.title),
    issuer: seed.issuer,
    year: seed.year || '',
    anchor: seed.anchor,
    blurb: firstSentence(page.extract),
    articleUrl: page.fullurl,
    wikidataUrl: seed.wikidataUrl || '',
    image: {
      url: imageInfo.thumburl,
      width: imageInfo.thumbwidth,
      height: imageInfo.thumbheight,
      alt: `${page.title}, image from Wikimedia Commons`,
      fileTitle: page.pageimage,
      filePage: imageInfo.descriptionurl,
      author,
      license,
      licenseUrl: imageInfo.extmetadata?.LicenseUrl?.value || imageInfo.descriptionshorturl,
    },
  }];
});

money.sort((a, b) => a.id.localeCompare(b.id));
const generatedAt = new Date().toISOString();
const js = `// Generated by scripts/build-money-bank.mjs on ${generatedAt}.\n` +
  `// Wikipedia text is available under CC BY-SA. Individual image licenses are retained per record.\n` +
  `export const MONEY = ${JSON.stringify(money, null, 2)};\n`;

await writeFile(path.join(ROOT, 'src/money.generated.js'), js);
await writeFile(
  path.join(ROOT, 'data/quality-report.json'),
  `${JSON.stringify({ generatedAt, seeds: seeds.length, accepted: money.length, rejected: seeds.length - money.length }, null, 2)}\n`,
);
console.log(`Built ${money.length} records from ${seeds.length} seeds.`);
