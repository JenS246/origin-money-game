import { MONEY } from './money.generated.js';
import { DAILY_IDS } from './daily.generated.js';
import { removeLightEdgeBackground } from './image-matte.js';
import {
  distanceFromAcceptedArea,
  formatYear,
  yearDistance,
} from './scoring.js';
import { getDailyResult, getStats, saveDailyResult } from './storage.js';

const LEAFLET_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js';
const LAUNCH_DATE = Date.UTC(2026, 7, 29);
const DAY_MS = 86_400_000;
const RESULT_MODEL = 5;
const THEME_KEY = 'origin-theme';
const STUDY_GUIDES = [
  {
    label: 'United States',
    image: 'https://numismatics.org/collectionimages/00001899/0000/0000.999.29134.obv.noscale.jpg',
    source: 'https://numismatics.org/collection/0000.999.29134',
    alt: 'South Carolina two dollar note dated 1776',
    marks: [
      { x: 17, y: 17, width: 33, height: 12 },
      { x: 57, y: 51, width: 31, height: 15 },
      { x: 33, y: 3, width: 36, height: 13 },
    ],
    notes: [
      ['Issuer', 'State, city, or bank names are often the strongest location clue.'],
      ['Date', 'Printed dates can place a note within a narrow issue period.'],
      ['Denomination', 'Words and number styles reveal the language and currency system.'],
    ],
  },
  {
    label: 'Japan',
    image: 'https://numismatics.org/collectionimages/19001949/1927/1927.55.1.rev.noscale.jpg',
    source: 'https://numismatics.org/collection/1927.55.1',
    alt: 'Japanese trade dollar with imperial crest, script, and plant motifs',
    marks: [
      { x: 41, y: 6, width: 21, height: 23 },
      { x: 42, y: 29, width: 20, height: 43 },
      { x: 62, y: 20, width: 29, height: 59 },
    ],
    notes: [
      ['Emblem', 'Official crests and seals can identify the issuing authority.'],
      ['Script', 'The writing system may narrow the region before any word is read.'],
      ['Plant motifs', 'Repeated national symbols often survive across many issues.'],
    ],
  },
  {
    label: 'Hong Kong',
    image: 'https://numismatics.org/collectionimages/00001899/0000/0000.999.6012.rev.noscale.jpg',
    source: 'https://numismatics.org/collection/0000.999.6012',
    alt: 'Hong Kong dollar dated 1867 with English and Chinese legends',
    marks: [
      { x: 13, y: 13, width: 73, height: 33 },
      { x: 43, y: 21, width: 18, height: 20 },
      { x: 75, y: 54, width: 15, height: 19 },
    ],
    notes: [
      ['Place name', 'HONG-KONG is written around the field. Read every edge.'],
      ['Local script', 'A second writing system can reveal a colonial or multilingual issue.'],
      ['Date', 'The year helps connect a design to its ruler and historical period.'],
    ],
  },
];

