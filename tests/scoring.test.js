import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, pointsForDistance } from '../src/scoring.js';

test('distance is zero for the same point', () => {
  assert.equal(distanceKm({ lat: 10, lng: 20 }, { lat: 10, lng: 20 }), 0);
});

test('distance matches the London to New York great-circle distance', () => {
  const distance = distanceKm(
    { lat: 51.5072, lng: -0.1276 },
    { lat: 40.7128, lng: -74.006 },
  );
  assert.ok(distance > 5550 && distance < 5600);
});

test('score is capped and decreases smoothly', () => {
  assert.equal(pointsForDistance(0), 5000);
  assert.ok(pointsForDistance(100) > pointsForDistance(1000));
  assert.ok(pointsForDistance(1000) > pointsForDistance(5000));
  assert.equal(pointsForDistance(-1), 0);
});
