import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MONEY as CURRENT_MONEY } from '../src/money.generated.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SEARCH_API = 'https://www.britishmuseum.org/api/_search';
const OBJECT_API = 'https://www.britishmuseum.org/api/_object';
const COLLECTION_URL = 'https://www.britishmuseum.org/collection/search?object=coin';
const IMAGE_TERMS_URL = 'https://www.britishmuseum.org/terms-use/copyright-and-permissions/images-and-photography';
const LICENSE_URL = 'https://creativecommons.org/licenses/by-nc-sa/4.0/';
const SOURCE_NAME = 'British Museum, Money and Medals';
const FETCH_CONCURRENCY = 6;
const SOURCE_LIMIT = Number(process.env.BRITISH_MUSEUM_LIMIT || 750);
const PER_MINT_LIMIT = 20;
const MAX_PAGES_PER_PLACE_BAND = 5;
const EARLIEST_YEAR = -500;
const LATEST_YEAR = 1925;
const MAX_DATE_SPAN = 100;
const NON_CITY_PLACE_ALIASES = new Set([
  'ifriqiya',
  'iran',
  'kashmir',
  'minas gerais',
  'united kingdom england',
  'united states',
]);

const DATE_BANDS = [
  ...[[500, 401], [400, 301], [300, 201], [200, 101], [100, 1]].map(([from, to]) => ({
    id: `${from}-${to}-bce`, from, to, era: 'bc',
  })),
  ...[[1, 199], [200, 399], [400, 599], [600, 799], [800, 999], [1000, 1199], [1200, 1399],
    [1400, 1499], [1500, 1599], [1600, 1699], [1700, 1799], [1800, 1849], [1850, 1899],
    [1900, 1925]].map(([from, to]) => ({ id: `${from}-${to}`, from, to, era: 'ad' })),
];

const counters = {
  dateBandQueries: 0,
  placeFacetsMatched: 0,
  targetedPlaceQueries: 0,
  listingPagesRead: 0,
  searchHitsSeen: 0,
  candidatesDiscovered: 0,
  detailRecordsScanned: 0,
  eligibleBeforeSelection: 0,
  rejectedBeforeDetail: {},
  rejected: {},
  excludedAfterValidation: {},
};
const unmatchedProductionPlaces = new Map();

