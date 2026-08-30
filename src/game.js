import { MONEY } from './money.generated.js';
import { distanceBand, distanceKm, pointsForDistance } from './scoring.js';
import { getDailyResult, getStats, saveDailyResult } from './storage.js';

const LEAFLET_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js';
const LAUNCH_DATE = Date.UTC(2026, 7, 29);
const DAY_MS = 86_400_000;

const elements = {
  home: document.querySelector('#home-screen'),
  homeButton: document.querySelector('#home-button'),
  homeImage: document.querySelector('#home-image'),
  startDaily: document.querySelector('#start-daily'),
  startPractice: document.querySelector('#start-practice'),
  edition: document.querySelector('#edition-label'),
  image: document.querySelector('#money-image'),
  skeleton: document.querySelector('#image-skeleton'),
  prompt: document.querySelector('#prompt-copy'),
  submit: document.querySelector('#submit-button'),
  mobileSubmit: document.querySelector('#mobile-submit-button'),
  mapStatus: document.querySelector('#map-status'),
  result: document.querySelector('#result-panel'),
  distance: document.querySelector('#distance-value'),
  score: document.querySelector('#score-value'),
  answerPlace: document.querySelector('#answer-place'),
  answerTitle: document.querySelector('#answer-title'),
  blurb: document.querySelector('#answer-blurb'),
  targetNote: document.querySelector('#target-note'),
  article: document.querySelector('#article-link'),
  imageCredit: document.querySelector('#image-credit-link'),
  share: document.querySelector('#share-button'),
  next: document.querySelector('#next-button'),
  toast: document.querySelector('#toast'),
};

let L;
let map;
let mapReady = false;
let guessMarker;
let answerMarker;
let answerRoute;
let guess = null;
let activeMoney = null;
let mode = 'daily';
let revealed = false;
let lastResult = null;

function utcDate() {
  return new Date().toISOString().slice(0, 10);
}

function editionNumber() {
  const today = new Date(`${utcDate()}T00:00:00Z`).getTime();
  return Math.max(1, Math.floor((today - LAUNCH_DATE) / DAY_MS) + 1);
}

function dailyMoney() {
  return MONEY[(editionNumber() - 1) % MONEY.length];
}

function practiceMoney() {
  if (MONEY.length < 2) return MONEY[0];
  const choices = MONEY.filter((item) => item.id !== activeMoney?.id);
  return choices[Math.floor(Math.random() * choices.length)];
}

function setImage(item) {
  elements.image.classList.remove('loaded');
  elements.skeleton.classList.remove('hidden');
  elements.image.alt = item.image.alt;
  elements.image.onload = () => {
    elements.skeleton.classList.add('hidden');
    elements.image.classList.add('loaded');
  };
  elements.image.onerror = () => {
    elements.skeleton.classList.add('hidden');
    elements.prompt.textContent = 'The image could not be loaded';
  };
  elements.image.src = item.image.url;
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
  guessMarker = null;
  answerMarker = null;
  answerRoute = null;
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
  guessMarker = L.marker([guess.lat, guess.lng], { icon: markerElement('guess-marker') })
    .addTo(map);
  answerMarker = L.marker([activeMoney.anchor.lat, activeMoney.anchor.lng], { icon: markerElement('answer-marker') })
    .addTo(map);
  answerRoute = L.polyline(
    [[guess.lat, guess.lng], [activeMoney.anchor.lat, activeMoney.anchor.lng]],
    {
      color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      weight: 2,
      dashArray: '5 6',
      opacity: 0.9,
    },
  ).addTo(map);
  const bounds = L.latLngBounds([guess.lat, guess.lng], [activeMoney.anchor.lat, activeMoney.anchor.lng]);
  map.fitBounds(bounds, { padding: window.innerWidth < 760 ? [76, 76] : [180, 180], maxZoom: 5, animate: true, duration: 0.9 });
}

function targetMethodLabel(method) {
  return {
    mint_city: 'mint city',
    issuing_city: 'issuing city',
    issuing_authority_city: 'issuing authority city',
    representative_point: 'representative point',
  }[method] || 'documented origin point';
}

function populateResult(result) {
  elements.distance.textContent = Math.round(result.distance).toLocaleString();
  elements.score.textContent = result.score.toLocaleString();
  elements.answerPlace.textContent = activeMoney.anchor.label.toLowerCase() === activeMoney.issuer.toLowerCase()
    ? activeMoney.issuer
    : `${activeMoney.issuer}, ${activeMoney.anchor.label}`;
  elements.answerTitle.textContent = activeMoney.title;
  elements.blurb.textContent = activeMoney.blurb;
  elements.targetNote.textContent = `Scored to the ${targetMethodLabel(activeMoney.anchor.method)}.`;
  elements.article.href = activeMoney.articleUrl;
  elements.imageCredit.href = activeMoney.image.filePage;
  elements.imageCredit.title = `${activeMoney.image.author}, ${activeMoney.image.license}`;
  elements.imageCredit.textContent = `Image: ${activeMoney.image.author}, ${activeMoney.image.license}`;
  elements.next.textContent = mode === 'daily' ? 'Practice' : 'Next';
  elements.result.hidden = false;
  elements.mobileSubmit.style.display = 'none';
}

function reveal(saved = null) {
  if (revealed || (!guess && !saved)) return;
  revealed = true;
  const savedGuess = saved?.guess || guess;
  const distance = saved?.distance ?? distanceKm(savedGuess, activeMoney.anchor);
  const score = saved?.score ?? pointsForDistance(distance);
  lastResult = { distance, score, guess: savedGuess };
  if (mode === 'daily' && !saved) saveDailyResult(utcDate(), lastResult);
  elements.submit.disabled = true;
  elements.mobileSubmit.disabled = true;
  elements.mapStatus.textContent = `${Math.round(distance).toLocaleString()} km away`;
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
  elements.prompt.textContent = 'Place its origin';
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
  if (saved) {
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

async function shareResult() {
  if (!lastResult) return;
  const title = mode === 'daily' ? `ORIGIN #${editionNumber()}` : 'ORIGIN Practice';
  const text = `${title}\n${lastResult.score.toLocaleString()} / 5,000\n${Math.round(lastResult.distance).toLocaleString()} km, ${distanceBand(lastResult.distance)}`;
  try {
    if (navigator.share) await navigator.share({ text });
    else {
      await navigator.clipboard.writeText(text);
      showToast('Result copied');
    }
  } catch (error) {
    if (error?.name !== 'AbortError') showToast('Could not share result');
  }
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
  elements.homeButton.addEventListener('click', () => elements.home.classList.remove('dismissed'));
  elements.submit.addEventListener('click', () => reveal());
  elements.mobileSubmit.addEventListener('click', () => reveal());
  elements.share.addEventListener('click', shareResult);
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
  elements.homeImage.src = today.image.url;
  elements.startDaily.textContent = getDailyResult(utcDate()) ? 'View today' : 'Play today';
  elements.edition.textContent = `Daily ${editionNumber()}`;
  updateStats();
  wireEvents();
  initializeMap();
}

boot();
