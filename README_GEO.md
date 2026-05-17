TrikeServe Geo Microservice

This small microservice implements server-side endpoints for routing, place suggestions, nearest-driver selection, and a simple driver assignment flow. It's built so you can test locally without real Google API keys by using MOCK_GOOGLE=1.

Quick start (Windows PowerShell):

1. Install dependencies

```powershell
npm install
```

2. Start server in mock mode (no Google key required)

```powershell
$env:MOCK_GOOGLE='1'; $env:PORT='3000'; npm start
```

3. Run the lightweight test suite (in a new terminal)

```powershell
npm test
```

Files created:
- `server.js` - main Express app
- `src/utils.js` - helpers (distance, mock polyline)
- `tests/test_api.js` - test script that calls endpoints
- `.env.example` - example env vars
- `package.json` - project manifest

Notes:
- To call real Google APIs set `GOOGLE_SERVER_KEY` in your environment (restrict to server IPs) and unset/mock accordingly.
- Endpoints:
  - GET /api/health
  - GET /api/suggestions?lat=...&lng=...
  - GET /api/route?origin=lat,lng&destination=lat,lng
  - GET /api/nearest-driver?drivers=lat,lng|lat2,lng2&dest=lat,lng
  - POST /api/assign-driver  (body: { rideId, drivers: [{id,lat,lng}], pickup: {lat,lng} })

Integration tips:
- Use this service as a secure proxy for Google APIs that must not expose server keys.
- When moving to production, implement authentication, persist assignments, and hook into push notifications to contact drivers.

