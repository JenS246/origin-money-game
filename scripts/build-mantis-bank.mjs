import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FEED_URL = 'https://numismatics.org/search/feed/';
const NUDS_URL = 'https://numismatics.org/search/apis/getNuds';
const USER_AGENT = 'OriginMoneyGame/2.0 (https://github.com/JenS246/origin-money-game)';
const BASE_QUERY = 'imagesavailable:true AND year_num:[* TO 1925] AND productionPlace_facet:[* TO *]';
const DEPARTMENTS = ['Byzantine', 'East Asian', 'Greek', 'Islamic', 'Latin American', 'Medieval', 'North American', 'Roman', 'South Asian'];
const COINS_PER_DEPARTMENT = 7;
const PAPER_STREAMS = [
  { place: 'New York', relatedPlace: 'United States', quota: 4 },
  { place: 'New York City (N.Y.)', relatedPlace: 'United States', quota: 3 },
  { place: 'Philadelphia (Pa.)', relatedPlace: 'United States', quota: 4 },
  { place: 'Boston (Mass.)', relatedPlace: 'United States', quota: 3 },
  { place: 'New Orleans (La.)', relatedPlace: 'United States', quota: 2 },
];
const PLACE_OVERRIDES = new Map([
  ['New York', { lat: 40.7128, lng: -74.006, label: 'New York' }],
  ['New York City (N.Y.)', { lat: 40.7128, lng: -74.006, label: 'New York' }],
  ['Philadelphia (Pa.)', { lat: 39.9526, lng: -75.1652, label: 'Philadelphia' }],
  ['Boston (Mass.)', { lat: 42.3601, lng: -71.0589, label: 'Boston' }],
  ['New Orleans (La.)', { lat: 29.9511, lng: -90.0715, label: 'New Orleans' }],
]);

const counters = {
  fetched: 0,
  parsed: 0,
  rejected: {},
};

function reject(reason) {
  counters.rejected[reason] = (counters.rejected[reason] || 0) + 1;
  return null;
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError;
}

