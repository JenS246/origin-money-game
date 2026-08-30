import test from 'node:test';
import assert from 'node:assert/strict';
import { MONEY } from '../src/money.generated.js';
import { DAILY_IDS } from '../src/daily.generated.js';

test('the shipped corpus is large enough for varied play', () => {
  assert.ok(MONEY.length >= 1000);
  assert.equal(new Set(MONEY.map((item) => item.id)).size, MONEY.length);
  assert.equal(new Set(MONEY.map((item) => item.title.toLowerCase())).size, MONEY.length);
  assert.ok(MONEY.filter((item) => item.type === 'banknote').length >= 8);
  assert.ok(MONEY.filter((item) => item.id.startsWith('si-')).length >= 10);
  assert.ok(MONEY.filter((item) => item.id.startsWith('boc-')).length >= 100);
  assert.ok(new Set(MONEY.map((item) => item.anchor.label)).size >= 40);
});

test('the daily schedule is hash-shuffled instead of following corpus order', () => {
  const corpusOrder = MONEY.map((item) => item.id);
  assert.notDeepEqual(DAILY_IDS, corpusOrder);
  const unchangedPositions = DAILY_IDS.filter((id, index) => id === corpusOrder[index]).length;
  assert.ok(unchangedPositions <= Math.max(2, Math.floor(MONEY.length * 0.01)));
});

test('every playable object appears exactly once in the checked-in daily schedule', () => {
  assert.equal(DAILY_IDS.length, MONEY.length);
  assert.equal(new Set(DAILY_IDS).size, DAILY_IDS.length);
  assert.deepEqual(new Set(DAILY_IDS), new Set(MONEY.map((item) => item.id)));
});

test('every record has a playable target and auditable sources', () => {
  for (const item of MONEY) {
    assert.ok(item.title);
    assert.notEqual(item.title, 'National Currency Collection');
    assert.ok(item.issuer);
    assert.ok(item.year);
    assert.ok(Number.isFinite(item.anchor.lat) && item.anchor.lat >= -90 && item.anchor.lat <= 90);
    assert.ok(Number.isFinite(item.anchor.lng) && item.anchor.lng >= -180 && item.anchor.lng <= 180);
    assert.ok(item.anchor.method);
    assert.notEqual(item.anchor.method, 'representative_point');
    assert.ok(Number.isFinite(item.anchor.radiusKm) && item.anchor.radiusKm >= 50 && item.anchor.radiusKm <= 1000);
    assert.match(item.articleUrl, /^https:\/\/(?:numismatics\.org\/collection\/|americanhistory\.si\.edu\/collections\/object\/|www\.bankofcanadamuseum\.ca\/collection\/artefact\/view\/)/);
    assert.match(item.anchor.sourceUrl, /^https?:\/\//);
    assert.match(item.image.url, /^https:\/\/(?:numismatics\.org\/collectionimages\/|ids\.si\.edu\/ids\/deliveryService|www\.bankofcanadamuseum\.ca\/collection\/images\/)/);
    assert.match(item.image.backUrl, /^https:\/\/(?:numismatics\.org\/collectionimages\/|ids\.si\.edu\/ids\/deliveryService|www\.bankofcanadamuseum\.ca\/collection\/images\/)/);
    assert.match(item.image.filePage, /^https:\/\/(?:numismatics\.org\/collection\/|americanhistory\.si\.edu\/collections\/object\/|www\.bankofcanadamuseum\.ca\/collection\/artefact\/view\/)/);
    assert.ok(item.image.author);
    assert.ok(['Public Domain Mark', 'CC0', 'Bank of Canada permitted reuse'].includes(item.image.license));
  }
});

test('visible corpus copy avoids typographic separator dashes', () => {
  assert.doesNotMatch(JSON.stringify(MONEY), /[—–]/);
});
