const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.GEO_DB_PATH || path.join(__dirname, '..', 'data', 'geo.db');

// ensure data dir
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new sqlite3.Database(DB_PATH);

// Initialize tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS drivers (
    id TEXT PRIMARY KEY,
    lat REAL,
    lng REAL,
    status TEXT,
    token TEXT,
    updated_at TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS rides (
    id TEXT PRIMARY KEY,
    rider_id TEXT,
    pickup_lat REAL,
    pickup_lng REAL,
    dropoff_lat REAL,
    dropoff_lng REAL,
    status TEXT,
    created_at TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ride_id TEXT,
    driver_id TEXT,
    assigned_at TEXT
  )`);
});

function upsertDriver(driver, cb) {
  const now = new Date().toISOString();
  const stmt = `INSERT INTO drivers (id, lat, lng, status, token, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET lat=excluded.lat, lng=excluded.lng, status=excluded.status, token=excluded.token, updated_at=excluded.updated_at`;
  db.run(stmt, [driver.id, driver.lat, driver.lng, driver.status || 'available', driver.token || null, now], function(err) {
    cb && cb(err);
  });
}

function getDriver(id, cb) {
  db.get(`SELECT * FROM drivers WHERE id = ?`, [id], cb);
}

function listAvailableDrivers(cb) {
  db.all(`SELECT * FROM drivers WHERE status = 'available'`, cb);
}

function persistAssignment(rideId, driverId, cb) {
  const now = new Date().toISOString();
  db.run(`INSERT INTO assignments (ride_id, driver_id, assigned_at) VALUES (?, ?, ?)`, [rideId, driverId, now], function(err) {
    cb && cb(err, { id: this.lastID });
  });
}

function persistRide(ride, cb) {
  const now = new Date().toISOString();
  db.run(`INSERT OR REPLACE INTO rides (id, rider_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [ride.id, ride.rider_id || null, ride.pickup_lat, ride.pickup_lng, ride.dropoff_lat, ride.dropoff_lng, ride.status || 'requested', now], function(err) {
    cb && cb(err);
  });
}

module.exports = { db, upsertDriver, getDriver, listAvailableDrivers, persistAssignment, persistRide };

