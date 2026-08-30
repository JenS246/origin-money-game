import test from 'node:test';
import assert from 'node:assert/strict';
import { MONEY } from '../src/money.generated.js';

test('the shipped corpus is large enough for varied play', () => {
  assert.ok(MONEY.length >= 50);
  assert.equal(new Set(MONEY.map((item) => item.id)).size, MONEY.length);
  assert.equal(new Set(MONEY.map((item) => item.title.toLowerCase())).size, MONEY.length);
  assert.ok(MONEY.filter((item) => item.type === 'banknote').length >= 8);
  assert.ok(new Set(MONEY.map((item) => item.anchor.label)).size >= 40);
});

test('every record has a playable target and auditable sources', () => {
  for (const item of MONEY) {
    assert.ok(item.title);
    assert.ok(item.issuer);
    assert.ok(item.year);
    assert.ok(Number.isFinite(item.anchor.lat) && item.anchor.lat >= -90 && item.anchor.lat <= 90);
    assert.ok(Number.isFinite(item.anchor.lng) && item.anchor.lng >= -180 && item.anchor.lng <= 180);
    assert.ok(item.anchor.method);
    assert.notEqual(item.anchor.method, 'representative_point');
    assert.ok(Number.isFinite(item.anchor.radiusKm) && item.anchor.radiusKm >= 50 && item.anchor.radiusKm <= 1000);
    assert.match(item.articleUrl, /^https:\/\/numismatics\.org\/collection\//);
    assert.match(item.anchor.sourceUrl, /^https?:\/\//);
    assert.match(item.image.url, /^https:\/\/numismatics\.org\/collectionimages\//);
    assert.match(item.image.backUrl, /^https:\/\/numismatics\.org\/collectionimages\//);
    assert.match(item.image.filePage, /^https:\/\/numismatics\.org\/collection\//);
    assert.ok(item.image.author);
    assert.equal(item.image.license, 'Public Domain Mark');
  }
});

test('visible corpus copy avoids typographic separator dashes', () => {
  assert.doesNotMatch(JSON.stringify(MONEY), /[—–]/);
});
