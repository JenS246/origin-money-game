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
    source: 'https://numismatics.org/collection/0000.999.29134',
    sides: [
      {
        name: 'Front',
        image: 'https://numismatics.org/collectionimages/00001899/0000/0000.999.29134.obv.noscale.jpg',
        alt: 'Front of a South Carolina two dollar note dated 1776',
        marks: [
          { x: 17, y: 17, width: 33, height: 12 },
          { x: 57, y: 51, width: 31, height: 15 },
          { x: 33, y: 3, width: 36, height: 13 },
        ],
        notes: [
          ['Issuer', 'SOUTH-CAROLINA names the issuing authority.'],
          ['Date', 'The act date fixes the note to the Revolutionary period.'],
          ['Denomination', 'Words, numerals, and spelling identify the currency system.'],
        ],
      },
      {
        name: 'Back',
        image: 'https://numismatics.org/collectionimages/00001899/0000/0000.999.29134.rev.noscale.jpg',
        alt: 'Back of a South Carolina two dollar note printed in 1777',
        marks: [
          { x: 24, y: 9, width: 51, height: 13 },
          { x: 17, y: 62, width: 58, height: 10 },
          { x: 15, y: 70, width: 66, height: 12 },
        ],
        notes: [
          ['Denomination', 'The value is repeated prominently on the back.'],
          ['Place', 'CHARLES-TOWN gives a precise geographic clue.'],
          ['Printer and year', 'The imprint ties the note to a place and production date.'],
        ],
      },
    ],
  },
  {
    label: 'Japan',
    source: 'https://numismatics.org/collection/1927.55.1',
    sides: [
      {
        name: 'Front',
        image: 'https://numismatics.org/collectionimages/19001949/1927/1927.55.1.obv.noscale.jpg',
        alt: 'Front of a Japanese trade dollar with a dragon and bilingual legend',
        marks: [
          { x: 27, y: 20, width: 48, height: 54 },
          { x: 20, y: 5, width: 58, height: 23 },
          { x: 10, y: 46, width: 82, height: 43 },
        ],
        notes: [
          ['Dragon', 'A recurring state emblem can identify an issue family.'],
          ['Script', 'The writing system narrows the region before any word is read.'],
          ['Weight and standard', 'The English legend identifies a trade coin and its silver standard.'],
        ],
      },
      {
        name: 'Back',
        image: 'https://numismatics.org/collectionimages/19001949/1927/1927.55.1.rev.noscale.jpg',
        alt: 'Back of a Japanese trade dollar with imperial crest, script, and plant motifs',
        marks: [
          { x: 41, y: 6, width: 21, height: 23 },
          { x: 42, y: 29, width: 20, height: 43 },
          { x: 62, y: 20, width: 29, height: 59 },
        ],
        notes: [
          ['Imperial crest', 'Official crests can identify the issuing authority.'],
          ['Script', 'Vertical text carries the denomination and era clues.'],
          ['Plant motifs', 'Repeated national symbols often survive across many issues.'],
        ],
      },
    ],
  },
  {
    label: 'Hong Kong',
    source: 'https://numismatics.org/collection/0000.999.6012',
    sides: [
      {
        name: 'Front',
        image: 'https://numismatics.org/collectionimages/00001899/0000/0000.999.6012.obv.noscale.jpg',
        alt: 'Front of an 1867 Hong Kong dollar with Queen Victoria',
        marks: [
          { x: 29, y: 17, width: 46, height: 61 },
          { x: 12, y: 2, width: 76, height: 25 },
          { x: 7, y: 10, width: 21, height: 73 },
        ],
        notes: [
          ['Portrait', 'The ruler places the coin within a political period.'],
          ['Ruler legend', 'VICTORIA QUEEN reveals British colonial authority.'],
          ['Rim pattern', 'Repeated border styles can connect coins from the same series.'],
        ],
      },
      {
        name: 'Back',
        image: 'https://numismatics.org/collectionimages/00001899/0000/0000.999.6012.rev.noscale.jpg',
        alt: 'Back of an 1867 Hong Kong dollar with English and Chinese legends',
        marks: [
          { x: 13, y: 13, width: 73, height: 33 },
          { x: 43, y: 21, width: 18, height: 20 },
          { x: 75, y: 54, width: 15, height: 19 },
        ],
        notes: [
          ['Place name', 'HONG-KONG is written around the field. Read every edge.'],
          ['Local script', 'A second writing system reveals a multilingual issue.'],
          ['Date', 'The year connects the design to its ruler and historical period.'],
        ],
      },
    ],
  },
  {
    label: 'France',
    source: 'https://numismatics.org/collection/1903.38.53',
    sides: [
      {
        name: 'Front',
        image: 'https://numismatics.org/collectionimages/19001949/1903/1903.38.53.obv.noscale.jpg',
        alt: 'Front of a French colonial two sous coin with denomination and date',
        marks: [{ x: 24, y: 21, width: 52, height: 29 }, { x: 37, y: 53, width: 28, height: 16 }, { x: 75, y: 9, width: 19, height: 72 }],
        notes: [['Denomination', 'The central value names the two sous unit.'], ['Date', '1780 places the issue just before the French Revolution.'], ['Colony legend', 'COLONIE DE CAYENNE identifies the intended colonial circulation.']],
      },
      {
        name: 'Back',
        image: 'https://numismatics.org/collectionimages/19001949/1903/1903.38.53.rev.noscale.jpg',
        alt: 'Back of a French colonial two sous coin with crown and fleur-de-lis',
        marks: [{ x: 35, y: 8, width: 30, height: 27 }, { x: 21, y: 39, width: 58, height: 43 }, { x: 76, y: 12, width: 18, height: 66 }],
        notes: [['Rounded crown', 'The ANS notes this crown shape may indicate a contemporary forgery.'], ['Fleur-de-lis', 'Three fleur-de-lis form the royal French design.'], ['Ruler legend', 'LOUIS XVI identifies the authority named on the coin.']],
      },
    ],
  },
  {
    label: 'Mexico',
    source: 'https://numismatics.org/collection/1911.105.805',
    sides: [
      {
        name: 'Front',
        image: 'https://numismatics.org/collectionimages/19001949/1911/1911.105.805.obv.noscale.jpg',
        alt: 'Front of a Mexican quarter real with castle and date',
        marks: [{ x: 14, y: 39, width: 21, height: 18 }, { x: 32, y: 10, width: 39, height: 63 }, { x: 34, y: 75, width: 34, height: 15 }],
        notes: [['Mint mark', 'The Mo mark identifies the Mexico City mint.'], ['Castle', 'Castile\'s castle points to Spanish royal authority.'], ['Date', '1799 places the coin within the colonial period.']],
      },
      {
        name: 'Back',
        image: 'https://numismatics.org/collectionimages/19001949/1911/1911.105.805.rev.noscale.jpg',
        alt: 'Back of a Mexican quarter real with a crowned lion',
        marks: [{ x: 42, y: 11, width: 17, height: 15 }, { x: 24, y: 18, width: 53, height: 68 }],
        notes: [['Crowned lion', 'The small crown reinforces royal authority.'], ['Lion', 'The lion of Leon pairs with the castle of Castile on Spanish issues.']],
      },
    ],
  },
  {
    label: 'Brazil',
    source: 'https://numismatics.org/collection/1916.100.36',
    sides: [
      {
        name: 'Front',
        image: 'https://numismatics.org/collectionimages/19001949/1916/1916.100.36.obv.noscale.jpg',
        alt: 'Front of a Brazilian coin with Pedro II portrait and Latin legend',
        marks: [{ x: 29, y: 15, width: 43, height: 70 }, { x: 8, y: 5, width: 28, height: 80 }, { x: 70, y: 7, width: 23, height: 77 }],
        notes: [['Portrait', 'Pedro II identifies the Empire of Brazil.'], ['Ruler name', 'PETRUS II names the emperor in Latin.'], ['Country abbreviation', 'BRAS in the legend identifies Brazil.']],
      },
      {
        name: 'Back',
        image: 'https://numismatics.org/collectionimages/19001949/1916/1916.100.36.rev.noscale.jpg',
        alt: 'Back of a Brazilian coin with imperial coat of arms',
        marks: [{ x: 39, y: 5, width: 25, height: 24 }, { x: 27, y: 20, width: 48, height: 61 }, { x: 20, y: 1, width: 63, height: 19 }],
        notes: [['Imperial crown', 'The crown distinguishes imperial from republican designs.'], ['Coat of arms', 'Coffee and tobacco branches surround the national arms.'], ['Motto', 'The Latin legend confirms imperial authority.']],
      },
    ],
  },
  {
    label: 'China',
    source: 'https://numismatics.org/collection/0000.999.2918',
    sides: [
      {
        name: 'Front',
        image: 'https://numismatics.org/collectionimages/00001899/0000/0000.999.2918.obv.noscale.jpg',
        alt: 'Front of a Chinese ten cash coin with Chinese and English denominations',
        marks: [{ x: 39, y: 18, width: 22, height: 43 }, { x: 25, y: 76, width: 52, height: 14 }, { x: 18, y: 10, width: 66, height: 67 }],
        notes: [['Value characters', 'The central characters read ten cash.'], ['English denomination', 'TEN CASH confirms the unit without requiring the local script.'], ['Wheat wreath', 'The paired wheat stems frame the denomination.']],
      },
      {
        name: 'Back',
        image: 'https://numismatics.org/collectionimages/00001899/0000/0000.999.2918.rev.noscale.jpg',
        alt: 'Back of a Chinese Republic ten cash coin with crossed flags and Chinese legend',
        marks: [{ x: 25, y: 5, width: 55, height: 18 }, { x: 25, y: 19, width: 52, height: 54 }, { x: 22, y: 75, width: 60, height: 15 }],
        notes: [['State legend', 'The top characters name the Republic of China.'], ['Crossed flags', 'Early republican flags replace the imperial dragon.'], ['Issue text', 'Lower characters carry the commemorative issue wording.']],
      },
    ],
  },
  {
    label: 'Greece',
    source: 'https://www.britishmuseum.org/collection/object/C_1920-0805-316',
    sides: [
      {
        name: 'Front',
        image: 'https://media.britishmuseum.org/media/Repository/Documents/2016_6/30_13/c5101042_ad8a_4400_89d0_a63500e1a98c/large_CGR47119_obv.jpg',
        alt: 'Front of an Athenian tetradrachm with Athena wearing a crested helmet',
        marks: [{ x: 43, y: 27, width: 31, height: 49 }, { x: 39, y: 20, width: 39, height: 31 }, { x: 52, y: 20, width: 16, height: 14 }],
        notes: [['Athena', 'The city goddess is the defining portrait of Athenian silver.'], ['Crested helmet', 'Helmet shape and decoration distinguish Athena from a ruler portrait.'], ['Olive leaves', 'The olive ornament reinforces the connection to Athens.']],
      },
      {
        name: 'Back',
        image: 'https://media.britishmuseum.org/media/Repository/Documents/2016_6/30_13/cfda89d5_033d_459c_9f69_a63500e1faeb/large_CGR47119_rev.jpg',
        alt: 'Back of an Athenian tetradrachm with owl, olive spray, and city letters',
        marks: [{ x: 42, y: 30, width: 31, height: 43 }, { x: 37, y: 31, width: 13, height: 23 }, { x: 63, y: 40, width: 10, height: 27 }],
        notes: [['Owl', 'Athena\'s owl is the clearest symbol of an Athenian coin.'], ['Olive spray', 'The small branch beside the owl repeats the city\'s sacred plant.'], ['City letters', 'The Greek letters ΑΘΕ abbreviate the Athenians.']],
      },
    ],
  },
  {
    label: 'Egypt',
    source: 'https://numismatics.org/collection/1941.131.1158',
    sides: [
      {
        name: 'Front',
        image: 'https://numismatics.org/collectionimages/19001949/1941/1941.131.1158.obv.noscale.jpg',
        alt: 'Front of an Alexandrian bronze coin with a portrait of Cleopatra VII',
        marks: [{ x: 34, y: 16, width: 50, height: 69 }, { x: 24, y: 8, width: 49, height: 36 }, { x: 23, y: 31, width: 27, height: 33 }],
        notes: [['Cleopatra VII', 'The royal portrait identifies the late Ptolemaic period.'], ['Diadem', 'The narrow royal band is a Hellenistic sign of kingship.'], ['Hair knot', 'The tied bun is a useful feature on Cleopatra portrait types.']],
      },
      {
        name: 'Back',
        image: 'https://numismatics.org/collectionimages/19001949/1941/1941.131.1158.rev.noscale.jpg',
        alt: 'Back of an Alexandrian bronze coin with an eagle and Greek legend',
        marks: [{ x: 28, y: 17, width: 47, height: 66 }, { x: 57, y: 29, width: 19, height: 20 }, { x: 8, y: 8, width: 84, height: 81 }],
        notes: [['Eagle', 'An eagle on a thunderbolt is a hallmark of Ptolemaic coinage.'], ['Denomination mark', 'The Greek letter pi marks the large 80 drachm value.'], ['Greek legend', 'The royal Greek inscription reflects Alexandria\'s Ptolemaic court.']],
      },
    ],
  },
  {
    label: 'Peru',
    source: 'https://numismatics.org/collection/1919.267.1',
    sides: [
      {
        name: 'Front',
        image: 'https://numismatics.org/collectionimages/19001949/1919/1919.267.1.obv.noscale.jpg',
        alt: 'Front of a Spanish colonial eight reales coin minted in Lima in 1697',
        marks: [{ x: 26, y: 22, width: 51, height: 57 }, { x: 13, y: 36, width: 21, height: 22 }, { x: 40, y: 78, width: 25, height: 15 }],
        notes: [['Royal arms', 'Castles and lions identify Spanish royal authority.'], ['Lima mint mark', 'The large L at left points directly to Lima.'], ['Date', 'The final digits 97 appear below the cross; the catalog dates the coin to 1697.']],
      },
      {
        name: 'Back',
        image: 'https://numismatics.org/collectionimages/19001949/1919/1919.267.1.rev.noscale.jpg',
        alt: 'Back of a Spanish colonial eight reales coin with pillars and waves',
        marks: [{ x: 31, y: 16, width: 42, height: 61 }, { x: 20, y: 66, width: 62, height: 18 }, { x: 40, y: 17, width: 22, height: 20 }],
        notes: [['Pillars', 'The Pillars of Hercules are a signature Spanish colonial device.'], ['Waves', 'Wave lines under the pillars are common on Lima and Potosi issues.'], ['Denomination', 'The central 8 states the eight reales value.']],
      },
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
  imageZoomButton: document.querySelector('#image-zoom-button'),
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
  answerDetailPlace: document.querySelector('#answer-detail-place'),
  answerDetailTitle: document.querySelector('#answer-detail-title'),
  answerGuessYear: document.querySelector('#answer-guess-year'),
  answerDocumentedYear: document.querySelector('#answer-documented-year'),
  blurb: document.querySelector('#answer-blurb'),
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
  studyFlip: document.querySelector('#study-flip'),
  studyZoom: document.querySelector('#study-zoom'),
  studySideLabel: document.querySelector('#study-side-label'),
  studyMarks: document.querySelector('#study-marks'),
  studyNotes: document.querySelector('#study-notes'),
  studySource: document.querySelector('#study-source'),
  imageZoomDialog: document.querySelector('#image-zoom-dialog'),
  imageZoomTitle: document.querySelector('#image-zoom-title'),
  imageZoomImage: document.querySelector('#image-zoom-image'),
  imageZoomViewport: document.querySelector('#image-zoom-viewport'),
  zoomFlip: document.querySelector('#zoom-flip'),
  zoomIn: document.querySelector('#zoom-in'),
  zoomOut: document.querySelector('#zoom-out'),
  zoomClose: document.querySelector('#zoom-close'),
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
let studyGuideIndex = 0;
let studySideIndex = 0;
let studyFlipTimers = [];
let studyFlipping = false;
let imageZoomLevel = 1;
let imageZoomContext = '';
const moneyById = new Map(MONEY.map((item) => [item.id, item]));
const failedImageIds = new Set();

function clearStudyFlip() {
  studyFlipTimers.forEach(clearTimeout);
  studyFlipTimers = [];
  studyFlipping = false;
  elements.studyImageFrame.classList.remove('is-turning');
}

function renderStudySide(sideIndex) {
  const guide = STUDY_GUIDES[studyGuideIndex];
  const side = guide.sides[sideIndex] || guide.sides[0];
  studySideIndex = guide.sides.indexOf(side);
  elements.studyImageFrame.classList.remove('image-error');
  elements.studyImage.src = side.image;
  elements.studyImage.alt = side.alt;
  elements.studySideLabel.textContent = side.name;
  const nextSide = studySideIndex === 0 ? 'back' : 'front';
  elements.studyFlip.textContent = `See ${nextSide}`;
  elements.studyImageFrame.setAttribute('aria-label', `Show ${nextSide} of ${guide.label} example`);
  elements.studyImageFrame.setAttribute('aria-pressed', String(studySideIndex === 1));
  for (const button of elements.studyButtons) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.studyExample) === studyGuideIndex));
  }
  elements.studyMarks.replaceChildren();
  side.marks.forEach((mark, markIndex) => {
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
  side.notes.forEach(([title, detail]) => {
    const item = document.createElement('li');
    const copy = document.createElement('span');
    const heading = document.createElement('strong');
    heading.textContent = title;
    copy.append(heading, detail);
    item.append(copy);
    elements.studyNotes.append(item);
  });
}

function renderStudyGuide(index) {
  clearStudyFlip();
  studyGuideIndex = STUDY_GUIDES[index] ? index : 0;
  const guide = STUDY_GUIDES[studyGuideIndex];
  renderStudySide(0);
  elements.studySource.href = guide.source;
  elements.studySource.setAttribute('aria-label', `View museum record for the ${guide.label} example`);
}

function toggleStudySide() {
  if (studyFlipping) return;
  const nextSide = studySideIndex === 0 ? 1 : 0;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    renderStudySide(nextSide);
    return;
  }
  studyFlipping = true;
  elements.studyImageFrame.classList.add('is-turning');
  studyFlipTimers.push(window.setTimeout(() => renderStudySide(nextSide), 180));
  studyFlipTimers.push(window.setTimeout(() => clearStudyFlip(), 400));
}

