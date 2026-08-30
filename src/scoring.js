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

export function distanceBand(kilometers) {
  if (kilometers < 100) return 'near-perfect';
  if (kilometers < 750) return 'close';
  if (kilometers < 2500) return 'in range';
  if (kilometers < 6000) return 'far';
  return 'worlds away';
}
