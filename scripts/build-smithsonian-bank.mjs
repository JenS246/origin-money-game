import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MONEY as CURRENT_MONEY } from '../src/money.generated.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const INDEX_URL = 'https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/nmah/index.txt';
const SOURCE_NAME = 'Smithsonian National Museum of American History';
const FETCH_CONCURRENCY = 8;
const EARLIEST_YEAR = -500;
const LATEST_YEAR = 1925;

const counters = {
  scanned: 0,
  currencyObjects: 0,
  eligible: 0,
  rejected: {},
  excluded: {},
};

function addCount(bucket, reason, amount = 1) {
  counters[bucket][reason] = (counters[bucket][reason] || 0) + amount;
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'OriginMoneyGame/2.1 (https://github.com/JenS246/origin-money-game)' },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
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

function cleanText(value = '') {
  return String(value)
    .replace(/[—–]/g, '-')
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

function entries(record, field) {
  return record.content?.freetext?.[field] || [];
}

function formatYear(value) {
  return value < 0 ? `${Math.abs(value)} BCE` : String(value);
}

function dateDetails(record) {
  const dated = entries(record, 'date')
    .map((entry) => cleanText(entry.content))
    .find((value) => /\d{3,4}/.test(value));
  if (!dated) return null;
  const values = [...dated.matchAll(/(?<!\d)(\d{3,4})(?!\d)/g)]
    .map((match) => Number(match[1]));
  if (!values.length) return null;
  const isBce = /\b(?:BCE|BC)\b/i.test(dated);
  const years = values.map((value) => isBce ? -value : value);
  const minimum = Math.min(...years);
  const maximum = Math.max(...years);
  if (minimum < EARLIEST_YEAR || maximum > LATEST_YEAR) return null;
  return {
    label: minimum === maximum ? formatYear(minimum) : `${formatYear(minimum)}-${formatYear(maximum)}`,
    minimum,
    maximum,
  };
}

function objectType(record) {
  const types = record.content?.indexedStructured?.object_type?.map((value) => value.toLowerCase()) || [];
  const objectNames = entries(record, 'objectType').map((entry) => cleanText(entry.content).toLowerCase());
  if ([...types, ...objectNames].some((value) => /\bingot\b/.test(value))) return '';
  if (types.includes('coins (money)')) return 'coin';
  if (types.some((value) => value === 'paper money' || value.includes('paper money'))) return 'banknote';
  return '';
}

function productionPlace(record) {
  const place = entries(record, 'place').find((entry) => /place made|made at|minted/i.test(entry.label));
  if (!place) return null;
  const label = cleanText(place.content);
  const segments = label.split(/[:,]/).map(cleanText).filter(Boolean);
  if (segments.length < 2) return null;
  const point = record.content?.indexedStructured?.geoLocation
    ?.map((item) => item.points?.point)
    .find(Boolean);
  const lat = Number(point?.latitude?.content);
  const lng = Number(point?.longitude?.content);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    label,
    lat,
    lng,
    specificity: segments.length >= 3 ? 'city' : 'region',
  };
}

function sideDescriptions(record) {
  const notes = entries(record, 'notes');
  const front = notes
    .filter((entry) => /^Obverse\b/i.test(entry.content))
    .map((entry) => cleanText(entry.content))
    .join(' ');
  const back = notes
    .filter((entry) => /^Reverse\b/i.test(entry.content))
    .map((entry) => cleanText(entry.content))
    .join(' ');
  if (!front || !back) return null;
  return { front: front.slice(0, 180), back: back.slice(0, 180) };
}

function pairedImages(record) {
  const media = record.content?.descriptiveNonRepeating?.online_media?.media || [];
  const cc0Images = media.filter((item) => (
    item.type === 'Images'
    && item.usage?.access === 'CC0'
    && /^https:\/\/ids\.si\.edu\/ids\/deliveryService\?id=/i.test(item.content || '')
  ));
  if (cc0Images.length < 2) return null;
  return cc0Images.slice(0, 2).map((item) => `${item.content}&max=1400`);
}

function issuerName(record, place) {
  const preferred = entries(record, 'name').find((entry) => (
    /issuing authority|issuer|authority|ruler|maker/i.test(entry.label)
    && !/^unknown$/i.test(cleanText(entry.content))
  ));
  return cleanText(preferred?.content || place.label.split(/[:,]/)[0]);
}

function material(record) {
  return cleanText(entries(record, 'physicalDescription')
    .find((entry) => /material/i.test(entry.content))?.content || '');
}

