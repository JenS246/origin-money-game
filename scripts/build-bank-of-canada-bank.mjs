import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MONEY as CURRENT_MONEY } from '../src/money.generated.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SEARCH_URL = 'https://www.bankofcanadamuseum.ca/collection/search';
const TERMS_URL = 'https://www.bankofcanada.ca/terms/';
const SOURCE_NAME = 'Bank of Canada Museum National Currency Collection';
const FETCH_CONCURRENCY = 6;
const EARLIEST_YEAR = 1200;
const LATEST_YEAR = 1925;

const counters = {
  listingPages: 0,
  discovered: 0,
  scanned: 0,
  coinObjects: 0,
  eligible: 0,
  rejected: {},
  excluded: {},
};
const unmatchedMints = new Map();

function addCount(bucket, reason, amount = 1) {
  counters[bucket][reason] = (counters[bucket][reason] || 0) + amount;
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'OriginMoneyGame/2.2 (https://github.com/JenS246/origin-money-game)' },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 650 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/<br\s*\/?>/gi, '; ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#039;/gi, "'")
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value = '') {
  return decodeHtml(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(?:the|mint|monnaie|facility|branch)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function hash(value) {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function fieldsFromHtml(html) {
  const fields = new Map();
  const rowPattern = /<div class="col-xs-4">([\s\S]*?)<\/div>\s*<div class="col-xs-8">([\s\S]*?)<\/div>/gi;
  for (const match of html.matchAll(rowPattern)) {
    const key = decodeHtml(match[1]);
    const value = decodeHtml(match[2]);
    if (!key || !value) continue;
    if (!fields.has(key)) fields.set(key, []);
    fields.get(key).push(value);
  }
  return fields;
}

function firstField(fields, ...names) {
  for (const name of names) {
    const value = fields.get(name)?.find(Boolean);
    if (value) return value;
  }
  return '';
}

function dateDetails(fields, title) {
  const dated = firstField(fields, 'Issuing date', 'Minting date', 'Production date', 'Date')
    || title.split(':').at(-1);
  const values = [...String(dated).matchAll(/(?<!\d)(\d{3,4})(?!\d)/g)].map((match) => Number(match[1]));
  if (!values.length) return null;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum < EARLIEST_YEAR || maximum > LATEST_YEAR) return null;
  return {
    label: minimum === maximum ? String(minimum) : `${minimum}-${maximum}`,
    minimum,
    maximum,
  };
}

function imagePair(html) {
  const urls = [...html.matchAll(/href="(https:\/\/www\.bankofcanadamuseum\.ca\/collection\/images\/[^"?]+\.jpg)"/gi)]
    .map((match) => match[1]);
  const front = urls.find((url) => /,a\d*,/i.test(url));
  const back = urls.find((url) => /,b\d*,/i.test(url));
  return front && back ? [front, back] : null;
}

function titleFromHtml(html) {
  return decodeHtml(html.match(/<a\s+rel="artefact"[\s\S]*?title="([^"]+)"/i)?.[1] || '');
}

function makeGazetteer(records) {
  const gazetteer = new Map();
  for (const item of records) {
    if (!item.anchor || item.anchor.method === 'representative_point') continue;
    const key = normalize(item.anchor.label);
    if (!key || key.length < 3) continue;
    const existing = gazetteer.get(key);
    if (!existing || item.anchor.radiusKm < existing.radiusKm) {
      gazetteer.set(key, {
        label: item.anchor.label,
        lat: item.anchor.lat,
        lng: item.anchor.lng,
        radiusKm: item.anchor.radiusKm,
        sourceUrl: item.anchor.sourceUrl,
      });
    }
  }
  return gazetteer;
}

const BASE_RECORDS = CURRENT_MONEY.filter((item) => !item.id.startsWith('boc-'));
const gazetteer = makeGazetteer(BASE_RECORDS);
for (const [key, place] of Object.entries({
  ottawa: { label: 'Ottawa', lat: 45.4207, lng: -75.6900, radiusKm: 80, sourceUrl: 'https://www.wikidata.org/wiki/Q1930' },
  lyon: { label: 'Lyon', lat: 45.7640, lng: 4.8357, radiusKm: 80, sourceUrl: 'https://www.wikidata.org/wiki/Q456' },
  metz: { label: 'Metz', lat: 49.1193, lng: 6.1757, radiusKm: 80, sourceUrl: 'https://www.wikidata.org/wiki/Q22690' },
  lille: { label: 'Lille', lat: 50.6292, lng: 3.0573, radiusKm: 80, sourceUrl: 'https://www.wikidata.org/wiki/Q648' },
  nantes: { label: 'Nantes', lat: 47.2184, lng: -1.5536, radiusKm: 80, sourceUrl: 'https://www.wikidata.org/wiki/Q12191' },
  besancon: { label: 'Besançon', lat: 47.2378, lng: 6.0241, radiusKm: 80, sourceUrl: 'https://www.wikidata.org/wiki/Q37776' },
  grenoble: { label: 'Grenoble', lat: 45.1885, lng: 5.7245, radiusKm: 80, sourceUrl: 'https://www.wikidata.org/wiki/Q1289' },
  perpignan: { label: 'Perpignan', lat: 42.6986, lng: 2.8956, radiusKm: 80, sourceUrl: 'https://www.wikidata.org/wiki/Q6730' },
  poitiers: { label: 'Poitiers', lat: 46.5802, lng: 0.3404, radiusKm: 80, sourceUrl: 'https://www.wikidata.org/wiki/Q661' },
  riom: { label: 'Riom', lat: 45.8930, lng: 3.1130, radiusKm: 80, sourceUrl: 'https://www.wikidata.org/wiki/Q207076' },
  toulouse: { label: 'Toulouse', lat: 43.6045, lng: 1.4440, radiusKm: 80, sourceUrl: 'https://www.wikidata.org/wiki/Q7880' },
  bayonne: { label: 'Bayonne', lat: 43.4933, lng: -1.4751, radiusKm: 80, sourceUrl: 'https://www.wikidata.org/wiki/Q170507' },
  caen: { label: 'Caen', lat: 49.1829, lng: -0.3707, radiusKm: 80, sourceUrl: 'https://www.wikidata.org/wiki/Q41185' },
  dijon: { label: 'Dijon', lat: 47.3220, lng: 5.0415, radiusKm: 80, sourceUrl: 'https://www.wikidata.org/wiki/Q7003' },
  madrid: { label: 'Madrid', lat: 40.4168, lng: -3.7038, radiusKm: 80, sourceUrl: 'https://www.wikidata.org/wiki/Q2807' },
  reims: { label: 'Reims', lat: 49.2583, lng: 4.0317, radiusKm: 80, sourceUrl: 'https://www.wikidata.org/wiki/Q41876' },
  troyes: { label: 'Troyes', lat: 48.2973, lng: 4.0744, radiusKm: 80, sourceUrl: 'https://www.wikidata.org/wiki/Q243293' },
})) gazetteer.set(key, place);
const facilityAliases = new Map([
  ['royal', 'london'],
  ['royal london', 'london'],
  ['tower hill london', 'london'],
  ['heaton birmingham', 'birmingham england'],
  ['birmingham', 'birmingham england'],
  ['paris', 'paris'],
  ['philadelphia', 'philadelphia'],
  ['denver', 'denver'],
  ['san francisco', 'san francisco'],
  ['new orleans', 'new orleans'],
  ['carson city', 'carson city nev'],
  ['mexico city', 'mexico city'],
  ['royal ottawa', 'ottawa'],
  ['lyons', 'lyon'],
  ['ralph heaton sons', 'birmingham england'],
]);
const searchablePlaces = [...gazetteer.entries()]
  .filter(([key]) => key.length >= 4 && !['iran', 'united states', 'united kingdom england'].includes(key))
  .sort((a, b) => b[0].length - a[0].length);

function resolveMint(mint) {
  const normalized = normalize(mint);
  if (!normalized || /^(?:none|unknown|uncertain|not recorded)$/.test(normalized)) return null;
  const alias = facilityAliases.get(normalized);
  if (alias && gazetteer.has(alias)) return gazetteer.get(alias);
  if (gazetteer.has(normalized)) return gazetteer.get(normalized);
  for (const [key, place] of searchablePlaces) {
    const padded = ` ${normalized} `;
    if (padded.includes(` ${key} `)) return place;
  }
  return null;
}

function parseRecord(html, articleUrl) {
  counters.scanned += 1;
  const fields = fieldsFromHtml(html);
  if (firstField(fields, 'Collection').toLowerCase() !== 'coin') {
    addCount('rejected', 'not_a_coin');
    return null;
  }
  counters.coinObjects += 1;

  const recordId = articleUrl.match(/\/artefact\/view\/([^/]+)/i)?.[1] || '';
  const title = titleFromHtml(html);
  if (!recordId || !title || /^coin$/i.test(title)) {
    addCount('rejected', 'generic_or_missing_identity');
    return null;
  }
  const statusText = [title, firstField(fields, 'Form'), firstField(fields, 'Name'), firstField(fields, 'Variety')].join(' ');
  if (/counterfeit|forgery|replica|reproduction|imitation|fantasy|modern copy|questioned|uncertain attribution/i.test(statusText)) {
    addCount('rejected', 'inauthentic_or_non_currency_object');
    return null;
  }
  const dates = dateDetails(fields, title);
  if (!dates) {
    addCount('rejected', 'missing_or_out_of_range_date');
    return null;
  }
  const images = imagePair(html);
  if (!images) {
    addCount('rejected', 'missing_obverse_reverse_images');
    return null;
  }
  const mint = firstField(fields, 'Mint');
  const anchor = resolveMint(mint);
  if (!anchor) {
    addCount('rejected', 'missing_or_unresolved_specific_mint');
    const key = mint || '(missing)';
    unmatchedMints.set(key, (unmatchedMints.get(key) || 0) + 1);
    return null;
  }

  const country = firstField(fields, 'Country');
  const issuingAuthority = firstField(fields, 'Issuing authority');
  const ruler = firstField(fields, 'Ruler');
  const issuer = issuingAuthority && !/^unknown$/i.test(issuingAuthority)
    ? issuingAuthority
    : ruler || country || anchor.label;
  const obverse = firstField(fields, 'Subject Obverse', 'Subject Face');
  const reverse = firstField(fields, 'Subject Reverse', 'Subject Back');
  const detailParts = [
    ruler && ruler !== issuer ? `Authority: ${ruler}.` : '',
    `Minted at ${mint}.`,
    obverse ? `Front: ${obverse}.` : '',
    reverse ? `Back: ${reverse}.` : '',
  ].filter(Boolean);
  counters.eligible += 1;

  return {
    recordId,
    id: `boc-${slug(recordId)}`,
    title,
    type: 'coin',
    issuer,
    year: dates.label,
    department: 'Bank of Canada Museum',
    place: { label: anchor.label, href: anchor.sourceUrl },
    blurb: decodeHtml(detailParts.join(' ')).slice(0, 420),
    sourceUrl: articleUrl,
    articleUrl,
    anchor: {
      lat: anchor.lat,
      lng: anchor.lng,
      label: anchor.label,
      method: 'mint_city',
      radiusKm: Math.max(80, Math.min(anchor.radiusKm, 150)),
      sourceUrl: anchor.sourceUrl,
    },
    image: {
      url: images[0],
      backUrl: images[1],
      alt: `Front of ${title}`,
      backAlt: `Back of ${title}`,
      author: 'Bank of Canada Museum',
      license: 'Bank of Canada permitted reuse',
      licenseUrl: TERMS_URL,
      filePage: articleUrl,
    },
  };
}

const firstListing = await fetchText(`${SEARCH_URL}?adv=1&co=8`);
const pageCount = Number(firstListing.match(/Page\s+1\s+of\s+(\d+)/i)?.[1] || 1);
const listingUrls = Array.from({ length: pageCount }, (_, index) => (
  index === 0 ? `${SEARCH_URL}?adv=1&co=8` : `${SEARCH_URL}/page/${index + 1}?adv=1&co=8`
));
const listingHtml = await mapLimit(listingUrls, FETCH_CONCURRENCY, async (url, index) => {
  const html = index === 0 ? firstListing : await fetchText(url);
  counters.listingPages += 1;
  if (counters.listingPages % 12 === 0 || counters.listingPages === listingUrls.length) {
    console.log(`Read ${counters.listingPages}/${listingUrls.length} Bank of Canada coin listing pages...`);
  }
  return html;
});
const articleUrls = [...new Set(listingHtml.flatMap((html) => (
  [...html.matchAll(/href="(https:\/\/www\.bankofcanadamuseum\.ca\/collection\/artefact\/view\/[^"?]+)"/gi)]
    .map((match) => match[1])
)))];
counters.discovered = articleUrls.length;

let completed = 0;
const parsed = await mapLimit(articleUrls, FETCH_CONCURRENCY, async (url) => {
  const item = parseRecord(await fetchText(url), url);
  completed += 1;
  if (completed % 100 === 0 || completed === articleUrls.length) {
    console.log(`Checked ${completed}/${articleUrls.length} Bank of Canada coin records...`);
  }
  return item;
});

const usedTitles = new Set(BASE_RECORDS.map((item) => item.title.toLowerCase()));
const accepted = [];
for (const item of parsed.filter(Boolean).sort((a, b) => hash(a.recordId) - hash(b.recordId))) {
  const titleKey = item.title.toLowerCase();
  if (usedTitles.has(titleKey)) {
    addCount('excluded', 'duplicate_title');
    continue;
  }
  usedTitles.add(titleKey);
  accepted.push(item);
}

const combined = [...BASE_RECORDS, ...accepted].sort((a, b) => a.id.localeCompare(b.id));
const generatedAt = new Date().toISOString();
const moneyJs = `// Generated by the ORIGIN source importers on ${generatedAt}.\n` +
  `// Metadata and image rights are recorded per object.\n` +
  `export const MONEY = ${JSON.stringify(combined, null, 2)};\n`;
const dailyIds = [...combined]
  .sort((a, b) => hash(`daily:${a.recordId}`) - hash(`daily:${b.recordId}`) || a.id.localeCompare(b.id))
  .map((item) => item.id);
const dailyJs = `// Generated by the ORIGIN source importers on ${generatedAt}.\n` +
  `// This checked-in order is the deterministic hash-shuffled daily puzzle schedule.\n` +
  `export const DAILY_IDS = ${JSON.stringify(dailyIds, null, 2)};\n`;

await writeFile(path.join(ROOT, 'src/money.generated.js'), moneyJs);
await writeFile(path.join(ROOT, 'src/daily.generated.js'), dailyJs);
await writeFile(path.join(ROOT, 'data/bank-of-canada-quality-report.json'), `${JSON.stringify({
  generatedAt,
  source: SOURCE_NAME,
  sourceSearch: `${SEARCH_URL}?adv=1&co=8`,
  imageTerms: TERMS_URL,
  admissionRules: [
    'catalogued as a coin in the National Currency Collection',
    'documented issue date from 1200 through 1925',
    'specific mint or mint facility resolvable to an audited city already in the corpus',
    'separate obverse and reverse collection photographs',
    'non-generic object identity',
    'not described as counterfeit, forgery, replica, reproduction, imitation, fantasy, modern copy, or questioned attribution',
    'coin photographs only; Bank of Canada bank-note images are excluded because the Bank terms treat them separately',
  ],
  listingPagesRead: counters.listingPages,
  recordsDiscovered: counters.discovered,
  recordsScanned: counters.scanned,
  coinObjects: counters.coinObjects,
  eligibleBeforeDeduplication: counters.eligible,
  accepted: accepted.length,
  rejected: counters.rejected,
  excludedAfterValidation: counters.excluded,
  unmatchedMints: [...unmatchedMints.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 100)
    .map(([mint, count]) => ({ mint, count })),
  combinedCorpus: combined.length,
}, null, 2)}\n`);

console.log(`Added ${accepted.length} Bank of Canada Museum records to ${BASE_RECORDS.length} existing records (${combined.length} total).`);
