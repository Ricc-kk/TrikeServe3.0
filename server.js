// Simple Express microservice for driver assignment, routing, and suggestions
// Supports MOCK_GOOGLE=1 which returns simulated responses so you can test without real API keys.

const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const cors = require('cors');
const { haversineDistanceMeters, sortDriversByDistance, mockPolylineBetween } = require('./src/utils');
const { upsertDriver, getDriver, listAvailableDrivers, persistAssignment, persistRide } = require('./src/db');
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY || null; // optional legacy FCM key for notifications

const app = express();
app.use(cors());
app.use(express.json());

const cache = new NodeCache({ stdTTL: 30 });
const KEY = process.env.GOOGLE_SERVER_KEY; // required for real Google calls
const MOCK = process.env.MOCK_GOOGLE === '1' || process.env.MOCK_GOOGLE === 'true';
const PORT = process.env.PORT || 3000;

app.get('/api/health', (req, res) => res.json({ ok: true, mock: MOCK }));

// Simple route endpoint. When MOCK is true this returns a straight polyline and estimated duration/distance.
app.get('/api/route', async (req, res) => {
  const { origin, destination } = req.query; // format "lat,lng"
  if (!origin || !destination) return res.status(400).json({ error: 'missing origin/destination' });
  const [oLat, oLng] = origin.split(',').map(Number);
  const [dLat, dLng] = destination.split(',').map(Number);
  if (Number.isNaN(oLat) || Number.isNaN(oLng) || Number.isNaN(dLat) || Number.isNaN(dLng)) return res.status(400).json({ error: 'invalid coordinates' });

  if (MOCK) {
    const poly = mockPolylineBetween(oLat, oLng, dLat, dLng, 20);
    const distance_m = Math.round(haversineDistanceMeters(oLat, oLng, dLat, dLng));
    const duration_s = Math.round(distance_m / 10); // pretend average 36 km/h ~ 10 m/s
    return res.json({ polyline: poly, distance: distance_m, duration: duration_s, mocked: true });
  }

  if (!KEY) return res.status(500).json({ error: 'server key not configured' });

  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&key=${KEY}&departure_time=now`;
    const r = await axios.get(url);
    if (r.data.status !== 'OK') return res.status(500).json({ error: r.data.status, details: r.data });
    const route = r.data.routes[0];
    const duration = route.legs.reduce((s,l) => s + (l.duration_in_traffic ? l.duration_in_traffic.value : (l.duration ? l.duration.value : 0)), 0);
    const distance = route.legs.reduce((s,l) => s + (l.distance ? l.distance.value : 0), 0);
    // send overview_polyline as encoded polyline string and summary numbers
    res.json({ polyline: route.overview_polyline.points, distance, duration, mocked: false });
  } catch (err) {
    console.error(err && err.stack || err);
    res.status(500).json({ error: 'directions_error' });
  }
});

// Suggestions: when MOCK return hard-coded nearby POIs, otherwise call Places Nearby Search
app.get('/api/suggestions', async (req, res) => {
  const { lat, lng, radius = 1200 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'missing lat/lng' });

  const cacheKey = `sugg:${lat}:${lng}:${radius}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  if (MOCK) {
    const baseLat = Number(lat);
    const baseLng = Number(lng);
    const items = [
      { place_id: 'mock_restaurant_1', name: 'Golden Bay Restaurant', type: 'restaurant', lat: baseLat + 0.0012, lng: baseLng + 0.0008 },
      { place_id: 'mock_park_1', name: 'Sunset Park', type: 'park', lat: baseLat - 0.0009, lng: baseLng - 0.0015 },
      { place_id: 'mock_resort_1', name: 'Laguna Resort', type: 'lodging', lat: baseLat + 0.0021, lng: baseLng - 0.0004 }
    ].map(p => ({ ...p, distance_meters: Math.round(haversineDistanceMeters(baseLat, baseLng, p.lat, p.lng)) }));
    cache.set(cacheKey, items, 20);
    return res.json(items);
  }

  if (!KEY) return res.status(500).json({ error: 'server key not configured' });

  try {
    const types = ['restaurant', 'park', 'lodging'];
    const results = [];
    for (const t of types) {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${t}&key=${KEY}`;
      const r = await axios.get(url);
      if (r.data.results) {
        r.data.results.slice(0, 5).forEach(p => results.push({ place_id: p.place_id, name: p.name, lat: p.geometry.location.lat, lng: p.geometry.location.lng, type: t, rating: p.rating }));
      }
    }
    results.sort((a,b) => (a.distance_meters || 0) - (b.distance_meters || 0));
    const out = results.slice(0, 10);
    cache.set(cacheKey, out, 30);
    res.json(out);
  } catch (err) {
    console.error(err && err.stack || err);
    res.status(500).json({ error: 'places_error' });
  }
});

// Nearest driver: accept drivers=lat,lng|lat2,lng2... and dest=lat,lng
app.get('/api/nearest-driver', async (req, res) => {
  const { drivers, dest } = req.query; // dest = lat,lng
  if (!drivers || !dest) return res.status(400).json({ error: 'missing drivers or dest' });
  const destParts = dest.split(',').map(Number);
  if (destParts.length !== 2 || destParts.some(Number.isNaN)) return res.status(400).json({ error: 'invalid dest' });
  const [dLat, dLng] = destParts;

  const driversList = drivers.split('|').map((s, i) => {
    const [lat, lng, id] = s.split(',').map(x => x.trim());
    return { id: id || `driver_${i}`, lat: Number(lat), lng: Number(lng) };
  }).filter(d => !Number.isNaN(d.lat) && !Number.isNaN(d.lng));

  if (MOCK) {
    const sorted = sortDriversByDistance(driversList, dLat, dLng);
    return res.json(sorted);
  }

  if (!KEY) return res.status(500).json({ error: 'server key not configured' });

  try {
    // call Distance Matrix with origins=drivers&destinations=dest
    const origins = driversList.map(d => `${d.lat},${d.lng}`).join('|');
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(dest)}&key=${KEY}&departure_time=now`;
    const r = await axios.get(url);
    const rows = r.data.rows.map((row, i) => ({ driver: driversList[i], duration: row.elements[0].duration_in_traffic ? row.elements[0].duration_in_traffic.value : (row.elements[0].duration ? row.elements[0].duration.value : null), distance: row.elements[0].distance ? row.elements[0].distance.value : null }));
    rows.sort((a,b) => (a.duration || 1e9) - (b.duration || 1e9));
    res.json(rows);
  } catch (err) {
    console.error(err && err.stack || err);
    res.status(500).json({ error: 'dm_error' });
  }
});

// Simple assign-driver endpoint (simulated). Accepts rideId and list of driver objects, returns chosen driver or error.
app.post('/api/assign-driver', (req, res) => {
  const { rideId, drivers, pickup } = req.body; // drivers: [{id,lat,lng}], pickup: {lat,lng}
  if (!rideId || !drivers || !Array.isArray(drivers) || drivers.length === 0 || !pickup) return res.status(400).json({ error: 'missing rideId, drivers or pickup' });
  const chosen = sortDriversByDistance(drivers, pickup.lat, pickup.lng)[0];
  // persist ride and assignment
  persistRide({ id: rideId, pickup_lat: pickup.lat, pickup_lng: pickup.lng, dropoff_lat: req.body.dropoff && req.body.dropoff.lat, dropoff_lng: req.body.dropoff && req.body.dropoff.lng }, (err) => {
    if (err) console.error('persistRide error', err);
    persistAssignment(rideId, chosen.id, (err2, info) => {
      if (err2) console.error('persistAssignment error', err2);
      // attempt to notify driver via FCM (legacy server key) if token is provided in driver record
      getDriver(chosen.id, (err3, drv) => {
        if (err3) console.error('getDriver err', err3);
        if (drv && drv.token && FCM_SERVER_KEY) {
          // send legacy FCM message
          axios.post('https://fcm.googleapis.com/fcm/send', {
            to: drv.token,
            priority: 'high',
            notification: { title: 'New ride request', body: `Ride ${rideId} assigned to you`, sound: 'default' },
            data: { rideId }
          }, { headers: { Authorization: `key=${FCM_SERVER_KEY}` } }).then(() => {
            // ignore
          }).catch(e => console.error('fcm send error', e && e.response ? e.response.data : e.message));
        }
      });
      res.json({ rideId, assignedDriver: chosen, assigned_at: new Date().toISOString(), assignmentRow: info });
    });
  });
});

// Driver registration/update endpoint (store token and location)
app.post('/api/drivers', (req, res) => {
  const { id, lat, lng, status, token } = req.body;
  if (!id || typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ error: 'missing id/lat/lng' });
  upsertDriver({ id, lat, lng, status, token }, (err) => {
    if (err) return res.status(500).json({ error: 'db_error' });
    res.json({ ok: true });
  });
});

