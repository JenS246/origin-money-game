import test from 'node:test';
import assert from 'node:assert/strict';
import { MONEY } from '../src/money.generated.js';

test('the shipped corpus is large enough for varied play', () => {
  assert.ok(MONEY.length >= 35);
  assert.equal(new Set(MONEY.map((item) => item.id)).size, MONEY.length);
});

test('every record has a playable target and auditable sources', () => {
  for (const item of MONEY) {
    assert.ok(item.title);
    assert.ok(item.issuer);
    assert.ok(Number.isFinite(item.anchor.lat) && item.anchor.lat >= -90 && item.anchor.lat <= 90);
    assert.ok(Number.isFinite(item.anchor.lng) && item.anchor.lng >= -180 && item.anchor.lng <= 180);
    assert.ok(item.anchor.method);
    assert.match(item.articleUrl, /^https:\/\/en\.wikipedia\.org\/wiki\//);
    assert.match(item.image.url, /^https:\/\/upload\.wikimedia\.org\//);
    assert.match(item.image.filePage, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.ok(item.image.author);
    assert.ok(item.image.license);
  }
});

test('visible corpus copy avoids typographic separator dashes', () => {
  assert.doesNotMatch(JSON.stringify(MONEY), /[—–]/);
});