function parseRecord(record) {
  counters.scanned += 1;
  const type = objectType(record);
  if (!type) return null;
  counters.currencyObjects += 1;

  const title = cleanText(record.title || record.content?.descriptiveNonRepeating?.title?.content);
  const recordId = cleanText(record.content?.descriptiveNonRepeating?.record_ID);
  if (!title || !recordId || /^(?:coin|paper money)$/i.test(title)) {
    addCount('rejected', 'generic_or_missing_title');
    return null;
  }
  const dates = dateDetails(record);
  if (!dates) {
    addCount('rejected', 'missing_or_out_of_range_date');
    return null;
  }
  const noteText = entries(record, 'notes').map((entry) => cleanText(entry.content)).join(' ');
  if (/authenticity.+(?:question|doubt)|forgery|counterfeit|replica|modern copy/i.test(noteText)) {
    addCount('rejected', 'inauthentic_or_questioned');
    return null;
  }
  const place = productionPlace(record);
  if (!place) {
    addCount('rejected', 'missing_specific_geocoded_production_place');
    return null;
  }
  const images = pairedImages(record);
  if (!images) {
    addCount('rejected', 'missing_paired_cc0_images');
    return null;
  }
  const sides = sideDescriptions(record);
  if (!sides) {
    addCount('rejected', 'missing_side_descriptions');
    return null;
  }

  const articleUrl = `https://americanhistory.si.edu/collections/object/${recordId}`;
  const issuer = issuerName(record, place);
  const objectMaterial = material(record);
  const displayTitle = /^\d+(?:\.\d+)?\s+(?:dollars?|cents?|thalers?|gulden)$/i.test(title)
    ? `${title}, ${place.label}, ${dates.label}`
    : title;
  counters.eligible += 1;

  return {
    recordId,
    id: `si-${slug(recordId)}`,
    title: displayTitle,
    type,
    issuer,
    year: dates.label,
    department: 'Smithsonian NMAH',
    place: { label: place.label, href: articleUrl },
    blurb: cleanText([
      objectMaterial ? `${objectMaterial}.` : '',
      `Front: ${sides.front}.`,
      `Back: ${sides.back}.`,
    ].join(' ')).slice(0, 420),
    sourceUrl: articleUrl,
    articleUrl,
    anchor: {
      lat: place.lat,
      lng: place.lng,
      label: place.label,
      method: 'production_place',
      radiusKm: place.specificity === 'city' ? 100 : 300,
      sourceUrl: articleUrl,
    },
    image: {
      url: images[0],
      backUrl: images[1],
      alt: `Front of ${displayTitle}`,
      backAlt: `Back of ${displayTitle}`,
      author: 'Smithsonian Institution',
      license: 'CC0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      filePage: articleUrl,
    },
  };
}

const index = await fetchText(INDEX_URL);
const shardUrls = index.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
let completed = 0;
const shardResults = await mapLimit(shardUrls, FETCH_CONCURRENCY, async (url) => {
  const text = await fetchText(url);
  const accepted = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = parseRecord(JSON.parse(line));
      if (parsed) accepted.push(parsed);
    } catch {
      addCount('rejected', 'malformed_record');
    }
  }
  completed += 1;
  if (completed % 16 === 0 || completed === shardUrls.length) {
    console.log(`Scanned ${completed}/${shardUrls.length} Smithsonian shards...`);
  }
  return accepted;
});

const smithsonian = shardResults.flat();
const mantis = CURRENT_MONEY.filter((item) => item.id.startsWith('ans-'));
const usedTitles = new Set(mantis.map((item) => item.title.toLowerCase()));
const mergedSmithsonian = [];
for (const item of smithsonian.sort((a, b) => hash(a.recordId) - hash(b.recordId))) {
  const titleKey = item.title.toLowerCase();
  if (usedTitles.has(titleKey)) {
    addCount('excluded', 'duplicate_title');
    continue;
  }
  usedTitles.add(titleKey);
  mergedSmithsonian.push(item);
}

const combined = [...mantis, ...mergedSmithsonian].sort((a, b) => a.id.localeCompare(b.id));
const generatedAt = new Date().toISOString();
const moneyJs = `// Generated by the ORIGIN source importers on ${generatedAt}.\n` +
  `// Metadata and image rights are recorded per object.\n` +
  `export const MONEY = ${JSON.stringify(combined, null, 2)};\n`;
const dailyIds = [...combined]
  .sort((a, b) => hash(`daily:${a.recordId}`) - hash(`daily:${b.recordId}`) || a.id.localeCompare(b.id))
  .map((item) => item.id);
const dailyJs = `// Generated by the ORIGIN source importers on ${generatedAt}.\n` +
  `// This checked-in order is the deterministic daily puzzle schedule.\n` +
  `export const DAILY_IDS = ${JSON.stringify(dailyIds, null, 2)};\n`;

await writeFile(path.join(ROOT, 'src/money.generated.js'), moneyJs);
await writeFile(path.join(ROOT, 'src/daily.generated.js'), dailyJs);
await writeFile(path.join(ROOT, 'data/smithsonian-quality-report.json'), `${JSON.stringify({
  generatedAt,
  source: SOURCE_NAME,
  sourceIndex: INDEX_URL,
  admissionRules: [
    'coin or paper-money object in the National Museum of American History',
    'documented date between 500 BCE and 1925',
    'explicit geocoded place-made metadata more specific than a country',
    'at least two CC0 image assets',
    'descriptions for both obverse and reverse',
    'non-generic object title',
    'not an ingot, forgery, counterfeit, replica, modern copy, or object of questioned authenticity',
  ],
  shardsRead: shardUrls.length,
  recordsScanned: counters.scanned,
  currencyObjects: counters.currencyObjects,
  eligibleBeforeDeduplication: counters.eligible,
  accepted: mergedSmithsonian.length,
  coins: mergedSmithsonian.filter((item) => item.type === 'coin').length,
  banknotes: mergedSmithsonian.filter((item) => item.type === 'banknote').length,
  rejected: counters.rejected,
  excludedAfterValidation: counters.excluded,
  combinedCorpus: combined.length,
}, null, 2)}\n`);

console.log(`Added ${mergedSmithsonian.length} Smithsonian records to ${mantis.length} MANTIS records (${combined.length} total).`);