function chunks(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

function decodeXml(value = '') {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanText(value = '') {
  return decodeXml(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function allElements(xml, name) {
  const pattern = new RegExp(
    `<(?:(?:[\\w-]+):)?${name}\\b([^>]*)>([\\s\\S]*?)<\\/(?:(?:[\\w-]+):)?${name}>`,
    'gi',
  );
  return [...xml.matchAll(pattern)].map((match) => ({ attrs: match[1], inner: match[2], text: cleanText(match[2]) }));
}

function firstText(xml, name) {
  return allElements(xml, name).find((item) => item.text)?.text || '';
}

function attribute(attrs, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeXml(attrs.match(new RegExp(`${escaped}="([^"]*)"`, 'i'))?.[1] || '');
}

function firstByRole(xml, names, role) {
  for (const name of names) {
    const match = allElements(xml, name).find((item) => attribute(item.attrs, 'xlink:role') === role);
    if (match?.text) return match.text;
  }
  return '';
}

function formatYear(standardDate) {
  const value = Number.parseInt(standardDate, 10);
  if (!Number.isFinite(value)) return '';
  return value < 0 ? `${Math.abs(value)} BCE` : `${value}`;
}

function dateDetails(xml) {
  const dated = ['date', 'fromDate', 'toDate']
    .flatMap((name) => allElements(xml, name))
    .filter((item) => /^-?\d{1,4}(?:-\d{2}(?:-\d{2})?)?$/.test(attribute(item.attrs, 'standardDate')));
  if (!dated.length) return null;
  const values = dated.map((item) => attribute(item.attrs, 'standardDate'));
  const years = values.map((value) => Number.parseInt(value, 10)).filter(Number.isFinite);
  if (!years.length || Math.max(...years) > 1925) return null;
  const first = formatYear(values[0]);
  const last = formatYear(values.at(-1));
  return { label: first === last ? first : `${first}-${last}`, values };
}

function productionPlace(xml) {
  return allElements(xml, 'geogname')
    .map((item) => ({
      ...item,
      role: attribute(item.attrs, 'xlink:role'),
      href: attribute(item.attrs, 'xlink:href'),
    }))
    .find((item) => item.role === 'productionPlace');
}

function imageForSide(xml, side) {
  const group = xml.match(new RegExp(`<mets:fileGrp USE="${side}">([\\s\\S]*?)<\\/mets:fileGrp>`, 'i'))?.[1];
  if (!group) return '';
  const archive = group.match(/<mets:file USE="archive"[\s\S]*?<mets:FLocat[^>]*xlink:href="([^"]+)"/i)?.[1];
  return decodeXml(archive || '');
}

function sideDescription(xml, side) {
  const block = allElements(xml, side)[0]?.inner || '';
  const description = firstText(block, 'description');
  const legend = firstText(block, 'legend');
  return cleanText(description || legend).slice(0, 150);
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

function parseRecord(xml) {
  counters.parsed += 1;
  const recordId = firstText(xml, 'recordId');
  const status = firstText(xml, 'publicationStatus');
  const title = firstText(xml, 'title').replace(new RegExp(`\\.?\\s*${recordId.replaceAll('.', '\\.')}$`), '').trim();
  const objectType = firstText(xml, 'objectType');
  const dates = dateDetails(xml);
  const place = productionPlace(xml);
  const frontUrl = imageForSide(xml, 'obverse');
  const backUrl = imageForSide(xml, 'reverse');
  const imageLicense = allElements(xml, 'license').find((item) => attribute(item.attrs, 'for') === 'images');
  const authenticity = firstText(xml, 'authenticity').toLowerCase();
  const denomination = firstText(xml, 'denomination');
  const frontDescription = sideDescription(xml, 'obverse');
  const backDescription = sideDescription(xml, 'reverse');

  if (!recordId || !title || status !== 'approved') return reject('unapproved_or_untitled');
  if (!['Coin', 'Paper Money'].includes(objectType)) return reject('wrong_object_type');
  if (!dates) return reject('missing_or_late_date');
  if (!place?.text || !place.href) return reject('unlinked_production_place');
  if (!frontUrl || !backUrl) return reject('missing_paired_images');
  if (!imageLicense || !/creativecommons\.org\/choose\/mark/i.test(attribute(imageLicense.attrs, 'xlink:href'))) {
    return reject('images_not_public_domain');
  }
  if (/forgery|counterfeit|replica|modern copy/.test(authenticity)) return reject('not_authentic');
  if (!denomination) return reject('missing_denomination');
  if (!frontDescription || !backDescription) return reject('missing_side_descriptions');

  const authority = firstByRole(xml, ['persname', 'corpname', 'famname'], 'authority');
  const state = firstByRole(xml, ['corpname', 'geogname'], 'state');
  const issuerName = firstByRole(xml, ['corpname', 'persname'], 'issuer');
  const region = firstByRole(xml, ['geogname'], 'region');
  const material = firstText(xml, 'material');
  const department = firstText(xml, 'department');
  const issuer = cleanText(state || issuerName || region || authority || place.text);
  const subject = cleanText(authority && authority !== issuer ? authority : '');
  const descriptionParts = [
    `${material ? `${material} ` : ''}${denomination}${subject ? ` issued under ${subject}` : ''}.`,
    `Front: ${frontDescription}.`,
    `Back: ${backDescription}.`,
  ];

  return {
    recordId,
    id: `ans-${slug(recordId)}`,
    title: cleanText(title),
    type: objectType === 'Paper Money' ? 'banknote' : 'coin',
    issuer,
    year: dates.label,
    department,
    place: { label: cleanText(place.text), href: place.href },
    blurb: cleanText(descriptionParts.join(' ')).slice(0, 420),
    sourceUrl: `https://numismatics.org/collection/${encodeURIComponent(recordId)}`,
    image: {
      url: frontUrl,
      backUrl,
      alt: `Front of ${cleanText(title)}`,
      backAlt: `Back of ${cleanText(title)}`,
      author: 'American Numismatic Society',
      license: 'Public Domain Mark',
      licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
    },
  };
}

async function feedIds(query, starts) {
  const pages = await Promise.all(starts.map(async (start) => {
    const url = `${FEED_URL}?q=${encodeURIComponent(query)}&start=${start}`;
    const xml = await fetchText(url);
    return [...xml.matchAll(/<entry>[\s\S]*?<id>([^<]+)<\/id>/g)].map((match) => cleanText(match[1]));
  }));
  return [...new Set(pages.flat())];
}

async function fetchRecords(ids) {
  const records = [];
  for (const batch of chunks(ids, 100)) {
    const xml = await fetchText(`${NUDS_URL}?identifiers=${encodeURIComponent(batch.join('|'))}`);
    counters.fetched += batch.length;
    records.push(...(xml.match(/<nuds(?:\s[^>]*)?>[\s\S]*?<\/nuds>/g) || []));
  }
  return records.map(parseRecord).filter(Boolean);
}

const coordinateCache = new Map();

async function linkedCoordinates(uri, label) {
  if (/^https?:\/\/sws\.geonames\.org\/\d+/i.test(uri)) {
    const identifier = uri.match(/geonames\.org\/(\d+)/i)?.[1];
    const rdf = await fetchText(`https://sws.geonames.org/${identifier}/about.rdf`);
    const lat = Number(cleanText(rdf.match(/<(?:\w+:)?lat>([^<]+)</i)?.[1] || ''));
    const lng = Number(cleanText(rdf.match(/<(?:\w+:)?long>([^<]+)</i)?.[1] || ''));
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng, label };
  }
  if (/wikidata\.org\/(?:entity\/|wiki\/)(Q\d+)/i.test(uri)) {
    const identifier = uri.match(/wikidata\.org\/(?:entity\/|wiki\/)(Q\d+)/i)?.[1];
    const payload = JSON.parse(await fetchText(`https://www.wikidata.org/wiki/Special:EntityData/${identifier}.json`));
    const value = payload.entities?.[identifier]?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    if (value) return { lat: Number(value.latitude), lng: Number(value.longitude), label };
  }
  return null;
}

async function resolveCoordinates(candidate) {
  if (PLACE_OVERRIDES.has(candidate.place.label)) return PLACE_OVERRIDES.get(candidate.place.label);
  if (coordinateCache.has(candidate.place.href)) return coordinateCache.get(candidate.place.href);
  try {
    let result = null;
    if (/^https?:\/\/nomisma\.org\/id\//i.test(candidate.place.href)) {
      const identifier = candidate.place.href.split('/').at(-1);
      const payload = JSON.parse(await fetchText(`https://nomisma.org/id/${encodeURIComponent(identifier)}.jsonld`));
      const location = payload['@graph']?.find((node) => node['geo:lat'] && node['geo:long']);
      const concept = payload['@graph']?.find((node) => node['geo:location']);
      const englishLabel = Array.isArray(concept?.['skos:prefLabel'])
        ? concept['skos:prefLabel'].find((item) => item['@language'] === 'en')?.['@value']
        : concept?.['skos:prefLabel']?.['@value'];
      const definitionValue = Array.isArray(concept?.['skos:definition'])
        ? concept['skos:definition'].find((item) => item['@language'] === 'en')?.['@value']
        : concept?.['skos:definition']?.['@value'];
      if (/\bhistorical region\b|\bregion in\b|\bprovince of\b/i.test(definitionValue || '')) {
        coordinateCache.set(candidate.place.href, null);
        return null;
      }
      const matches = Array.isArray(concept?.['skos:closeMatch'])
        ? concept['skos:closeMatch']
        : concept?.['skos:closeMatch'] ? [concept['skos:closeMatch']] : [];
      const linked = matches
        .map((item) => item['@id'])
        .find((uri) => /sws\.geonames\.org\/\d+|wikidata\.org\/(?:entity\/|wiki\/)Q\d+/i.test(uri || ''));
      result = linked ? await linkedCoordinates(linked, cleanText(englishLabel || candidate.place.label)) : null;
      if (!result && location) {
        result = {
          lat: Number(location['geo:lat']['@value']),
          lng: Number(location['geo:long']['@value']),
          label: cleanText(englishLabel || candidate.place.label),
        };
      }
    } else {
      result = await linkedCoordinates(candidate.place.href, candidate.place.label);
    }
    coordinateCache.set(candidate.place.href, result);
    return result;
  } catch {
    coordinateCache.set(candidate.place.href, null);
    return null;
  }
}

async function selectCandidates(candidates, quota, usedPlaces, usedTitles, method, uniquePlaces = true) {
  const selected = [];
  const ordered = [...candidates].sort((a, b) => hash(a.recordId) - hash(b.recordId));
  for (const candidate of ordered) {
    if (selected.length >= quota) break;
    if (uniquePlaces && usedPlaces.has(candidate.place.href)) continue;
    const titleKey = candidate.title.toLowerCase();
    if (usedTitles.has(titleKey)) continue;
    const coordinates = await resolveCoordinates(candidate);
    if (!coordinates || !Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) {
      reject('unresolvable_coordinates');
      continue;
    }
    if (uniquePlaces) usedPlaces.add(candidate.place.href);
    usedTitles.add(titleKey);
    selected.push({
      ...candidate,
      anchor: {
        ...coordinates,
        method,
        radiusKm: method === 'mint_city' ? 80 : 60,
        sourceUrl: candidate.place.href,
      },
      articleUrl: candidate.sourceUrl,
      image: { ...candidate.image, filePage: candidate.sourceUrl },
    });
  }
  return selected;
}

const usedPlaces = new Set();
const usedTitles = new Set();
const selected = [];

for (const department of DEPARTMENTS) {
  const query = `${BASE_QUERY} AND objectType_facet:"Coin" AND department_facet:"${department}"`;
  const ids = await feedIds(query, [0, 100]);
  const candidates = (await fetchRecords(ids)).filter((item) => item.department === department);
  selected.push(...await selectCandidates(candidates, COINS_PER_DEPARTMENT, usedPlaces, usedTitles, 'mint_city'));
}

for (const stream of PAPER_STREAMS) {
  const query = `${BASE_QUERY} AND objectType_facet:"Paper Money" AND productionPlace_facet:"${stream.place}" AND relatedPlace_facet:"${stream.relatedPlace}"`;
  const ids = await feedIds(query, [0, 100]);
  const candidates = (await fetchRecords(ids)).filter((item) => item.type === 'banknote' && item.place.label === stream.place);
  selected.push(...await selectCandidates(candidates, stream.quota, new Set(), usedTitles, 'printing_facility', false));
}

selected.sort((a, b) => a.id.localeCompare(b.id));
const generatedAt = new Date().toISOString();
const js = `// Generated by scripts/build-mantis-bank.mjs on ${generatedAt}.\n` +
  `// MANTIS metadata: ODbL. Shipped ANS object images: Public Domain Mark.\n` +
  `export const MONEY = ${JSON.stringify(selected, null, 2)};\n`;

await writeFile(path.join(ROOT, 'src/money.generated.js'), js);
await writeFile(
  path.join(ROOT, 'data/quality-report.json'),
  `${JSON.stringify({
    generatedAt,
    source: 'American Numismatic Society MANTIS',
    admissionRules: [
      'approved physical coin or paper money record',
      'documented date no later than 1925',
      'linked production place with resolvable coordinates',
      'production place is not described as a broad historical region or province',
      'matched obverse and reverse images',
      'Public Domain Mark image rights',
      'denomination and descriptions for both sides',
      'not marked as a forgery, counterfeit, replica, or modern copy',
    ],
    fetched: counters.fetched,
    parsed: counters.parsed,
    accepted: selected.length,
    coins: selected.filter((item) => item.type === 'coin').length,
    banknotes: selected.filter((item) => item.type === 'banknote').length,
    rejected: counters.rejected,
  }, null, 2)}\n`,
);

console.log(`Built ${selected.length} MANTIS records (${selected.filter((item) => item.type === 'coin').length} coins, ${selected.filter((item) => item.type === 'banknote').length} banknotes).`);
