import test from 'node:test';
import assert from 'node:assert/strict';
import {
  combinedPoints,
  distanceFromAcceptedArea,
  distanceKm,
  formatYear,
  pointsForDistance,
  pointsForYear,
  yearDistance,
  yearRange,
} from '../src/scoring.js';

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

test('antipodal points are half an earth circumference apart', () => {
  const distance = distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
  assert.ok(distance > 20_000 && distance < 20_020);
});

test('score is capped and decreases smoothly', () => {
  assert.equal(pointsForDistance(0), 5000);
  assert.ok(pointsForDistance(100) > pointsForDistance(1000));
  assert.ok(pointsForDistance(1000) > pointsForDistance(5000));
  assert.equal(pointsForDistance(-1), 0);
});

test('accepted areas forgive distance inside their documented radius', () => {
  const anchor = { lat: 0, lng: 0, radiusKm: 150 };
  const inside = distanceFromAcceptedArea({ lat: 1, lng: 0 }, anchor);
  const outside = distanceFromAcceptedArea({ lat: 3, lng: 0 }, anchor);
  assert.equal(inside.distance, 0);
  assert.ok(inside.rawDistance > 100);
  assert.ok(outside.distance > 180 && outside.distance < 190);
});

test('date ranges handle common-era and BCE labels', () => {
  assert.deepEqual(yearRange('1540-1545'), { min: 1540, max: 1545 });
  assert.deepEqual(yearRange('314 BCE-310 BCE'), { min: -314, max: -310 });
  assert.equal(yearDistance(1542, '1540-1545'), 0);
  assert.equal(yearDistance(1500, '1540-1545'), 40);
  assert.equal(yearDistance(-312, '314 BCE-310 BCE'), 0);
  assert.equal(formatYear(-312), '312 BCE');
});

test('map and date scores combine into a 5,000 point total', () => {
  assert.equal(pointsForYear(0), 1000);
  assert.ok(pointsForYear(100) > pointsForYear(500));
  assert.equal(combinedPoints(5000, 1000), 5000);
  assert.equal(combinedPoints(0, 0), 0);
});
