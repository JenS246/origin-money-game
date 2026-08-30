import { MONEY } from './money.generated.js';
import { DAILY_IDS } from './daily.generated.js';
import { removeLightEdgeBackground } from './image-matte.js';
import {
  combinedPoints,
  distanceBand,
  distanceFromAcceptedArea,
  formatYear,
  pointsForDistance,
  pointsForYear,
  yearDistance,
} from './scoring.js';
import { getDailyResult, getStats, saveDailyResult } from './storage.js';

const LEAFLET_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js';
const LAUNCH_DATE = Date.UTC(2026, 7, 29);
const DAY_MS = 86_400_000;
const SCORE_MODEL = 4;

const elements = {
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
  flipLabel: document.querySelector('#flip-label'),
  skeleton: document.querySelector('#image-skeleton'),
  yearGuess: document.querySelector('#year-guess'),
  yearGuessValue: document.querySelector('#year-guess-value'),
  submit: document.querySelector('#submit-button'),
  mobileSubmit: document.querySelector('#mobile-submit-button'),
  mapStatus: document.querySelector('#map-status'),
  result: document.querySelector('#result-panel'),
  distance: document.querySelector('#distance-value'),
  dateDistance: document.querySelector('#date-distance-value'),
  score: document.querySelector('#score-value'),
  answerPlace: document.querySelector('#answer-place'),
  answerTitle: document.querySelector('#answer-title'),
  blurb: document.querySelector('#answer-blurb'),
  targetNote: document.querySelector('#target-note'),
  article: document.querySelector('#article-link'),
  imageCredit: document.querySelector('#image-credit-link'),
  share: document.querySelector('#share-button'),
  shareDialog: document.querySelector('#share-dialog'),
  shareEdition: document.querySelector('#share-edition'),
  shareScore: document.querySelector('#share-score'),
  shareDistance: document.querySelector('#share-distance'),
  shareYears: document.querySelector('#share-years'),
  copyShare: document.querySelector('#copy-share-button'),
  saveShare: document.querySelector('#save-share-button'),
  next: document.querySelector('#next-button'),
  toast: document.querySelector('#toast'),
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
const moneyById = new Map(MONEY.map((item) => [item.id, item]));

function utcDate() {
  return new Date().toISOString().slice(0, 10);
}

function editionNumber() {
  const today = new Date(`${utcDate()}T00:00:00Z`).getTime();
  return Math.max(1, Math.floor((today - LAUNCH_DATE) / DAY_MS) + 1);
}

function dailyMoney() {
  const scheduledId = DAILY_IDS[(editionNumber() - 1) % DAILY_IDS.length];
  return moneyById.get(scheduledId) || MONEY[(editionNumber() - 1) % MONEY.length];
}

function practiceMoney() {
  if (MONEY.length < 2) return MONEY[0];
  const choices = MONEY.filter((item) => item.id !== activeMoney?.id);
  return choices[Math.floor(Math.random() * choices.length)];
}

function loadMattedImage(image, source, onReady, onError) {
  const previousObjectUrl = image.dataset.objectUrl;
  if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
  const token = String(imageLoadSequence += 1);
  image.dataset.loadToken = token;
  delete image.dataset.objectUrl;
  delete image.dataset.matteApplied;
  image.classList.remove('loaded', 'background-removed');
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
      // If canvas processing is unavailable, keep the original photograph.
    }
    image.classList.add('loaded');
    onReady?.();
  };
  image.onerror = onError;
  image.src = source;
}