const elements = {
  topbar: document.querySelector('.topbar'),
  home: document.querySelector('#home-screen'),
  homeButton: document.querySelector('#home-button'),
  homeImage: document.querySelector('#home-image'),
  startDaily: document.querySelector('#start-daily'),
  startPractice: document.querySelector('#start-practice'),
  edition: document.querySelector('#edition-label'),
  image: document.querySelector('#money-image'),
  backImage: document.querySelector('#money-image-back'),
  flip: document.querySelector('#money-flip'),
  card: document.querySelector('#money-card'),
  skeleton: document.querySelector('#image-skeleton'),
  yearGuess: document.querySelector('#year-guess'),
  yearGuessValue: document.querySelector('#year-guess-value'),
  submit: document.querySelector('#submit-button'),
  mobileSubmit: document.querySelector('#mobile-submit-button'),
  mapStatus: document.querySelector('#map-status'),
  result: document.querySelector('#result-panel'),
  distance: document.querySelector('#distance-value'),
  dateDistance: document.querySelector('#date-distance-value'),
  resultRoute: document.querySelector('#result-route-line'),
  resultGuessDot: document.querySelector('#result-guess-dot'),
  resultAnswerDot: document.querySelector('#result-answer-dot'),
  answerPlace: document.querySelector('#answer-place'),
  answerTitle: document.querySelector('#answer-title'),
  blurb: document.querySelector('#answer-blurb'),
  targetNote: document.querySelector('#target-note'),
  article: document.querySelector('#article-link'),
  imageCredit: document.querySelector('#image-credit-link'),
  share: document.querySelector('#share-button'),
  shareDialog: document.querySelector('#share-dialog'),
  shareEdition: document.querySelector('#share-edition'),
  shareDistance: document.querySelector('#share-distance'),
  shareYears: document.querySelector('#share-years'),
  shareRoute: document.querySelector('#share-route-line'),
  shareGuessDot: document.querySelector('.share-map-guess'),
  shareAnswerDot: document.querySelector('.share-map-answer'),
  shareSpecimen: document.querySelector('#share-specimen'),
  shareDocumentedYear: document.querySelector('#share-documented-year'),
  copyShare: document.querySelector('#copy-share-button'),
  saveShare: document.querySelector('#save-share-button'),
  next: document.querySelector('#next-button'),
  toast: document.querySelector('#toast'),
  themeColor: document.querySelector('meta[name="theme-color"]'),
  themeButtons: [...document.querySelectorAll('[data-theme-choice]')],
  studyButtons: [...document.querySelectorAll('[data-study-example]')],
  studyImage: document.querySelector('#study-image'),
  studyImageFrame: document.querySelector('.study-image-frame'),
  studyMarks: document.querySelector('#study-marks'),
  studyNotes: document.querySelector('#study-notes'),
  studySource: document.querySelector('#study-source'),
};

let L;
let map;
let mapReady = false;
let guessMarker;
let answerMarker;
let answerRoute;
let answerArea;
let guess = null;
let activeMoney = null;
let mode = 'daily';
let revealed = false;
let lastResult = null;
let yearGuess = 750;
let imageLoadSequence = 0;
let flipDemoTimers = [];
let themeChoice = 'system';
const moneyById = new Map(MONEY.map((item) => [item.id, item]));
const failedImageIds = new Set();

function renderStudyGuide(index) {
  const guide = STUDY_GUIDES[index] || STUDY_GUIDES[0];
  for (const button of elements.studyButtons) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.studyExample) === index));
  }
  elements.studyImageFrame.classList.remove('image-error');
  elements.studyImage.src = guide.image;
  elements.studyImage.alt = guide.alt;
  elements.studyMarks.replaceChildren();
  guide.marks.forEach((mark, markIndex) => {
    const box = document.createElement('span');
    box.className = 'study-mark';
    box.style.setProperty('--mark-x', `${mark.x}%`);
    box.style.setProperty('--mark-y', `${mark.y}%`);
    box.style.setProperty('--mark-width', `${mark.width}%`);
    box.style.setProperty('--mark-height', `${mark.height}%`);
    const number = document.createElement('span');
    number.textContent = String(markIndex + 1);
    box.append(number);
    elements.studyMarks.append(box);
  });
  elements.studyNotes.replaceChildren();
  guide.notes.forEach(([title, detail]) => {
    const item = document.createElement('li');
    const copy = document.createElement('span');
    const heading = document.createElement('strong');
    heading.textContent = title;
    copy.append(heading, detail);
    item.append(copy);
    elements.studyNotes.append(item);
  });
  elements.studySource.href = guide.source;
  elements.studySource.setAttribute('aria-label', `View museum record for the ${guide.label} example`);
}

function applyTheme(choice, persist = true) {
  themeChoice = ['system', 'light', 'dark'].includes(choice) ? choice : 'system';
  if (themeChoice === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = themeChoice;
  for (const button of elements.themeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === themeChoice));
  }
  const isDark = themeChoice === 'dark'
    || (themeChoice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  elements.themeColor.setAttribute('content', isDark ? '#141a16' : '#eef0e9');
  if (!persist) return;
  try {
    localStorage.setItem(THEME_KEY, themeChoice);
  } catch {
    // Theme selection remains active for this page when storage is unavailable.
  }
}

function storedTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'system';
  } catch {
    return 'system';
  }
}

function utcDate() {
  return new Date().toISOString().slice(0, 10);
}

function editionNumber() {
  const today = new Date(`${utcDate()}T00:00:00Z`).getTime();
  return Math.max(1, Math.floor((today - LAUNCH_DATE) / DAY_MS) + 1);
}

function dailyMoney() {
  const startIndex = (editionNumber() - 1) % DAILY_IDS.length;
  for (let offset = 0; offset < DAILY_IDS.length; offset += 1) {
    const scheduledId = DAILY_IDS[(startIndex + offset) % DAILY_IDS.length];
    const item = moneyById.get(scheduledId);
    if (item && !failedImageIds.has(item.id)) return item;
  }
  return MONEY.find((item) => !failedImageIds.has(item.id)) || MONEY[0];
}

function practiceMoney() {
  if (MONEY.length < 2) return MONEY[0];
  const choices = MONEY.filter((item) => item.id !== activeMoney?.id && !failedImageIds.has(item.id));
  return choices[Math.floor(Math.random() * choices.length)] || MONEY[0];
}

function loadMattedImage(image, source, onReady, onError) {
  const previousObjectUrl = image.dataset.objectUrl;
  if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
  const token = String(imageLoadSequence += 1);
  image.dataset.loadToken = token;
  delete image.dataset.objectUrl;
  delete image.dataset.matteApplied;
  image.crossOrigin = 'anonymous';
  image.classList.remove('loaded', 'background-removed');
  const showOriginal = () => {
    if (image.dataset.loadToken !== token) return;
    image.onload = () => {
      if (image.dataset.loadToken !== token) return;
      image.classList.add('loaded');
      onReady?.();
    };
    image.onerror = () => {
      if (image.dataset.loadToken === token) onError?.();
    };
    image.removeAttribute('crossorigin');
    image.src = '';
    image.src = source;
  };
  image.onload = async () => {
    if (image.dataset.loadToken !== token) return;
    if (image.dataset.matteApplied === 'true') {
      image.classList.add('loaded', 'background-removed');
      onReady?.();
      return;
    }
    try {
      const blob = await removeLightEdgeBackground(image);
      if (image.dataset.loadToken !== token) return;
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        image.dataset.objectUrl = objectUrl;
        image.dataset.matteApplied = 'true';
        image.src = objectUrl;
        return;
      }
    } catch {
      showOriginal();
      return;
    }
    image.classList.add('loaded');
    onReady?.();
  };
  image.onerror = showOriginal;
  image.src = source;
}

function loadPreviewImage(image, source) {
  image.classList.remove('loaded');
  image.onload = () => image.classList.add('loaded');
  image.onerror = () => {
    const replacement = MONEY.find((item) => item.image.url !== source && !failedImageIds.has(item.id));
    if (replacement) image.src = replacement.image.url;
  };
  image.src = source;
}

function replaceUnplayableRound(item) {
  if (activeMoney?.id !== item.id || failedImageIds.has(item.id)) return;
  failedImageIds.add(item.id);
  elements.mapStatus.textContent = 'Loading another currency';
  const replacement = mode === 'daily' ? dailyMoney() : practiceMoney();
  if (replacement && replacement.id !== item.id) resetRound(replacement);
  else elements.mapStatus.textContent = 'Currency images are unavailable. Try again.';
}