function setImageZoom(level) {
  imageZoomLevel = Math.max(1, Math.min(3, level));
  elements.imageZoomImage.style.setProperty('--image-zoom', `${imageZoomLevel * 100}%`);
  elements.zoomOut.disabled = imageZoomLevel === 1;
  elements.zoomIn.disabled = imageZoomLevel === 3;
}

function replaceZoomImage(image, title, preservePosition = false) {
  if (!image?.src) return;
  const maxScrollX = Math.max(1, elements.imageZoomViewport.scrollWidth - elements.imageZoomViewport.clientWidth);
  const maxScrollY = Math.max(1, elements.imageZoomViewport.scrollHeight - elements.imageZoomViewport.clientHeight);
  const scrollRatioX = elements.imageZoomViewport.scrollLeft / maxScrollX;
  const scrollRatioY = elements.imageZoomViewport.scrollTop / maxScrollY;
  const restorePosition = () => {
    if (!preservePosition) {
      elements.imageZoomViewport.scrollTo({ top: 0, left: 0 });
      return;
    }
    const nextMaxX = Math.max(0, elements.imageZoomViewport.scrollWidth - elements.imageZoomViewport.clientWidth);
    const nextMaxY = Math.max(0, elements.imageZoomViewport.scrollHeight - elements.imageZoomViewport.clientHeight);
    elements.imageZoomViewport.scrollTo({ left: nextMaxX * scrollRatioX, top: nextMaxY * scrollRatioY });
  };
  elements.imageZoomImage.src = image.src;
  elements.imageZoomImage.alt = image.alt;
  elements.imageZoomTitle.textContent = title;
  if (elements.imageZoomImage.complete) requestAnimationFrame(restorePosition);
  else elements.imageZoomImage.addEventListener('load', restorePosition, { once: true });
}