function loadPreviewImage(image, source) {
  image.classList.remove('loaded');
  image.onload = () => image.classList.add('loaded');
  image.src = source;
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
  elements.flipLabel.textContent = 'Obverse';
  elements.skeleton.classList.remove('hidden');
  elements.image.alt = item.image.alt;
  loadMattedImage(elements.image, item.image.url, () => {
    frontReady = true;
    elements.skeleton.classList.add('hidden');
    elements.card.classList.add('ready');
    maybeStartFlipDemo();
  }, () => {
    elements.skeleton.classList.add('hidden');
    elements.mapStatus.textContent = 'The object image could not be loaded';
  });
  elements.backImage.alt = item.image.backAlt;
  loadMattedImage(elements.backImage, item.image.backUrl, () => {
    backReady = true;
    elements.flip.disabled = false;
    maybeStartFlipDemo();
  }, () => {
    elements.flipLabel.textContent = 'Obverse';
  });
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
  elements.flipLabel.textContent = flipped ? 'Reverse' : 'Obverse';
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

function targetMethodLabel(method) {
  return {
    mint_city: 'mint city',
    issuing_city: 'issuing city',
    issuing_authority_city: 'issuing authority city',
    printing_facility: 'printing facility',
    issuing_region: 'issuing region',
    production_place: 'documented production area',
  }[method] || 'documented origin point';
}

function recordLabel(item) {
  if (item.id.startsWith('si-')) return 'Smithsonian record';
  if (item.id.startsWith('boc-')) return 'Bank of Canada Museum record';
  return 'ANS record';
}

function populateResult(result) {
  elements.distance.textContent = Math.round(result.distance).toLocaleString();
  elements.dateDistance.textContent = Math.round(result.dateDistance).toLocaleString();
  elements.score.textContent = result.score.toLocaleString();
  elements.answerPlace.textContent = activeMoney.anchor.label.toLowerCase() === activeMoney.issuer.toLowerCase()
    ? activeMoney.issuer
    : `${activeMoney.issuer}, ${activeMoney.anchor.label}`;
  elements.answerTitle.textContent = activeMoney.title;
  elements.blurb.textContent = activeMoney.blurb;
  elements.targetNote.textContent = `You guessed ${formatYear(result.yearGuess)}. Date: ${activeMoney.year}. Map accepted within ${activeMoney.anchor.radiusKm.toLocaleString()} km of the ${targetMethodLabel(activeMoney.anchor.method)}.`;
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
  const canReuseSavedScore = saved?.model === SCORE_MODEL && saved?.moneyId === activeMoney.id;
  const distance = canReuseSavedScore ? saved.distance : measured.distance;
  const rawDistance = canReuseSavedScore ? saved.rawDistance : measured.rawDistance;
  const savedYearGuess = canReuseSavedScore ? saved.yearGuess : yearGuess;
  const dateDistance = canReuseSavedScore ? saved.dateDistance : yearDistance(savedYearGuess, activeMoney.year);
  const mapPoints = canReuseSavedScore ? saved.mapPoints : pointsForDistance(distance);
  const datePoints = canReuseSavedScore ? saved.datePoints : pointsForYear(dateDistance);
  const score = canReuseSavedScore ? saved.score : combinedPoints(mapPoints, datePoints);
  setYearGuess(savedYearGuess);
  elements.yearGuess.disabled = true;
  lastResult = {
    model: SCORE_MODEL,
    moneyId: activeMoney.id,
    distance,
    rawDistance,
    dateDistance,
    yearGuess: savedYearGuess,
    mapPoints,
    datePoints,
    score,
    guess: savedGuess,
  };
  if (mode === 'daily' && (!saved || !canReuseSavedScore)) {
    saveDailyResult(utcDate(), lastResult);
    elements.startDaily.textContent = 'View today';
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
  elements.edition.textContent = mode === 'daily' ? `Daily ${editionNumber()}` : 'Practice';
  const item = mode === 'daily' ? dailyMoney() : practiceMoney();
  resetRound(item);
  const saved = mode === 'daily' ? getDailyResult(utcDate()) : null;
  if (saved?.model === SCORE_MODEL && saved?.moneyId === item.id) {
    const waitForMap = () => {
      if (mapReady) reveal(saved);
      else window.setTimeout(waitForMap, 100);
    };
    waitForMap();
  }
}

function updateStats() {
  const stats = getStats();
  document.querySelector('#stat-played').textContent = stats.played.toLocaleString();
  document.querySelector('#stat-average').textContent = stats.average.toLocaleString();
  document.querySelector('#stat-streak').textContent = stats.streak.toLocaleString();
  document.querySelector('#stat-best').textContent = stats.best.toLocaleString();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  window.setTimeout(() => elements.toast.classList.remove('visible'), 2200);
}

function shareText() {
  const title = mode === 'daily' ? `ORIGIN #${editionNumber()}` : 'ORIGIN Practice';
  return `${title}\n${lastResult.score.toLocaleString()} / 5,000\n${Math.round(lastResult.distance).toLocaleString()} km, ${distanceBand(lastResult.distance)}\n${Math.round(lastResult.dateDistance).toLocaleString()} years off\nhttps://jens246.github.io/origin-money-game/`;
}

function shareResult() {
  if (!lastResult) return;
  elements.shareEdition.textContent = mode === 'daily' ? `Daily ${editionNumber()}` : 'Practice';
  elements.shareScore.textContent = lastResult.score.toLocaleString();
  elements.shareDistance.textContent = Math.round(lastResult.distance).toLocaleString();
  elements.shareYears.textContent = Math.round(lastResult.dateDistance).toLocaleString();
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

  context.strokeStyle = '#2e6652';
  context.lineWidth = 18;
  context.beginPath();
  context.arc(600, 340, 218, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 0.18;
  context.lineWidth = 4;
  context.beginPath();
  context.arc(600, 340, 184, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;

  context.fillStyle = '#18211c';
  context.textAlign = 'center';
  context.font = '700 118px "Newsreader", serif';
  context.fillText('ORIGIN', 600, 382);
  context.font = '600 40px "IBM Plex Sans Condensed", sans-serif';
  context.fillStyle = '#2e6652';
  context.fillText(mode === 'daily' ? `DAILY ${editionNumber()}` : 'PRACTICE', 600, 650);

  context.fillStyle = '#18211c';
  context.font = '700 250px "IBM Plex Sans Condensed", sans-serif';
  context.fillText(lastResult.score.toLocaleString(), 600, 900);
  context.font = '400 38px "IBM Plex Sans Condensed", sans-serif';
  context.fillStyle = '#59645c';
  context.fillText('OUT OF 5,000', 600, 965);

  const facts = [
    [Math.round(lastResult.distance).toLocaleString(), 'KM OFF'],
    [Math.round(lastResult.dateDistance).toLocaleString(), 'YEARS OFF'],
  ];
  facts.forEach(([value, label], index) => {
    const x = index === 0 ? 340 : 860;
    context.fillStyle = '#18211c';
    context.font = '700 94px "IBM Plex Sans Condensed", sans-serif';
    context.fillText(value, x, 1180);
    context.fillStyle = '#59645c';
    context.font = '600 30px "IBM Plex Sans Condensed", sans-serif';
    context.fillText(label, x, 1234);
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
    link.download = mode === 'daily' ? `origin-${editionNumber()}.png` : 'origin-practice.png';
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
}

function boot() {
  if (!MONEY.length) {
    elements.home.querySelector('.home-copy').innerHTML = '<h1>Currency data is unavailable.</h1><p>Run npm run data:build, then reload.</p>';
    return;
  }
  const today = dailyMoney();
  loadPreviewImage(elements.homeImage, today.image.url);
  const saved = getDailyResult(utcDate());
  elements.startDaily.textContent = saved?.model === SCORE_MODEL && saved?.moneyId === today.id ? 'View today' : 'Play today';
  elements.edition.textContent = `Daily ${editionNumber()}`;
  updateStats();
  wireEvents();
  initializeMap();
}

boot();