function setImage(item) {
  clearFlipDemo();
  let frontReady = false;
  let backReady = false;
  const maybeStartFlipDemo = () => {
    if (frontReady && backReady) startFlipDemo();
  };
  elements.image.classList.remove('loaded');
  elements.backImage.classList.remove('loaded');
  elements.card.classList.remove('ready', 'flipped');
  elements.flip.disabled = true;
  elements.flip.setAttribute('aria-pressed', 'false');
  elements.flip.setAttribute('aria-label', 'Show reverse side');
  elements.skeleton.classList.remove('hidden');
  elements.image.alt = item.image.alt;
  loadMattedImage(elements.image, item.image.url, () => {
    frontReady = true;
    elements.skeleton.classList.add('hidden');
    elements.card.classList.add('ready');
    maybeStartFlipDemo();
  }, () => replaceUnplayableRound(item));
  elements.backImage.alt = item.image.backAlt;
  loadMattedImage(elements.backImage, item.image.backUrl, () => {
    backReady = true;
    elements.flip.disabled = false;
    maybeStartFlipDemo();
  }, () => replaceUnplayableRound(item));
}

function setYearGuess(value) {
  yearGuess = Number(value);
  const label = formatYear(yearGuess);
  elements.yearGuess.value = String(yearGuess);
  elements.yearGuessValue.value = label;
  elements.yearGuess.setAttribute('aria-valuetext', label);
}

function setFlipSide(flipped) {
  elements.card.classList.toggle('flipped', flipped);
  elements.flip.setAttribute('aria-pressed', String(flipped));
  elements.flip.setAttribute('aria-label', flipped ? 'Show obverse side' : 'Show reverse side');
}

function clearFlipDemo() {
  for (const timer of flipDemoTimers) window.clearTimeout(timer);
  flipDemoTimers = [];
  elements.flip.classList.remove('flip-pulse');
}

function pulseFlip() {
  elements.flip.classList.remove('flip-pulse');
  void elements.flip.offsetWidth;
  elements.flip.classList.add('flip-pulse');
}

function startFlipDemo() {
  clearFlipDemo();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  flipDemoTimers = [
    window.setTimeout(pulseFlip, 650),
    window.setTimeout(() => setFlipSide(true), 1550),
    window.setTimeout(pulseFlip, 2350),
  ];
}

function toggleSide() {
  if (elements.flip.disabled) return;
  clearFlipDemo();
  setFlipSide(!elements.card.classList.contains('flipped'));
}

