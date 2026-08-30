const EARTH_RADIUS_KM = 6371.0088;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function distanceKm(from, to) {
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

export function distanceFromAcceptedArea(from, anchor) {
  const rawDistance = distanceKm(from, anchor);
  const radius = Number.isFinite(anchor.radiusKm) ? Math.max(0, anchor.radiusKm) : 0;
  return {
    rawDistance,
    distance: Math.max(0, rawDistance - radius),
  };
}

export function pointsForDistance(kilometers) {
  if (!Number.isFinite(kilometers) || kilometers < 0) return 0;
  if (kilometers < 1) return 5000;
  return Math.max(0, Math.round(5000 * Math.exp(-kilometers / 2400)));
}

export function yearRange(dateLabel) {
  const matches = [...String(dateLabel).matchAll(/(\d+)\s*(BCE)?/gi)];
  if (!matches.length) return null;
  const years = matches.map((match) => {
    const value = Number(match[1]);
    return match[2] ? -value : value;
  });
  return {
    min: Math.min(...years),
    max: Math.max(...years),
  };
}

export function yearDistance(guess, dateLabel) {
  const range = yearRange(dateLabel);
  if (!range || !Number.isFinite(guess)) return Number.POSITIVE_INFINITY;
  if (guess < range.min) return range.min - guess;
  if (guess > range.max) return guess - range.max;
  return 0;
}

export function pointsForYear(yearsOff) {
  if (!Number.isFinite(yearsOff) || yearsOff < 0) return 0;
  if (yearsOff < 1) return 1000;
  return Math.max(0, Math.round(1000 * Math.exp(-yearsOff / 240)));
}

export function combinedPoints(distancePoints, datePoints) {
  const mapShare = Math.max(0, Math.min(5000, distancePoints)) * 0.8;
  const dateShare = Math.max(0, Math.min(1000, datePoints));
  return Math.round(mapShare + dateShare);
}

export function formatYear(year) {
  const rounded = Math.round(Number(year));
  if (!Number.isFinite(rounded)) return '';
  return rounded < 0 ? `${Math.abs(rounded)} BCE` : String(Math.max(1, rounded));
}

export function distanceBand(kilometers) {
  if (kilometers < 100) return 'near-perfect';
  if (kilometers < 750) return 'close';
  if (kilometers < 2500) return 'in range';
  if (kilometers < 6000) return 'far';
  return 'worlds away';
}