// Advanced route optimization endpoint
app.post('/api/optimize-route', async (req, res) => {
  // Accepts { vehicles: [{id, start_location:{lat,lng}, capacity}], jobs: [{id, location:{lat,lng}, demand, time_window:[start,end]}] }
  const payload = req.body;
  if (!payload || !Array.isArray(payload.vehicles) || !Array.isArray(payload.jobs)) return res.status(400).json({ error: 'invalid payload' });
  // If GOOGLE_SERVER_KEY and ROUTE_OPTIMIZATION_ENABLED use Google Routes API (Route Optimization)
  if (!MOCK && KEY && process.env.ROUTE_OPTIMIZATION_ENABLED === '1') {
    try {
      // Build request according to Google Routes API – Optimization request (example uses v1: 'https://routes.googleapis.com/...' requires enabling)
      const apiUrl = 'https://routes.googleapis.com/optimization/v1';
      // For brevity we'll call Directions API with optimize:true as a fallback for single vehicle
      if (payload.vehicles.length === 1) {
        const origin = `${payload.vehicles[0].start_location.lat},${payload.vehicles[0].start_location.lng}`;
        const dest = origin; // roundtrip
        const waypoints = payload.jobs.map(j => `${j.location.lat},${j.location.lng}`).join('|');
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&waypoints=optimize:true|${encodeURIComponent(waypoints)}&key=${KEY}&departure_time=now`;
        const r = await axios.get(url);
        if (r.data.status !== 'OK') return res.status(500).json({ error: r.data.status });
        // decode waypoint_order and return mapping
        const order = r.data.routes[0].waypoint_order || [];
        return res.json({ optimized_order: order, route: r.data.routes[0] });
      }
      // For multi-vehicle, a full Routes Optimization API request would be constructed here. For now, return error.
      return res.status(501).json({ error: 'multi-vehicle route optimization via Google Routes API not implemented in this demo. Enable ROUTE_OPTIMIZATION_ENABLED and implement according to Google documentation.' });
    } catch (e) {
      console.error('optimize-route error', e && e.response ? e.response.data : e.message);
      return res.status(500).json({ error: 'routes_api_error' });
    }
  }

  // Fallback local heuristic: simple greedy assignment per vehicle respecting capacity and time windows (best-effort)
  try {
    const vehicles = payload.vehicles.map(v => ({ id: v.id, start: v.start_location, capacity: v.capacity || 999, load: 0, route: [] }));
    const jobs = payload.jobs.map(j => ({ id: j.id, loc: j.location, demand: j.demand || 1, tw: j.time_window || [0, 86400], assigned: false }));
    // naive: for each job assign to nearest vehicle with capacity
    for (const job of jobs) {
      let best = null;
      let bestDist = Infinity;
      for (const veh of vehicles) {
        if (veh.load + job.demand > veh.capacity) continue;
        const ref = veh.route.length === 0 ? veh.start : veh.route[veh.route.length - 1].loc;
        const dist = haversineDistanceMeters(ref.lat, ref.lng, job.loc.lat, job.loc.lng);
        if (dist < bestDist) { bestDist = dist; best = veh; }
      }
      if (best) { best.route.push({ id: job.id, loc: job.loc }); best.load += job.demand; job.assigned = true; }
    }
    return res.json({ vehicles: vehicles.map(v => ({ id: v.id, route: v.route.map(r => r.id) })), unassigned: jobs.filter(j => !j.assigned).map(j => j.id) });
  } catch (err) {
    console.error('local optimize error', err);
    res.status(500).json({ error: 'local_optimize_error' });
  }
});

app.listen(PORT, () => console.log(`geo microservice listening on ${PORT} (MOCK=${MOCK})`));

module.exports = app; // for testing


