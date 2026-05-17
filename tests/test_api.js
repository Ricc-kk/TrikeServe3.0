const axios = require('axios');
const assert = require('assert');

const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function run() {
  console.log('Running tests against', BASE);
  // health
  const h = await axios.get(`${BASE}/api/health`);
  console.log('/api/health ->', h.data);
  assert(h.data.ok, 'health ok');

  // suggestions (mock)
  const s = await axios.get(`${BASE}/api/suggestions?lat=14.5995&lng=120.9842`);
  console.log('/api/suggestions ->', s.data);
  assert(Array.isArray(s.data) && s.data.length > 0, 'suggestions returned');

  // route (mock)
  const r = await axios.get(`${BASE}/api/route?origin=14.5995,120.9842&destination=14.6126,121.0223`);
  console.log('/api/route ->', { distance: r.data.distance, duration: r.data.duration, mocked: r.data.mocked });
  assert(r.data.distance > 0, 'route distance');
  assert(r.data.polyline && r.data.polyline.length >= 2, 'polyline exists');

  // nearest-driver (mock)
  const drivers = '14.6000,120.9850,drv1|14.6050,120.9900,drv2|14.5800,120.9700,drv3';
  const nd = await axios.get(`${BASE}/api/nearest-driver?drivers=${encodeURIComponent(drivers)}&dest=14.5995,120.9842`);
  console.log('/api/nearest-driver ->', nd.data);
  assert(Array.isArray(nd.data) && nd.data.length > 0, 'nearest-driver returned');

  // assign-driver
  // The mock /api/nearest-driver returns driver objects directly; pass them to assign-driver
  const assign = await axios.post(`${BASE}/api/assign-driver`, { rideId: 'ride123', drivers: nd.data.map(x => x), pickup: { lat: 14.5995, lng: 120.9842 } });
  console.log('/api/assign-driver ->', assign.data);
  assert(assign.data.assignedDriver, 'assigned driver present');

  // register a driver to test persistence
  const reg = await axios.post(`${BASE}/api/drivers`, { id: 'drv_test_1', lat: 14.6, lng: 120.985, status: 'available', token: null });
  console.log('/api/drivers register ->', reg.data);
  assert(reg.data.ok === true, 'driver registered');

  // optimize-route (mock heuristic)
  const optReq = { vehicles: [{ id: 'veh1', start_location: { lat: 14.5995, lng: 120.9842 }, capacity: 2 }], jobs: [{ id: 'job1', location: { lat: 14.6007, lng: 120.985 }, demand: 1 }, { id: 'job2', location: { lat: 14.5986, lng: 120.9827 }, demand: 1 }] };
  const opt = await axios.post(`${BASE}/api/optimize-route`, optReq);
  console.log('/api/optimize-route ->', opt.data);
  assert(opt.data.vehicles && Array.isArray(opt.data.vehicles), 'optimize-route returned');

  console.log('All tests passed');
}

run().catch(err => {
  console.error('Tests failed', err && err.response && err.response.data ? err.response.data : err.message);
  process.exit(2);
});



