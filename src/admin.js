import MiniSearch from 'https://cdn.jsdelivr.net/npm/minisearch@7.2.0/dist/es/index.js';
import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
} from 'https://esm.sh/@tanstack/virtual-core@3.17.6';
import { MONEY } from './money.generated.js';
import { yearRange } from './scoring.js';

const elements = {
  search: document.querySelector('#collection-search'),
  type: document.querySelector('#type-filter'),
  department: document.querySelector('#department-filter'),
  sort: document.querySelector('#sort-order'),
  count: document.querySelector('#collection-count'),
  scroll: document.querySelector('#collection-scroll'),
  spacer: document.querySelector('#collection-spacer'),
  empty: document.querySelector('#empty-collection'),
};

const searchIndex = new MiniSearch({
  fields: ['title', 'issuer', 'place', 'year', 'department', 'type', 'blurb'],
  storeFields: ['id'],
  searchOptions: {
    prefix: true,
    fuzzy: 0.2,
    boost: { title: 4, issuer: 2, place: 2, year: 2 },
  },
});

searchIndex.addAll(MONEY.map((item) => ({
  id: item.id,
  title: item.title,
  issuer: item.issuer,
  place: item.anchor.label,
  year: item.year,
  department: item.department,
  type: item.type,
  blurb: item.blurb,
})));

const byId = new Map(MONEY.map((item) => [item.id, item]));
let filtered = [...MONEY];
let columns = 1;
let rowHeight = 288;
let virtualizer;
let unmountVirtualizer;
let renderFrame;

function midpoint(item) {
  const range = yearRange(item.year);
  return range ? (range.min + range.max) / 2 : 0;
}

function columnCount() {
  const width = elements.scroll.clientWidth;
  if (width >= 1180) return 4;
  if (width >= 820) return 3;
  if (width >= 540) return 2;
  return 1;
}

function card(item, index) {
  const link = document.createElement('a');
  link.className = 'object-card';
  link.href = item.articleUrl;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.setAttribute('aria-label', `${item.title}. Open ANS record.`);
  link.setAttribute('aria-posinset', String(index + 1));
  link.setAttribute('aria-setsize', String(filtered.length));

  const images = document.createElement('div');
  images.className = 'object-images';
  for (const [url, alt] of [[item.image.url, item.image.alt], [item.image.backUrl, item.image.backAlt]]) {
    const frame = document.createElement('span');
    const image = document.createElement('img');
    image.src = url;
    image.alt = alt;
    image.loading = 'lazy';
    image.decoding = 'async';
    frame.append(image);
    images.append(frame);
  }

  const copy = document.createElement('div');
  copy.className = 'object-copy';
  const title = document.createElement('h2');
  title.textContent = item.title;
  const facts = document.createElement('p');
  facts.textContent = `${item.year} / ${item.type === 'banknote' ? 'banknote' : 'coin'} / ${item.department}`;
  const place = document.createElement('p');
  place.textContent = item.anchor.label;
  copy.append(title, facts, place);
  link.append(images, copy);
  return link;
}

function renderRows(instance = virtualizer) {
  if (!instance) return;
  window.cancelAnimationFrame(renderFrame);
  renderFrame = window.requestAnimationFrame(() => {
    const rows = instance.getVirtualItems();
    elements.spacer.style.height = `${instance.getTotalSize()}px`;
    elements.spacer.replaceChildren(...rows.map((virtualRow) => {
      const row = document.createElement('div');
      row.className = 'virtual-row';
      row.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
      row.style.height = `${virtualRow.size}px`;
      row.style.transform = `translateY(${virtualRow.start}px)`;
      const firstIndex = virtualRow.index * columns;
      for (let offset = 0; offset < columns; offset += 1) {
        const itemIndex = firstIndex + offset;
        if (itemIndex < filtered.length) row.append(card(filtered[itemIndex], itemIndex));
      }
      return row;
    }));
  });
}

function mountVirtualizer() {
  unmountVirtualizer?.();
  columns = columnCount();
  rowHeight = window.innerWidth <= 560 ? 274 : 288;
  virtualizer = new Virtualizer({
    count: Math.ceil(filtered.length / columns),
    getScrollElement: () => elements.scroll,
    estimateSize: () => rowHeight,
    overscan: 2,
    scrollToFn: elementScroll,
    observeElementRect,
    observeElementOffset,
    onChange: (instance) => renderRows(instance),
  });
  unmountVirtualizer = virtualizer._didMount();
  virtualizer._willUpdate();
  elements.scroll.scrollTop = 0;
  renderRows();
}

function applyFilters() {
  const query = elements.search.value.trim();
  const matches = query
    ? searchIndex.search(query).map((result) => byId.get(result.id)).filter(Boolean)
    : [...MONEY];
  filtered = matches.filter((item) => (
    (elements.type.value === 'all' || item.type === elements.type.value)
    && (elements.department.value === 'all' || item.department === elements.department.value)
  ));

  if (elements.sort.value === 'oldest') filtered.sort((a, b) => midpoint(a) - midpoint(b));
  if (elements.sort.value === 'newest') filtered.sort((a, b) => midpoint(b) - midpoint(a));
  if (elements.sort.value === 'title' || (elements.sort.value === 'relevance' && !query)) {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  }

  elements.count.textContent = `${filtered.length.toLocaleString()} of ${MONEY.length.toLocaleString()} objects`;
  elements.empty.hidden = filtered.length > 0;
  elements.scroll.setAttribute('aria-busy', 'false');
  mountVirtualizer();
}

function boot() {
  for (const department of [...new Set(MONEY.map((item) => item.department))].sort()) {
    const option = document.createElement('option');
    option.value = department;
    option.textContent = department;
    elements.department.append(option);
  }
  for (const control of [elements.search, elements.type, elements.department, elements.sort]) {
    control.addEventListener(control === elements.search ? 'input' : 'change', applyFilters);
  }
  let resizeFrame;
  window.addEventListener('resize', () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      if (columnCount() !== columns) mountVirtualizer();
    });
  });
  applyFilters();
}

boot();