function markerElement(className) {
  return L.divIcon({
    className: 'leaflet-div-icon',
    html: `<span class="${className}" aria-hidden="true"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function clearMapResult() {
  if (guessMarker && map) map.removeLayer(guessMarker);
  if (answerMarker && map) map.removeLayer(answerMarker);
  if (answerRoute && map) map.removeLayer(answerRoute);
  if (answerArea && map) map.removeLayer(answerArea);
  guessMarker = null;
  answerMarker = null;
  answerRoute = null;
  answerArea = null;
}

function placeGuess(lngLat) {
  if (revealed || !mapReady) return;
  guess = { lng: lngLat.lng, lat: lngLat.lat };
  if (!guessMarker) {
    guessMarker = L.marker([guess.lat, guess.lng], { icon: markerElement('guess-marker'), draggable: true })
      .addTo(map);
    guessMarker.on('dragend', () => {
      const position = guessMarker.getLatLng();
      guess = { lng: position.lng, lat: position.lat };
    });
  } else {
    guessMarker.setLatLng([guess.lat, guess.lng]);
  }
  elements.submit.disabled = false;
  elements.mobileSubmit.disabled = false;
  elements.mapStatus.textContent = 'Pin placed. Move it or lock it in.';
}

function addResultToMap(savedGuess = guess) {
  if (!mapReady || !savedGuess) return;
  clearMapResult();
  guess = savedGuess;
  let answerLng = activeMoney.anchor.lng;
  const longitudeDelta = answerLng - guess.lng;
  if (longitudeDelta > 180) answerLng -= 360;
  if (longitudeDelta < -180) answerLng += 360;
  guessMarker = L.marker([guess.lat, guess.lng], { icon: markerElement('guess-marker') })
    .addTo(map);
  answerMarker = L.marker([activeMoney.anchor.lat, answerLng], { icon: markerElement('answer-marker') })
    .addTo(map);
  answerArea = L.circle([activeMoney.anchor.lat, answerLng], {
    radius: activeMoney.anchor.radiusKm * 1000,
    color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    weight: 1,
    fillOpacity: 0.08,
    opacity: 0.55,
    interactive: false,
  }).addTo(map);
  answerRoute = L.polyline(
    [[guess.lat, guess.lng], [activeMoney.anchor.lat, answerLng]],
    {
      color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      weight: 2,
      dashArray: '5 6',
      opacity: 0.9,
    },
  ).addTo(map);
  const bounds = L.latLngBounds([guess.lat, guess.lng], [activeMoney.anchor.lat, answerLng]);
  bounds.extend(answerArea.getBounds());
  map.fitBounds(bounds, { padding: window.innerWidth < 760 ? [76, 76] : [180, 180], maxZoom: 5, animate: true, duration: 0.9 });
}

function recordLabel(item) {
  if (item.id.startsWith('si-')) return 'Smithsonian record';
  if (item.id.startsWith('boc-')) return 'Bank of Canada Museum record';
  if (item.id.startsWith('bm-')) return 'British Museum record';
  return 'ANS record';
}

function mapPoint(location) {
  return {
    x: Math.max(3, Math.min(97, ((Number(location.lng) + 180) / 360) * 100)),
    y: Math.max(5, Math.min(95, ((90 - Number(location.lat)) / 180) * 100)),
  };
}

function positionResultMap(result) {
  const guessed = mapPoint(result.guess);
  const answer = mapPoint(activeMoney.anchor);
  elements.resultGuessDot.style.left = `${guessed.x}%`;
  elements.resultGuessDot.style.top = `${guessed.y}%`;
  elements.resultAnswerDot.style.left = `${answer.x}%`;
  elements.resultAnswerDot.style.top = `${answer.y}%`;
  elements.resultRoute.setAttribute('x1', guessed.x);
  elements.resultRoute.setAttribute('y1', guessed.y * 0.52);
  elements.resultRoute.setAttribute('x2', answer.x);
  elements.resultRoute.setAttribute('y2', answer.y * 0.52);
}

function populateResult(result) {
  elements.distance.textContent = Math.round(result.distance).toLocaleString();
  elements.dateDistance.textContent = Math.round(result.dateDistance).toLocaleString();
  positionResultMap(result);
  elements.answerPlace.textContent = activeMoney.anchor.label.toLowerCase() === activeMoney.issuer.toLowerCase()
    ? activeMoney.issuer
    : `${activeMoney.issuer}, ${activeMoney.anchor.label}`;
  elements.answerTitle.textContent = activeMoney.title;
  elements.blurb.textContent = activeMoney.blurb;
  elements.targetNote.textContent = `Your year: ${formatYear(result.yearGuess)}. Documented date: ${activeMoney.year}.`;
  elements.article.href = activeMoney.articleUrl;
  elements.article.textContent = recordLabel(activeMoney);
  elements.imageCredit.href = activeMoney.image.filePage;
  elements.imageCredit.title = `${activeMoney.image.author}, ${activeMoney.image.license}`;
  elements.imageCredit.textContent = `Images: ${activeMoney.image.author}, ${activeMoney.image.license}`;
  elements.next.textContent = mode === 'daily' ? 'Practice' : 'Next';
  elements.result.hidden = false;
  elements.mobileSubmit.style.display = 'none';
}

function reveal(saved = null) {
  if (revealed || (!guess && !saved)) return;
  revealed = true;
  const savedGuess = saved?.guess || guess;
  const measured = distanceFromAcceptedArea(savedGuess, activeMoney.anchor);
  const canReuseSavedResult = saved?.moneyId === activeMoney.id;
  const distance = canReuseSavedResult && Number.isFinite(saved.distance) ? saved.distance : measured.distance;
  const rawDistance = canReuseSavedResult && Number.isFinite(saved.rawDistance) ? saved.rawDistance : measured.rawDistance;
  const savedYearGuess = canReuseSavedResult && Number.isFinite(saved.yearGuess) ? saved.yearGuess : yearGuess;
  const dateDistance = canReuseSavedResult && Number.isFinite(saved.dateDistance)
    ? saved.dateDistance
    : yearDistance(savedYearGuess, activeMoney.year);
  setYearGuess(savedYearGuess);
  elements.yearGuess.disabled = true;
  lastResult = {
    model: RESULT_MODEL,
    moneyId: activeMoney.id,
    distance,
    rawDistance,
    dateDistance,
    yearGuess: savedYearGuess,
    guess: savedGuess,
  };
  if (mode === 'daily' && (!saved || saved.model !== RESULT_MODEL)) {
    saveDailyResult(utcDate(), lastResult);
  }
  elements.submit.disabled = true;
  elements.mobileSubmit.disabled = true;
  elements.mapStatus.textContent = distance < 1
    ? 'Inside the accepted area'
    : `${Math.round(distance).toLocaleString()} km outside the accepted area`;
  populateResult(lastResult);
  addResultToMap(savedGuess);
  updateStats();
}

function resetRound(item) {
  activeMoney = item;
  revealed = false;
  guess = null;
  lastResult = null;
  clearMapResult();
  elements.result.hidden = true;
  elements.mobileSubmit.removeAttribute('style');
  elements.submit.disabled = true;
  elements.mobileSubmit.disabled = true;
  elements.yearGuess.disabled = false;
  setYearGuess(750);
  elements.mapStatus.textContent = mapReady ? 'Tap anywhere on the map' : 'Loading map';
  setImage(item);
  if (mapReady) map.setView([18, 8], window.innerWidth < 760 ? 1 : 2, { animate: false });
}

function start(selectedMode) {
  mode = selectedMode;
  elements.home.classList.add('dismissed');
  elements.topbar.classList.remove('home-state');
  elements.edition.textContent = mode === 'daily' ? '' : 'FREE PLAY';
  const item = mode === 'daily' ? dailyMoney() : practiceMoney();
  resetRound(item);
  const saved = mode === 'daily' ? getDailyResult(utcDate()) : null;
  if (saved?.moneyId === item.id) {
    const waitForMap = () => {
      if (activeMoney?.id !== item.id) return;
      if (mapReady) reveal(saved);
      else window.setTimeout(waitForMap, 100);
    };
    waitForMap();
  }
}

function updateStats() {
  const stats = getStats();
  document.querySelector('#stat-played').textContent = stats.played.toLocaleString();
  document.querySelector('#stat-streak').textContent = stats.streak.toLocaleString();
  document.querySelector('#stat-distance').textContent = stats.averageDistance.toLocaleString();
  document.querySelector('#stat-years').textContent = stats.averageYears.toLocaleString();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  window.setTimeout(() => elements.toast.classList.remove('visible'), 2200);
}

function shareText() {
  const title = mode === 'daily' ? `ORIGINS #${editionNumber()}` : 'ORIGINS Free Play';
  return `${title}\n${Math.round(lastResult.distance).toLocaleString()} km off\n${Math.round(lastResult.dateDistance).toLocaleString()} years off\nhttps://jens246.github.io/origin-money-game/`;
}

function shareResult() {
  if (!lastResult) return;
  const guessed = mapPoint(lastResult.guess);
  const answer = mapPoint(activeMoney.anchor);
  elements.shareEdition.textContent = mode === 'daily' ? `Currency ${editionNumber()}` : 'Free Play';
  elements.shareDistance.textContent = Math.round(lastResult.distance).toLocaleString();
  elements.shareYears.textContent = Math.round(lastResult.dateDistance).toLocaleString();
  elements.shareDocumentedYear.textContent = activeMoney.year;
  elements.shareGuessDot.style.left = `${guessed.x}%`;
  elements.shareGuessDot.style.top = `${guessed.y}%`;
  elements.shareAnswerDot.style.left = `${answer.x}%`;
  elements.shareAnswerDot.style.top = `${answer.y}%`;
  elements.shareRoute.setAttribute('x1', guessed.x);
  elements.shareRoute.setAttribute('y1', guessed.y * 0.52);
  elements.shareRoute.setAttribute('x2', answer.x);
  elements.shareRoute.setAttribute('y2', answer.y * 0.52);
  elements.shareSpecimen.style.left = `${Math.max(15, Math.min(85, answer.x))}%`;
  elements.shareSpecimen.style.top = `${Math.max(19, Math.min(70, answer.y - 14))}%`;
  elements.shareSpecimen.src = elements.image.currentSrc || activeMoney.image.url;
  elements.shareDialog.showModal();
}

async function copyShareResult() {
  if (!lastResult) return;
  try {
    await navigator.clipboard.writeText(shareText());
    showToast('Result copied');
  } catch {
    showToast('Could not copy result');
  }
}

async function saveShareCard() {
  if (!lastResult) return;
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1500;
  const context = canvas.getContext('2d');
  context.fillStyle = '#e8ece5';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = '#18211c';
  context.textAlign = 'center';
  context.font = '700 118px "Newsreader", serif';
  context.fillText('ORIGINS', 600, 180);
  context.font = '700 40px "Newsreader", serif';
  context.fillStyle = '#2e6652';
  context.fillText(mode === 'daily' ? `CURRENCY ${editionNumber()}` : 'FREE PLAY', 600, 252);

  const mapImage = new Image();
  mapImage.src = 'assets/home-world-map.webp';
  try {
    await mapImage.decode();
    context.globalAlpha = 0.72;
    context.drawImage(mapImage, 105, 315, 990, 540);
    context.globalAlpha = 1;
  } catch {}

  const guessed = mapPoint(lastResult.guess);
  const answer = mapPoint(activeMoney.anchor);
  const mapX = (point) => 105 + (point.x / 100) * 990;
  const mapY = (point) => 315 + (point.y / 100) * 540;
  try {
    const safetyCanvas = document.createElement('canvas');
    safetyCanvas.width = 2;
    safetyCanvas.height = 2;
    const safetyContext = safetyCanvas.getContext('2d');
    safetyContext.drawImage(elements.image, 0, 0, 2, 2);
    safetyCanvas.toDataURL();
    const specimenScale = Math.min(220 / elements.image.naturalWidth, 150 / elements.image.naturalHeight);
    const specimenWidth = elements.image.naturalWidth * specimenScale;
    const specimenHeight = elements.image.naturalHeight * specimenScale;
    const specimenX = Math.max(105 + specimenWidth / 2, Math.min(1095 - specimenWidth / 2, mapX(answer)));
    const specimenY = Math.max(330 + specimenHeight / 2, Math.min(730 - specimenHeight / 2, mapY(answer) - 88));
    context.drawImage(
      elements.image,
      specimenX - specimenWidth / 2,
      specimenY - specimenHeight / 2,
      specimenWidth,
      specimenHeight,
    );
  } catch {}
  context.strokeStyle = '#2e6652';
  context.lineWidth = 7;
  context.setLineDash([18, 18]);
  context.beginPath();
  context.moveTo(mapX(guessed), mapY(guessed));
  context.lineTo(mapX(answer), mapY(answer));
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = '#18211c';
  context.beginPath();
  context.arc(mapX(guessed), mapY(guessed), 22, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#2e6652';
  context.beginPath();
  context.arc(mapX(answer), mapY(answer), 28, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#e8ece5';
  context.lineWidth = 8;
  context.stroke();

  context.fillStyle = '#18211c';
  context.textAlign = 'right';
  context.font = '700 68px "Newsreader", serif';
  context.fillText(activeMoney.year, 1060, 812);
  context.textAlign = 'center';

  const facts = [
    [Math.round(lastResult.distance).toLocaleString(), 'KM OFF'],
    [Math.round(lastResult.dateDistance).toLocaleString(), 'YEARS OFF'],
  ];
  facts.forEach(([value, label], index) => {
    const x = index === 0 ? 340 : 860;
    context.fillStyle = '#18211c';
    context.font = '700 94px "IBM Plex Sans Condensed", sans-serif';
    context.fillText(value, x, 1040);
    context.fillStyle = '#59645c';
    context.font = '600 30px "IBM Plex Sans Condensed", sans-serif';
    context.fillText(label, x, 1094);
  });

  context.fillStyle = '#59645c';
  context.font = '400 28px "IBM Plex Sans Condensed", sans-serif';
  context.fillText('jens246.github.io/origin-money-game', 600, 1405);

  canvas.toBlob((blob) => {
    if (!blob) {
      showToast('Could not save card');
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = mode === 'daily' ? `origins-${editionNumber()}.png` : 'origins-practice.png';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Card saved');
  }, 'image/png');
}

async function initializeMap() {
  try {
    L = await import(LEAFLET_URL);
    map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: true,
      minZoom: 1,
      maxZoom: 9,
    }).setView([18, 8], window.innerWidth < 760 ? 1 : 2);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.attribution({ position: 'bottomleft', prefix: false })
      .addAttribution('&copy; OpenStreetMap contributors')
      .addTo(map);
    tiles.on('tileerror', () => {
      window.setTimeout(() => {
        const hasTiles = document.querySelector('.leaflet-tile-loaded');
        if (!hasTiles && !revealed) elements.mapStatus.textContent = 'Map tiles could not be loaded';
      }, 1800);
    });
    map.on('click', (event) => placeGuess(event.latlng));
    mapReady = true;
    elements.mapStatus.textContent = 'Tap anywhere on the map';
  } catch {
    elements.mapStatus.textContent = 'Map unavailable. Check your connection.';
  }
}

function wireEvents() {
  elements.startDaily.addEventListener('click', () => start('daily'));
  elements.startPractice.addEventListener('click', () => start('practice'));
  elements.homeButton.addEventListener('click', () => {
    clearFlipDemo();
    elements.home.classList.remove('dismissed');
    elements.topbar.classList.add('home-state');
    elements.edition.textContent = '';
  });
  elements.submit.addEventListener('click', () => reveal());
  elements.mobileSubmit.addEventListener('click', () => reveal());
  elements.yearGuess.addEventListener('input', (event) => setYearGuess(event.target.value));
  elements.flip.addEventListener('click', toggleSide);
  elements.share.addEventListener('click', shareResult);
  elements.copyShare.addEventListener('click', copyShareResult);
  elements.saveShare.addEventListener('click', saveShareCard);
  elements.next.addEventListener('click', () => start('practice'));
  for (const button of document.querySelectorAll('[data-open-dialog]')) {
    button.addEventListener('click', () => document.querySelector(`#${button.dataset.openDialog}`).showModal());
  }
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }
  for (const button of elements.themeButtons) {
    button.addEventListener('click', () => applyTheme(button.dataset.themeChoice));
  }
  for (const button of elements.studyButtons) {
    button.addEventListener('click', () => renderStudyGuide(Number(button.dataset.studyExample)));
  }
  elements.studyImage.addEventListener('load', () => elements.studyImageFrame.classList.remove('image-error'));
  elements.studyImage.addEventListener('error', () => elements.studyImageFrame.classList.add('image-error'));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (themeChoice === 'system') applyTheme('system', false);
  });
}

function boot() {
  applyTheme(storedTheme(), false);
  if (!MONEY.length) {
    elements.home.querySelector('.home-copy').innerHTML = '<h1>Currency data is unavailable.</h1><p>Run npm run data:build, then reload.</p>';
    return;
  }
  const today = dailyMoney();
  loadPreviewImage(elements.homeImage, today.image.url);
  elements.startDaily.textContent = 'Play';
  elements.edition.textContent = '';
  updateStats();
  renderStudyGuide(0);
  wireEvents();
  initializeMap();
}

boot();