function addCount(bucket, reason, amount = 1) {
  counters[bucket][reason] = (counters[bucket][reason] || 0) + amount;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson(url) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          Referer: COLLECTION_URL,
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'User-Agent': 'Mozilla/5.0 (compatible; OriginMoneyGame/2.3; +https://github.com/JenS246/origin-money-game)',
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await sleep(700 * (attempt + 1));
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

function cleanText(value = '') {
  return decodeHtml(value)
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function normalizePlace(value = '') {
  return cleanText(value)
    .replace(/^(?:minted|made|issued|produced)\s+(?:in|at|by):?\s*/i, '')
    .replace(/\((?:city|town|village|municipality|district|province|state|region|historic[^)]*|England|France|Italy|Germany|Greece|Turkey|China|Iran|Iraq|India|Syria|Spain|Mexico|USA|United States)\)/gi, ' ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(?:the|mint|monnaie|facility|branch)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(value) {
  return String(value)
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

function formatYear(value) {
  return value < 0 ? `${Math.abs(value)} BCE` : String(value);
}

function centuryBounds(century, isBce, qualifier) {
  let minimum = isBce ? -century * 100 : Math.max(1, (century - 1) * 100);
  let maximum = isBce ? -((century - 1) * 100) - 1 : century * 100 - 1;
  const span = maximum - minimum + 1;
  if (qualifier === 'early') maximum = minimum + Math.floor(span / 3) - 1;
  if (qualifier === 'mid' || qualifier === 'middle') {
    minimum += Math.floor(span / 3);
    maximum = minimum + Math.floor(span / 3) - 1;
  }
  if (qualifier === 'late') minimum = maximum - Math.floor(span / 3) + 1;
  return [minimum, maximum];
}

function dateDetails(value) {
  const text = cleanText(value).replace(/\bcirca\b|\bca\.?\b|\bc\.\s*/gi, ' ');
  if (!text) return null;

  const centuries = [];
  const centuryPattern = /\b(?:(early|mid|middle|late)\s*)?(\d{1,2})(?:st|nd|rd|th)C\b(?:\s*\((early|mid|middle|late)\)|\s+(early|mid|middle|late))?\s*(BC|BCE|AD|CE)?/gi;
  for (const match of text.matchAll(centuryPattern)) {
    centuries.push({
      century: Number(match[2]),
      qualifier: (match[1] || match[3] || match[4] || '').toLowerCase(),
      era: (match[5] || '').toUpperCase(),
    });
  }
  if (centuries.length) {
    const hasBce = /\b(?:BC|BCE)\b/i.test(text);
    const hasCe = /\b(?:AD|CE)\b/i.test(text);
    const globalBce = hasBce && !hasCe;
    const bounds = centuries.flatMap((item) => centuryBounds(
      item.century,
      /^BC/.test(item.era) || (!item.era && globalBce),
      item.qualifier,
    ));
    const minimum = Math.min(...bounds);
    const maximum = Math.max(...bounds);
    if (minimum < EARLIEST_YEAR || maximum > LATEST_YEAR || maximum - minimum > MAX_DATE_SPAN) return null;
    return {
      label: minimum === maximum ? formatYear(minimum) : `${formatYear(minimum)}-${formatYear(maximum)}`,
      minimum,
      maximum,
      sourceLabel: cleanText(value),
    };
  }

  const explicitText = text.replace(/\([^)]*\)/g, ' ');
  const startsWithEra = explicitText.match(/^\s*(BC|BCE|AD|CE)\b/i)?.[1]?.toUpperCase() || '';
  const trailingEra = explicitText.match(/\d{1,4}\s*(BC|BCE|AD|CE)\s*$/i)?.[1]?.toUpperCase() || '';
  const years = [];
  const yearPattern = /\b(?:(AD|CE|BC|BCE)\s*)?(\d{1,4})(?:\s*(BC|BCE|AD|CE))?\b/gi;
  for (const match of explicitText.matchAll(yearPattern)) {
    const era = (match[1] || match[3] || startsWithEra || trailingEra || 'AD').toUpperCase();
    const raw = Number(match[2]);
    years.push(/^BC/.test(era) ? -raw : raw);
  }
  if (!years.length) return null;
  const minimum = Math.min(...years);
  const maximum = Math.max(...years);
  if (minimum < EARLIEST_YEAR || maximum > LATEST_YEAR || maximum - minimum > MAX_DATE_SPAN) return null;
  return {
    label: minimum === maximum ? formatYear(minimum) : `${formatYear(minimum)}-${formatYear(maximum)}`,
    minimum,
    maximum,
    sourceLabel: cleanText(value),
  };
}

function aliasCandidates(label) {
  const candidates = new Set([normalizePlace(label)]);
  const first = cleanText(label).split(/[:,]/)[0];
  if (first) candidates.add(normalizePlace(first));
  return [...candidates].filter((value) => value.length >= 3);
}

function buildGazetteer(records) {
  const aliases = new Map();
  for (const item of records) {
    if (!item.anchor || item.anchor.method === 'representative_point') continue;
    for (const alias of aliasCandidates(item.anchor.label)) {
      if (NON_CITY_PLACE_ALIASES.has(alias)) continue;
      const place = {
        label: item.anchor.label,
        lat: item.anchor.lat,
        lng: item.anchor.lng,
        radiusKm: item.anchor.radiusKm,
        sourceUrl: item.anchor.sourceUrl,
      };
      const existing = aliases.get(alias);
      if (!existing) aliases.set(alias, place);
      else if (Math.abs(existing.lat - place.lat) > 0.2 || Math.abs(existing.lng - place.lng) > 0.2) aliases.set(alias, null);
    }
  }
  return aliases;
}

const BASE_RECORDS = CURRENT_MONEY.filter((item) => !item.id.startsWith('bm-'));
const gazetteer = buildGazetteer(BASE_RECORDS);

function resolvePlace(value) {
  const normalized = normalizePlace(value);
  if (!normalized || /^(?:unknown|uncertain|not recorded|various)$/.test(normalized)) return null;
  const direct = gazetteer.get(normalized);
  if (direct) return direct;
  const first = normalized.split(/\s+(?:province|state|region|district)\b/)[0];
  return gazetteer.get(first) || null;
}

function searchUrl({ band, page = 0, place = '' }) {
  const params = new URLSearchParams();
  params.append('object[]', 'coin');
  params.set('image', 'true');
  params.set('dateFrom', String(band.from));
  params.set('eraFrom', band.era);
  params.set('dateTo', String(band.to));
  params.set('eraTo', band.era);
  if (place) params.set('place', place);
  params.set('view', 'grid');
  params.set('sort', 'object_name__asc');
  params.set('page', String(page));
  return `${SEARCH_API}?${params}`;
}

function fieldValues(template, key) {
  const raw = template?.[key];
  const items = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  return items.map((item) => cleanText(typeof item === 'object' ? item.value : item)).filter(Boolean);
}

function parseTemplate(source, variant) {
  const raw = source?.['@template']?.[variant];
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function uniqueObjectId(source) {
  return source?.identifier?.find((item) => item.type === 'unique object id')?.unique_object_id
    || source?.identifier?.find((item) => item.type === 'unique object id')?.value
    || '';
}

function isExactCoin(source) {
  const names = (source?.name || []).map((item) => cleanText(item.value)).filter(Boolean);
  return names.length === 1 && names[0].toLowerCase() === 'coin';
}

function qualifyingMedia(source) {
  return (source?.multimedia || [])
    .filter((item) => (
      item?.['@admin']?.status === 'public'
      && item?.use?.free === true
      && item?.use?.warning !== true
      && item?.use?.collection === true
      && /Trustees of the British Museum/i.test(item?.legal?.credit || '')
      && item?.['@processed']?.large?.location
    ))
    .sort((a, b) => Number(a.sequence?.value || 0) - Number(b.sequence?.value || 0));
}

function imageDimensions(item) {
  const dimensions = item?.['@processed']?.large?.measurements?.dimensions || [];
  return {
    width: Number(dimensions.find((entry) => entry.dimension === 'width')?.value || 0),
    height: Number(dimensions.find((entry) => entry.dimension === 'height')?.value || 0),
  };
}

function isCompositeImage(item) {
  const { width, height } = imageDimensions(item);
  if (!width || !height) return false;
  const ratio = Math.max(width / height, height / width);
  return ratio >= 1.55;
}

function pairedSideMedia(source) {
  const pathFor = (item) => item?.['@processed']?.large?.location || '';
  const media = qualifyingMedia(source).filter((item) => (
    !isCompositeImage(item)
    && !/(?:group|contact.?sheet|multiple|[_\-.]obvs(?:[_\-.]|$)|[_\-.]revs(?:[_\-.]|$))/i.test(pathFor(item))
  ));
  const obverse = media.find((item) => /(?:^|[_\-.])(obv|obverse)(?:[_\-.]|$)/i.test(pathFor(item)));
  const reverse = media.find((item) => /(?:^|[_\-.])(rev|reverse)(?:[_\-.]|$)/i.test(pathFor(item)));
  if (obverse && reverse && obverse !== reverse) return [obverse, reverse];
  return media.length === 2 ? media : null;
}

function prefilterHit(hit, band) {
  counters.searchHitsSeen += 1;
  const source = hit?._source;
  const recordId = uniqueObjectId(source);
  if (!recordId) {
    addCount('rejectedBeforeDetail', 'missing_unique_object_id');
    return null;
  }
  if (!isExactCoin(source)) {
    addCount('rejectedBeforeDetail', 'not_exactly_one_coin_object_type');
    return null;
  }
  if (qualifyingMedia(source).length < 2) {
    addCount('rejectedBeforeDetail', 'missing_paired_free_public_images');
    return null;
  }
  const brief = parseTemplate(source, 'brief');
  if (!fieldValues(brief, 'Production date').length || !fieldValues(brief, 'Production place').length) {
    addCount('rejectedBeforeDetail', 'missing_date_or_production_place');
    return null;
  }
  return { recordId, bandId: band.id };
}

function mediaUrl(item) {
  return `https://media.britishmuseum.org/media/${item['@processed'].large.location}`;
}

function removeRolePrefix(value) {
  return cleanText(value).replace(/^(?:Ruler|Issuer|Authority|Governor|Moneyer|Minted by|Made by|Issued by):\s*/i, '');
}

function sentence(value) {
  const text = cleanText(value).replace(/[.]+$/, '');
  return text ? `${text}.` : '';
}

function parseObject(payload, candidate) {
  counters.detailRecordsScanned += 1;
  const source = payload?.hits?.hits?.[0]?._source;
  if (!source) {
    addCount('rejected', 'missing_object_record');
    return null;
  }
  const full = parseTemplate(source, 'full');
  const objectTypes = fieldValues(full, 'Object Type');
  if (objectTypes.length !== 1 || objectTypes[0].toLowerCase() !== 'coin') {
    addCount('rejected', 'not_catalogued_as_a_coin');
    return null;
  }
  if (!fieldValues(full, 'Department').some((value) => /Money and Medals/i.test(value))) {
    addCount('rejected', 'not_money_and_medals');
    return null;
  }

  const denomination = fieldValues(full, 'Denomination')[0];
  const museumNumber = fieldValues(full, 'Museum number')[0] || fieldValues(full, 'Registration number')[0];
  if (!denomination || !museumNumber) {
    addCount('rejected', 'missing_denomination_or_museum_number');
    return null;
  }
  const searchableText = JSON.stringify(full);
  if (/counterfeit|forgery|forged|replica|reproduction|modern copy|electrotype|imitation|fantasy|false coin|fake/i.test(searchableText)) {
    addCount('rejected', 'inauthentic_or_non_currency_object');
    return null;
  }

  const dates = dateDetails(fieldValues(full, 'Production date')[0]);
  if (!dates) {
    addCount('rejected', 'missing_imprecise_or_out_of_range_date');
    return null;
  }
  const productionPlace = fieldValues(full, 'Production place')
    .find((value) => /^(?:Minted|Made|Produced)\s+(?:in|at):/i.test(value));
  const anchor = resolvePlace(productionPlace);
  if (!productionPlace || !anchor) {
    addCount('rejected', 'missing_or_unresolved_specific_mint');
    const key = productionPlace || '(missing)';
    unmatchedProductionPlaces.set(key, (unmatchedProductionPlaces.get(key) || 0) + 1);
    return null;
  }

  const descriptions = fieldValues(full, 'Description');
  if (descriptions.length < 3 || !descriptions[1] || !descriptions[2]) {
    addCount('rejected', 'missing_obverse_or_reverse_description');
    return null;
  }
  const images = pairedSideMedia(source);
  if (!images) {
    addCount('rejected', 'missing_unambiguous_paired_licensed_side_images');
    return null;
  }

  const authority = removeRolePrefix(fieldValues(full, 'Authority')[0] || '');
  const culture = removeRolePrefix(fieldValues(full, 'Cultures/periods')[0] || '');
  const issuer = authority || culture || anchor.label;
  const denominationName = denomination.charAt(0).toUpperCase() + denomination.slice(1);
  const title = authority
    ? `${denominationName} of ${authority}, ${dates.label}`
    : `${denominationName}, ${anchor.label}, ${dates.label}`;
  const material = fieldValues(full, 'Materials')[0];
  const articleUrl = `https://www.britishmuseum.org/collection/object/${candidate.recordId}`;
  const imagePage = `https://www.britishmuseum.org/collection/image/${images[0]['@admin'].id}`;
  counters.eligibleBeforeSelection += 1;

  return {
    recordId: candidate.recordId,
    id: `bm-${slug(candidate.recordId)}`,
    title,
    type: 'coin',
    issuer,
    year: dates.label,
    department: 'British Museum',
    place: { label: anchor.label, href: anchor.sourceUrl },
    blurb: cleanText([
      material ? sentence(material) : '',
      sentence(`Front: ${descriptions[1]}`),
      sentence(`Back: ${descriptions[2]}`),
      dates.sourceLabel !== dates.label ? sentence(`Museum date: ${dates.sourceLabel}`) : '',
    ].filter(Boolean).join(' ')).slice(0, 420),
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
      url: mediaUrl(images[0]),
      backUrl: mediaUrl(images[1]),
      alt: `Front of ${title}`,
      backAlt: `Back of ${title}`,
      author: 'The Trustees of the British Museum',
      license: 'CC BY-NC-SA 4.0',
      licenseUrl: LICENSE_URL,
      filePage: imagePage,
    },
  };
}

function interleave(groups) {
  const result = [];
  const longest = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < longest; index += 1) {
    for (const group of groups) if (group[index]) result.push(group[index]);
  }
  return result;
}

console.log(`Discovering British Museum mint facets across ${DATE_BANDS.length} date bands...`);
const bandFacetResponses = await mapLimit(DATE_BANDS, FETCH_CONCURRENCY, async (band) => {
  const response = await fetchJson(searchUrl({ band }));
  counters.dateBandQueries += 1;
  const facets = response?.aggregations?.place?.buckets || [];
  return {
    band,
    places: facets.map((item) => item.key).filter((place) => resolvePlace(place)),
  };
});

const targeted = bandFacetResponses.flatMap(({ band, places }) => places.map((place) => ({ band, place })));
counters.placeFacetsMatched = targeted.length;
console.log(`Matched ${targeted.length} date-band/place facets to audited mint coordinates.`);

let completedPlaces = 0;
const candidateGroups = await mapLimit(targeted, FETCH_CONCURRENCY, async ({ band, place }) => {
  const first = await fetchJson(searchUrl({ band, place }));
  counters.targetedPlaceQueries += 1;
  const total = Number(first?.hits?.total?.value || 0);
  const pageCount = Math.min(MAX_PAGES_PER_PLACE_BAND, Math.ceil(total / 100));
  const remaining = pageCount > 1
    ? await mapLimit(Array.from({ length: pageCount - 1 }, (_, index) => index + 1), 2, async (page) => (
      fetchJson(searchUrl({ band, place, page }))
    ))
    : [];
  counters.listingPagesRead += pageCount;
  completedPlaces += 1;
  if (completedPlaces % 50 === 0 || completedPlaces === targeted.length) {
    console.log(`Read ${completedPlaces}/${targeted.length} targeted British Museum searches...`);
  }
  return [first, ...remaining]
    .flatMap((response) => response?.hits?.hits || [])
    .map((hit) => prefilterHit(hit, band))
    .filter(Boolean);
});

const candidatesByBand = new Map(DATE_BANDS.map((band) => [band.id, new Map()]));
for (const candidate of candidateGroups.flat()) {
  candidatesByBand.get(candidate.bandId)?.set(candidate.recordId, candidate);
}
const candidateGroupsByBand = DATE_BANDS.map((band) => (
  [...candidatesByBand.get(band.id).values()]
    .sort((a, b) => hash(`bm:${a.recordId}`) - hash(`bm:${b.recordId}`))
));
const interleavedCandidates = interleave(candidateGroupsByBand);
const candidates = [...new Map(interleavedCandidates.map((item) => [item.recordId, item])).values()];
counters.candidatesDiscovered = candidates.length;
console.log(`Prefiltered ${counters.candidatesDiscovered} unique paired-image coin candidates.`);

const usedRecordIds = new Set(BASE_RECORDS.map((item) => item.recordId));
const usedTitles = new Set(BASE_RECORDS.map((item) => item.title.toLowerCase()));
const mintCounts = new Map();
const accepted = [];
const scannedCandidateIds = new Set();

for (let offset = 0; offset < candidates.length && accepted.length < SOURCE_LIMIT; offset += 100) {
  const batch = candidates.slice(offset, offset + 100).filter((item) => !scannedCandidateIds.has(item.recordId));
  for (const item of batch) scannedCandidateIds.add(item.recordId);
  const records = await mapLimit(batch, FETCH_CONCURRENCY, async (candidate) => {
    try {
      return parseObject(await fetchJson(`${OBJECT_API}?id=${encodeURIComponent(candidate.recordId)}`), candidate);
    } catch {
      addCount('rejected', 'object_request_failed');
      return null;
    }
  });
  for (const item of records.filter(Boolean)) {
    if (accepted.length >= SOURCE_LIMIT) break;
    if (usedRecordIds.has(item.recordId)) {
      addCount('excludedAfterValidation', 'duplicate_record_id');
      continue;
    }
    const titleKey = item.title.toLowerCase();
    if (usedTitles.has(titleKey)) {
      addCount('excludedAfterValidation', 'duplicate_issue_title');
      continue;
    }
    const mintKey = normalizePlace(item.anchor.label);
    if ((mintCounts.get(mintKey) || 0) >= PER_MINT_LIMIT) {
      addCount('excludedAfterValidation', 'per_mint_variety_cap');
      continue;
    }
    usedRecordIds.add(item.recordId);
    usedTitles.add(titleKey);
    mintCounts.set(mintKey, (mintCounts.get(mintKey) || 0) + 1);
    accepted.push(item);
  }
  console.log(`Checked ${Math.min(offset + batch.length, candidates.length)}/${candidates.length} details; accepted ${accepted.length}/${SOURCE_LIMIT}...`);
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
await writeFile(path.join(ROOT, 'data/british-museum-quality-report.json'), `${JSON.stringify({
  generatedAt,
  source: SOURCE_NAME,
  sourceCollection: COLLECTION_URL,
  sourceSearchApi: SEARCH_API,
  imageTerms: IMAGE_TERMS_URL,
  license: 'CC BY-NC-SA 4.0',
  sourceLimit: SOURCE_LIMIT,
  perMintVarietyCap: PER_MINT_LIMIT,
  discoveryMethod: 'Top production-place facets in 19 date bands are matched to the existing audited mint gazetteer, then queried directly. Detail records are deterministically interleaved across date bands.',
  admissionRules: [
    'catalogued only as a coin by the British Museum Department of Money and Medals',
    'documented production date from 500 BCE through 1925 with a range no wider than 100 years',
    'specific production place resolvable to an audited mint-city coordinate already in the corpus',
    'documented denomination and non-generic issue identity',
    'separate obverse and reverse descriptions',
    'an unambiguous pair of separate obverse and reverse photographs, excluding composites, contact sheets, group images, and plural-side assets',
    'both side photographs explicitly marked public and free with no warning and credited to the Trustees',
    'photographs presented under the Museum image page CC BY-NC-SA 4.0 notice',
    'not described as counterfeit, forged, replica, reproduction, modern copy, electrotype, imitation, fantasy, false, or fake',
    'deduplicated against existing issues and capped per mint for geographic variety',
  ],
  dateBands: DATE_BANDS.map((band) => band.id),
  ...counters,
  detailRecordsScanned: scannedCandidateIds.size,
  accepted: accepted.length,
  acceptedMints: mintCounts.size,
  coins: accepted.length,
  unmatchedProductionPlaces: [...unmatchedProductionPlaces.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 100)
    .map(([place, count]) => ({ place, count })),
  combinedCorpus: combined.length,
}, null, 2)}\n`);

console.log(`Added ${accepted.length} British Museum records to ${BASE_RECORDS.length} existing records (${combined.length} total).`);
