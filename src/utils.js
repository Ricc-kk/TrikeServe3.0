// ...existing code...
// Utility helpers for geospatial calculations and simple mocks

function toRadians(deg) {
  return deg * Math.PI / 180;
}

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function sortDriversByDistance(drivers, destLat, destLng) {
  // drivers: array of { id, lat, lng }
  return drivers.map(d => ({ ...d, distance_m: Math.round(haversineDistanceMeters(d.lat, d.lng, destLat, destLng)), duration_s: Math.round(haversineDistanceMeters(d.lat, d.lng, destLat, destLng) / 10) }))
    .sort((a,b) => a.duration_s - b.duration_s);
}

function mockPolylineBetween(aLat, aLng, bLat, bLng, points = 10) {
  const out = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    out.push({ lat: aLat + (bLat - aLat) * t, lng: aLng + (bLng - aLng) * t });
  }
  return out;
}

module.exports = { haversineDistanceMeters, sortDriversByDistance, mockPolylineBetween };