function openImageZoom(image, title, context) {
  if (!image?.src) return;
  imageZoomContext = context;
  setImageZoom(window.innerWidth < 760 ? 1.5 : 1);
  replaceZoomImage(image, title);
  elements.imageZoomDialog.showModal();
}

function openSpecimenZoom() {
  const flipped = elements.card.classList.contains('flipped');
  openImageZoom(flipped ? elements.backImage : elements.image, flipped ? 'Back detail' : 'Front detail', 'specimen');
}

function openStudyZoom() {
  openImageZoom(elements.studyImage, `${STUDY_GUIDES[studyGuideIndex].label} detail`, 'study');
}

function flipZoomedImage() {
  if (imageZoomContext === 'specimen') {
    const flipped = !elements.card.classList.contains('flipped');
    clearFlipDemo();
    setFlipSide(flipped);
    replaceZoomImage(flipped ? elements.backImage : elements.image, flipped ? 'Back detail' : 'Front detail', true);
    return;
  }
  if (imageZoomContext === 'study') {
    renderStudySide(studySideIndex === 0 ? 1 : 0);
    replaceZoomImage(elements.studyImage, `${STUDY_GUIDES[studyGuideIndex].label} detail`, true);
  }
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
  elements.imageZoomButton.disabled = true;
  elements.flip.setAttribute('aria-pressed', 'false');
  elements.flip.setAttribute('aria-label', 'Show reverse side');
  elements.skeleton.classList.remove('hidden');
  elements.image.alt = item.image.alt;
  loadMattedImage(elements.image, item.image.url, () => {
    frontReady = true;
    elements.skeleton.classList.add('hidden');
    elements.card.classList.add('ready');
    elements.imageZoomButton.disabled = false;
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
  elements.answerDetailPlace.textContent = elements.answerPlace.textContent;
  elements.answerDetailTitle.textContent = activeMoney.title;
  elements.blurb.textContent = activeMoney.blurb;
  elements.answerGuessYear.textContent = formatYear(result.yearGuess);
  elements.answerDocumentedYear.textContent = activeMoney.year;
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

async function renderShareCardBlob() {
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

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function downloadShareCard(blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = mode === 'daily' ? `origins-${editionNumber()}.png` : 'origins-practice.png';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyShareResult() {
  if (!lastResult) return;
  try {
    const blob = await renderShareCardBlob();
    if (!blob) throw new Error('Card rendering failed');
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast('Card copied');
        return;
      } catch {}
    }
    downloadShareCard(blob);
    showToast('Card downloaded');
  } catch {
    showToast('Could not create card');
  }
}

async function saveShareCard() {
  const blob = await renderShareCardBlob();
  if (!blob) {
    showToast('Could not save card');
    return;
  }
  downloadShareCard(blob);
  showToast('Card saved');
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
  elements.imageZoomButton.addEventListener('click', openSpecimenZoom);
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
  elements.studyFlip.addEventListener('click', toggleStudySide);
  elements.studyZoom.addEventListener('click', openStudyZoom);
  elements.studyImageFrame.addEventListener('click', toggleStudySide);
  elements.studyImage.addEventListener('load', () => elements.studyImageFrame.classList.remove('image-error'));
  elements.studyImage.addEventListener('error', () => elements.studyImageFrame.classList.add('image-error'));
  elements.zoomFlip.addEventListener('click', flipZoomedImage);
  elements.zoomIn.addEventListener('click', () => setImageZoom(imageZoomLevel + 0.5));
  elements.zoomOut.addEventListener('click', () => setImageZoom(imageZoomLevel - 0.5));
  elements.zoomClose.addEventListener('click', () => elements.imageZoomDialog.close());
  elements.imageZoomImage.addEventListener('dblclick', () => setImageZoom(imageZoomLevel >= 3 ? 1 : imageZoomLevel + 0.5));
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
