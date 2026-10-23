import { createClient } from '@supabase/supabase-js';
import { buildChatThreadKey } from './chat';
import { normalizeTerminalColor, normalizeRouteColor, normalizeBorderColor } from '../app/components/ui/TerminalIcon';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// Support both legacy and current env var names for the client key.
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

console.log('[Supabase Init] Checking environment variables...');
console.log('[Supabase Init] VITE_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
console.log('[Supabase Init] VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ Set' : '❌ Missing');
console.log(
  '[Supabase Init] VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY:',
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ? '✅ Set' : '❌ Missing'
);

// Check if credentials are configured
if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [];
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY');

  const errorMsg =
    `\n\n❌ SUPABASE CONFIGURATION ERROR\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Missing environment variables: ${missing.join(', ')}\n\n` +
    `How to fix:\n` +
    `1. Open the file: .env.local (in project root)\n` +
    `2. Make sure it contains:\n` +
    `   VITE_SUPABASE_URL=https://azmzuucnfqqymnunntmw.supabase.co\n` +
    `   VITE_SUPABASE_ANON_KEY=your_actual_key_here\n` +
    `   # OR\n` +
    `   VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_actual_key_here\n\n` +
    `3. Get the key from: Supabase Dashboard → Settings → API\n` +
    `4. STOP the dev server (Ctrl+C)\n` +
    `5. DELETE the .vite cache folder in node_modules\n` +
    `6. RESTART with: npm run dev\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  console.error(errorMsg);
  throw new Error(`Missing Supabase credentials: ${missing.join(', ')}`);
}

console.log('[Supabase Init] ✅ All credentials loaded successfully');

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);

// ---------------------------------------------------------------------------
// Helper: resolve admin credentials (email + password) from the passed-in
// object OR from localStorage.  Admins have no Supabase Auth session, so
// Edge Functions verify them via the admins table.
// ---------------------------------------------------------------------------
function resolveAdminCredentials(
  adminCredentials?: { email: string; password: string }
): { email: string; password: string } | undefined {
  // Prefer explicitly passed credentials
  if (adminCredentials?.email && adminCredentials?.password) {
    console.log('[AdminCreds] Using passed-in credentials:', adminCredentials.email);
    return adminCredentials;
  }
  // Fall back to localStorage (set during admin login)
  try {
    const raw = localStorage.getItem('trikeserve_admin_credentials');
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored?.email && stored?.password) {
        console.log('[AdminCreds] Using localStorage credentials:', stored.email);
        return stored;
      }
    }
    console.warn('[AdminCreds] No admin credentials found in localStorage');
  } catch (e) { console.warn('[AdminCreds] localStorage parse error:', e); }
  // Last resort: try reading from the current user object in localStorage
  try {
    const userRaw = localStorage.getItem('trikeserve_current_user');
    if (userRaw) {
      const storedUser = JSON.parse(userRaw);
      if (storedUser?.email && storedUser?.password && storedUser?.role === 'admin') {
        console.log('[AdminCreds] Using current_user fallback:', storedUser.email);
        return { email: storedUser.email, password: storedUser.password };
      }
    }
  } catch { /* ignore */ }
  console.error('[AdminCreds] No admin credentials available anywhere');
  return undefined;
}

// ---------------------------------------------------------------------------
// Admin: delete a user completely (profile row + Supabase Auth account)
// ---------------------------------------------------------------------------
// The anon key cannot delete from auth.users and RLS blocks profile deletes,
// so this goes through the `delete-user` Edge Function which uses the service
// role key server-side. The function verifies the caller is an admin.
export async function adminDeleteUser(
  userId: string,
  adminCredentials?: { email: string; password: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const creds = resolveAdminCredentials(adminCredentials);

    const response = await fetch(`${supabaseUrl}/functions/v1/delete-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        ...(creds && { adminEmail: creds.email, adminPassword: creds.password }),
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { success: false, error: result.error || `Delete failed (${response.status})` };
    }

    return { success: true };
  } catch (error) {
    console.error('adminDeleteUser error:', error);
    return { success: false, error: 'Network error while deleting user' };
  }
}

// ---------------------------------------------------------------------------
// Admin: verify a user (sets is_verified + confirms email in Supabase Auth)
// ---------------------------------------------------------------------------
export async function adminVerifyUser(
  userId: string,
  adminCredentials?: { email: string; password: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const creds = resolveAdminCredentials(adminCredentials);

    const response = await fetch(`${supabaseUrl}/functions/v1/admin-verify-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        ...(creds && { adminEmail: creds.email, adminPassword: creds.password }),
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { success: false, error: result.error || `Verify failed (${response.status})` };
    }

    return { success: true };
  } catch (error) {
    console.error('adminVerifyUser error:', error);
    return { success: false, error: 'Network error while verifying user' };
  }
}

// ---------------------------------------------------------------------------
// Admin: unverify a user (sets is_verified = false)
// ---------------------------------------------------------------------------
export async function adminUnverifyUser(
  userId: string,
  adminCredentials?: { email: string; password: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const creds = resolveAdminCredentials(adminCredentials);

    const response = await fetch(`${supabaseUrl}/functions/v1/admin-unverify-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        ...(creds && { adminEmail: creds.email, adminPassword: creds.password }),
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { success: false, error: result.error || `Unverify failed (${response.status})` };
    }

    return { success: true };
  } catch (error) {
    console.error('adminUnverifyUser error:', error);
    return { success: false, error: 'Network error while unverifying user' };
  }
}

// ---------------------------------------------------------------------------
// Admin: change a user's role
// ---------------------------------------------------------------------------
export async function adminChangeRole(
  userId: string,
  newRole: string,
  adminCredentials?: { email: string; password: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const creds = resolveAdminCredentials(adminCredentials);

    const response = await fetch(`${supabaseUrl}/functions/v1/admin-change-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        newRole,
        ...(creds && { adminEmail: creds.email, adminPassword: creds.password }),
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { success: false, error: result.error || `Change role failed (${response.status})` };
    }

    return { success: true };
  } catch (error) {
    console.error('adminChangeRole error:', error);
    return { success: false, error: 'Network error while changing role' };
  }
}

// ---------------------------------------------------------------------------
// Rider Admin terminal assignment
// ---------------------------------------------------------------------------
// A Rider Admin is scoped to exactly one terminal. They may only edit that
// terminal and manage its driver assignments; the Super Admin sets the scope.
// ---------------------------------------------------------------------------

export interface RiderAdminSummary {
  id: string;
  name: string;
  email: string;
  terminal_id?: string | null;
  terminal_name?: string | null;
}

/** All Rider Admin accounts (admins.admin_type = 'rider'). */
export async function getRiderAdmins(): Promise<{ data: RiderAdminSummary[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('admins')
      .select('id, name, email, terminal_id, terminal_name')
      .eq('admin_type', 'rider')
      .order('name', { ascending: true });

    if (error) return { data: [], error: error.message };
    return { data: (data || []) as RiderAdminSummary[] };
  } catch (error) {
    console.error('[getRiderAdmins] error:', error);
    return { data: [], error: 'Network error while loading rider admins' };
  }
}

/** Super Admin: scope a Rider Admin to one terminal (pass null to unassign). */
export async function assignRiderAdminTerminal(
  adminId: string,
  terminalId: string | null,
  terminalName?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    // `.select()` matters: without it an update that matches no row — a stale id,
    // or an RLS policy quietly filtering the row out — comes back as a success
    // with no error, so the admin is told the assignment changed when nothing did.
    const { data, error } = await supabase
      .from('admins')
      .update({
        terminal_id: terminalId,
        terminal_name: terminalId ? (terminalName ?? null) : null,
      })
      .eq('id', adminId)
      .select('id, terminal_id, terminal_name')
      .maybeSingle();

    if (error) {
      if (error.code === '42703') {
        return { success: false, error: 'Run ASSIGN_RIDER_ADMIN_TO_TERMINAL.sql in Supabase first.' };
      }
      return { success: false, error: error.message };
    }

    if (!data) {
      return {
        success: false,
        error:
          'No Rider Admin row was updated — the account may have been removed, or your role cannot edit it.',
      };
    }

    return { success: true };
  } catch (error) {
    console.error('[assignRiderAdminTerminal] error:', error);
    return { success: false, error: 'Network error while assigning the terminal' };
  }
}

/** The terminal a Rider Admin is currently scoped to (read fresh from the DB). */
export async function getAdminTerminalAssignment(
  email: string
): Promise<{ terminal_id: string | null; terminal_name: string | null }> {
  try {
    const { data } = await supabase
      .from('admins')
      .select('terminal_id, terminal_name')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    return {
      terminal_id: data?.terminal_id ?? null,
      terminal_name: data?.terminal_name ?? null,
    };
  } catch {
    return { terminal_id: null, terminal_name: null };
  }
}

// ---------------------------------------------------------------------------
// Driver as terminal admin
// ---------------------------------------------------------------------------
// A TODA's admin is one of that TODA's own drivers, not a second account. The
// Super Admin marks them from Terminals -> Assignments, and the flag is what
// puts a "Switch to Admin App" control in their driver profile.
//
// The two are read and written together on purpose: admin of nothing is not a
// state this app can act on, so the terminal assignment is always the primary
// half and the flag only refines it.
// ---------------------------------------------------------------------------

export interface TerminalAdminStatus {
  /** Whether the Super Admin made this driver the admin of their terminal. */
  isTerminalAdmin: boolean;
  /** The terminal they are assigned to, which is the admin scope. */
  terminal_id: string | null;
  terminal_name: string | null;
}

/**
 * Whether this driver is admin of their terminal, read fresh.
 *
 * `terminal_id` is deliberately not optional in the answer even when the column
 * is absent: a database that has not run ADD_TERMINAL_ADMIN_FLAG.sql must read
 * as "nobody is an admin", never as "an admin whose terminal is unknown".
 */
export async function getDriverTerminalAdmin(
  userId: string
): Promise<TerminalAdminStatus> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('is_terminal_admin, terminal_id, terminal_name')
      .eq('id', userId)
      .maybeSingle();

    // A select naming a missing column fails outright, so an un-migrated
    // database falls through to "not an admin" rather than throwing.
    if (error || !data) return { isTerminalAdmin: false, terminal_id: null, terminal_name: null };

    return {
      isTerminalAdmin: !!data.is_terminal_admin,
      terminal_id: data.terminal_id ?? null,
      terminal_name: data.terminal_name ?? null,
    };
  } catch {
    return { isTerminalAdmin: false, terminal_id: null, terminal_name: null };
  }
}

/**
 * Super Admin: make a driver the admin of the terminal they are assigned to,
 * or take that back.
 *
 * The terminal is written in the same statement as the flag rather than trusted
 * from the caller's copy of it. That is what keeps the two halves from
 * disagreeing: a flag that outlived its terminal is how an admin ends up pointed
 * at a TODA they do not drive out of, and re-asserting the id here means a stale
 * row self-corrects on the next write rather than needing its own migration.
 *
 * Removing the flag deliberately does not clear the terminal — that is an
 * assignment decision, made in one place, and quietly taking a driver off a
 * terminal here would be a change nobody asked for.
 */
export async function setDriverTerminalAdmin(
  userId: string,
  isTerminalAdmin: boolean,
  terminalId: string | null,
  terminalName?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    // `.select()` matters, for the same reason it does in assignRiderAdminTerminal:
    // an update that matches no row comes back as a success with no error, and
    // the Super Admin would be told the flag changed when nothing did.
    const { data, error } = await supabase
      .from('users')
      .update({
        is_terminal_admin: isTerminalAdmin,
        // Re-asserted with the flag rather than left alone, and only when there
        // is a terminal to assert: the flag is meaningless without one.
        ...(isTerminalAdmin && terminalId
          ? { terminal_id: terminalId, terminal_name: terminalName ?? null }
          : {}),
      })
      .eq('id', userId)
      .select('id, is_terminal_admin, terminal_id, terminal_name')
      .maybeSingle();

    if (error) {
      if (error.code === '42703') {
        return { success: false, error: 'Run ADD_TERMINAL_ADMIN_FLAG.sql in Supabase first.' };
      }
      return { success: false, error: error.message };
    }

    if (!data) {
      return {
        success: false,
        error: 'No driver row was updated — the account may have been removed, or your role cannot edit it.',
      };
    }

    return { success: true };
  } catch (error) {
    console.error('[setDriverTerminalAdmin] error:', error);
    return { success: false, error: 'Network error while updating the terminal admin' };
  }
}

// ---------------------------------------------------------------------------
// Terminal boundary: a road, and the area that encloses it
// ---------------------------------------------------------------------------
// A terminal has two plotted shapes (ADD_TERMINAL_ROAD_BOUNDARY.sql and
// ADD_TERMINAL_BORDER_AREA.sql):
//
//   terminals.boundary_polygon  the road it runs along — a line snapped to the
//                               road network, accepted within half of
//                               terminals.road_width_m
//   terminals.boundary_area     a closed polygon enclosing that road
//
// The polygon is the outer bound and the road runs through it, so a point is
// accepted if it is inside the polygon OR on the road corridor. Requiring both
// would reject someone standing on the road because a hand-drawn edge cut a
// corner. A terminal with only one of the two still works on its own.
//
// Either shape can be switched off per terminal with terminals.boundary_enabled,
// which keeps the shape but stops enforcing it. Terminals with neither plotted
// are ignored, so this never blocks bookings until something is drawn.
// ---------------------------------------------------------------------------

export interface LatLngPoint {
  lat: number;
  lng: number;
}

/**
 * How far from a plotted road a drop-off may sit and still be accepted, in
 * metres. This is the full width of the corridor, so each side gets half of it.
 */
export const DEFAULT_ROAD_WIDTH_M = 200;

/** Coerce a raw JSON value from Supabase into a list of valid vertices. */
function coerceVertices(raw: any): LatLngPoint[] {
  if (!raw) return [];

  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(value)) return [];

  const points: LatLngPoint[] = [];
  for (const entry of value) {
    const lat = Number(entry?.lat);
    const lng = Number(entry?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) points.push({ lat, lng });
  }
  return points;
}

/** The road as an ordered list of points. Two points already describe a stretch. */
export function normalizeBoundaryRoad(raw: any): LatLngPoint[] | null {
  const points = coerceVertices(raw);
  // Two points already describe a stretch of road — there is no closure to make.
  return points.length >= 2 ? points : null;
}

/**
 * The enclosing area as a closed ring. Three points already enclose something,
 * which is the whole difference from a road.
 */
export function normalizeBoundaryArea(raw: any): LatLngPoint[] | null {
  const points = coerceVertices(raw);
  return points.length >= 3 ? points : null;
}

/** Fall back to the default corridor when a terminal has no usable width saved. */
export function normalizeRoadWidth(raw: any): number {
  const width = Number(raw);
  if (!Number.isFinite(width) || width <= 0) return DEFAULT_ROAD_WIDTH_M;
  // A sane ceiling, so a typo can't silently turn the corridor into the whole city.
  return Math.min(width, 2000);
}

/**
 * Ray-casting point-in-polygon test. The ring is always treated as closed, so the
 * last vertex connects back to the first.
 */
export function isPointInPolygon(lat: number, lng: number, polygon: LatLngPoint[]): boolean {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].lat;
    const xi = polygon[i].lng;
    const yj = polygon[j].lat;
    const xj = polygon[j].lng;

    // Does the edge (j -> i) cross the horizontal ray cast from the point?
    const crosses = (yi > lat) !== (yj > lat);
    if (crosses && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Shortest distance in metres from a point to a polyline.
 *
 * The road is short enough (a few kilometres within one terminal) that a local
 * equirectangular projection is accurate to well under a metre, and it lets the
 * per-segment maths run in plain 2D instead of a haversine per segment.
 */
export function distanceToRoadMeters(lat: number, lng: number, road: LatLngPoint[]): number {
  if (!Array.isArray(road) || road.length === 0) return Number.POSITIVE_INFINITY;
  if (road.length === 1) {
    return haversineDistanceMeters({ lat, lng }, road[0]);
  }

  const toRad = (x: number) => (x * Math.PI) / 180;
  // Scale longitude by the latitude halfway between the point and the road's mean,
  // so the projection stays accurate over the length of the road.
  const roadMeanLat = road.reduce((s, p) => s + p.lat, 0) / road.length;
  const meanLat = toRad((lat + roadMeanLat) / 2);

  const mPerDegLat = 111132;
  const mPerDegLng = 111320 * Math.cos(meanLat);

  const toXY = (p: LatLngPoint) => ({ x: p.lng * mPerDegLng, y: p.lat * mPerDegLat });
  const px = lng * mPerDegLng;
  const py = lat * mPerDegLat;

  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < road.length; i++) {
    const a = toXY(road[i - 1]);
    const b = toXY(road[i]);

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;

    // Project onto this segment, clamped to its ends so a point beyond either
    // end measures to that end rather than to the infinite line through it.
    let t = lengthSquared === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    const distance = Math.hypot(px - cx, py - cy);
    if (distance < best) best = distance;
  }

  return best;
}

/**
 * Whether a point sits within the terminal's road corridor — half the road's
 * width to either side of the plotted line.
 */
export function isPointOnRoadCorridor(
  lat: number,
  lng: number,
  road: LatLngPoint[],
  widthM: number = DEFAULT_ROAD_WIDTH_M
): boolean {
  return distanceToRoadMeters(lat, lng, road) <= normalizeRoadWidth(widthM) / 2;
}

/**
 * Turn a typed address into coordinates, or null when Google can't resolve it.
 *
 * Shared by every booking screen because a drop-off can be entered as text
 * rather than pinned on the map, and the boundary check needs coordinates to
 * have anything to check. Returns null on any non-OK geocode status -- callers
 * must treat that as "unknown", never as "allowed".
 */
export function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const Geocoder = (window as any)?.google?.maps?.Geocoder;
  if (!Geocoder || !address.trim()) return Promise.resolve(null);

  return new Promise(resolve => {
    new Geocoder().geocode({ address }, (results: any, status: string) => {
      const location = results?.[0]?.geometry?.location;
      if (status === 'OK' && location) {
        resolve({ lat: location.lat(), lng: location.lng() });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Great-circle distance in metres between two coordinates.
 *
 * Used to compare a driver's position against a terminal's given radius
 * (terminals.radius_km) when they queue up.
 */
export function haversineDistanceMeters(
  a: LatLngPoint,
  b: LatLngPoint
): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const earthRadius = 6371e3; // metres
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const deltaPhi = toRad(b.lat - a.lat);
  const deltaLambda = toRad(b.lng - a.lng);

  const h =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

/**
 * The two boundary shapes, kept apart because they answer different questions.
 *
 * `area` (the border) decides *who* the terminal serves: the customer has to be
 * standing in it to book, and a driver has to be in it to queue.
 *
 * `road` (the route) decides *where a tricycle can go*: the drop-off of a ride,
 * or the delivery address of a food order, has to sit on the corridor.
 *
 * They are deliberately not interchangeable. Treating them as one shape (inside
 * the area OR on the road) let a customer book from a street corner they were
 * never at, because the road corridor is hundreds of metres wide.
 */
export type TerminalGateShape = {
  id: string;
  name: string;
  /** The route: a road polyline with a corridor half-width. */
  road: LatLngPoint[] | null;
  /** The border: the area polygon a customer or driver must be standing in. */
  area: LatLngPoint[] | null;
  widthM: number | null;
  center: { lat: number; lng: number } | null;
};

/**
 * Every active, boundary-enabled terminal with its two shapes normalised.
 *
 * A terminal whose check is switched off is skipped, but keeps its shapes on the
 * record: the admin turns the check off while correcting a boundary, not to
 * discard one.
 *
 * Returns `null` when the lookup itself failed, which is deliberately distinct
 * from "no terminal has anything plotted" -- callers decide what an unknown
 * answer means, and the two must not collapse into one.
 */
async function loadTerminalGateShapes(includeBoundaryDisabled = false): Promise<TerminalGateShape[] | null> {
  // `select('*')` keeps this working before the boundary migrations run.
  const { data, error } = await supabase.from('terminals').select('*');
  if (error || !data) return null;

  return data
    .filter((t: any) => t.is_active !== false && (includeBoundaryDisabled || t.boundary_enabled !== false))
    .map((t: any) => ({
      id: t.id,
      name: t.name,
      road: normalizeBoundaryRoad(t.boundary_polygon),
      area: normalizeBoundaryArea(t.boundary_area),
      widthM: t.road_width_m,
      center:
        Number.isFinite(Number(t.center_lat)) && Number.isFinite(Number(t.center_lng))
          ? { lat: Number(t.center_lat), lng: Number(t.center_lng) }
          : null,
    }));
}

/** The shape of a gate's verdict, including which terminals said yes. */
export type TerminalGateResult = {
  allowed: boolean;
  /** Terminals that actually had the relevant shape plotted. */
  checkedCount: number;
  /** The terminals that allowed the point, when it was allowed. */
  matched: Array<{ id: string; name: string }>;
  /**
   * The lookup failed, so nothing was actually checked. Callers that must not
   * block on an outage can allow; callers enforcing a rule should surface it.
   */
  lookupFailed: boolean;
};

function gateResult(
  shapes: TerminalGateShape[],
  test: (shape: TerminalGateShape) => boolean
): TerminalGateResult {
  // Nothing plotted for this gate anywhere: the feature is not configured yet,
  // so it must not start rejecting people who could book before it existed.
  if (shapes.length === 0) {
    return { allowed: true, checkedCount: 0, matched: [], lookupFailed: false };
  }

  const matched = shapes.filter(test).map(s => ({ id: s.id, name: s.name }));
  return {
    allowed: matched.length > 0,
    checkedCount: shapes.length,
    matched,
    lookupFailed: false,
  };
}

function failedLookup(what: string, error: unknown): TerminalGateResult {
  console.warn(`[${what}] terminal lookup failed:`, error);
  // Unknown is not a successful boundary check. Booking flows can show a
  // connection error using `lookupFailed`, but the gate itself must fail closed.
  return { allowed: false, checkedCount: 0, matched: [], lookupFailed: true };
}

/**
 * The BORDER gate: is this point inside any terminal's area?
 *
 * Used for the customer standing at a terminal to book, and for a driver
 * standing at a terminal to queue.
 */
export async function isPointWithinAnyTerminalBorder(
  lat: number,
  lng: number
): Promise<TerminalGateResult> {
  try {
    const shapes = await loadTerminalGateShapes();
    if (shapes === null) return failedLookup('terminal border', new Error('query failed'));

    return gateResult(
      shapes.filter(s => Array.isArray(s.area)),
      s => isPointInPolygon(lat, lng, s.area as LatLngPoint[])
    );
  } catch (error) {
    return failedLookup('terminal border', error);
  }
}

/**
 * The ROUTE gate: is this point within the corridor of any terminal's road?
 *
 * Used for the drop-off of a ride and for the delivery address of a food order --
 * both are places a tricycle is expected to be able to reach.
 */
export async function isPointWithinAnyTerminalRoute(
  lat: number,
  lng: number
): Promise<TerminalGateResult> {
  try {
    const shapes = await loadTerminalGateShapes();
    if (shapes === null) return failedLookup('terminal route', new Error('query failed'));

    return gateResult(
      shapes.filter(s => Array.isArray(s.road)),
      s => isPointOnRoadCorridor(lat, lng, s.road as LatLngPoint[], normalizeRoadWidth(s.widthM))
    );
  } catch (error) {
    return failedLookup('terminal route', error);
  }
}

/**
 * The ROUTE gate against one specific terminal.
 *
 * The route search above accepts a point near *any* terminal's road. This asks
 * the narrower question, used by the rider screens and the map overlays where a
 * single terminal is already in context.
 */
export function isPointWithinTerminalRoute(
  lat: number,
  lng: number,
  terminal: { road?: LatLngPoint[] | null; widthM?: number | null }
): boolean {
  if (!terminal.road || terminal.road.length < 2) return false;
  return isPointOnRoadCorridor(lat, lng, terminal.road, normalizeRoadWidth(terminal.widthM));
}

/**
 * Which terminal should take this food delivery?
 *
 * When routeToPickup is enabled, prefer terminals whose plotted route reaches
 * the restaurant, ranking those terminals by distance to it. If no route reaches
 * the restaurant, fall back to the nearest active terminal.
 */
export async function findDeliveryTerminalForOrder(params: {
  dropoffLat: number;
  dropoffLng: number;
  /** The restaurant being collected from. Used to break the tie. */
  pickupLat?: number | null;
  pickupLng?: number | null;
  /** Set false to choose the nearest active terminal without checking any route. */
  requireRoute?: boolean;
  /** Match route coverage against the restaurant pickup instead of the customer drop-off. */
  routeToPickup?: boolean;
}): Promise<{
  terminal: { id: string; name: string } | null;
  allowed: boolean;
  checkedCount: number;
  /** Terminals whose route reaches the selected route point. */
  reachable: Array<{ id: string; name: string }>;
}> {
  try {
    const shapes = await loadTerminalGateShapes(params.requireRoute === false);
    if (shapes === null) {
      return { terminal: null, allowed: true, checkedCount: 0, reachable: [] };
    }

    const hasPickup = params.pickupLat != null && params.pickupLng != null &&
      Number.isFinite(Number(params.pickupLat)) && Number.isFinite(Number(params.pickupLng));

    if (params.requireRoute === false) {
      const candidates = shapes.filter(s => s.center);
      const terminal = candidates.length === 0
        ? null
        : candidates.reduce((best, s) => {
            const point = hasPickup
              ? { lat: Number(params.pickupLat), lng: Number(params.pickupLng) }
              : { lat: params.dropoffLat, lng: params.dropoffLng };
            if (!best.center) return s;
            return haversineDistanceMeters(point, s.center!) < haversineDistanceMeters(point, best.center)
              ? s
              : best;
          });

      return {
        terminal: terminal ? { id: terminal.id, name: terminal.name } : null,
        allowed: true,
        checkedCount: shapes.length,
        reachable: candidates.map(s => ({ id: s.id, name: s.name })),
      };
    }

    const withRoutes = shapes.filter(s => Array.isArray(s.road) && s.road.length >= 2);
    if (withRoutes.length === 0) {
      // Without plotted routes, still scope the delivery to the nearest
      // terminal when restaurant coordinates are available.
      if (params.routeToPickup) {
        const candidates = shapes.filter(s => s.center);
        const point = hasPickup
          ? { lat: Number(params.pickupLat), lng: Number(params.pickupLng) }
          : { lat: params.dropoffLat, lng: params.dropoffLng };
        const nearest = candidates.reduce<TerminalGateShape | null>((best, s) => {
          if (!best?.center || !s.center) return best?.center ? best : s;
          return haversineDistanceMeters(point, s.center) < haversineDistanceMeters(point, best.center) ? s : best;
        }, null);
        return {
          terminal: nearest ? { id: nearest.id, name: nearest.name } : null,
          allowed: true,
          checkedCount: shapes.length,
          reachable: [],
        };
      }
      return { terminal: null, allowed: true, checkedCount: 0, reachable: [] };
    }

    const routePoint = params.routeToPickup && hasPickup
      ? { lat: Number(params.pickupLat), lng: Number(params.pickupLng) }
      : { lat: params.dropoffLat, lng: params.dropoffLng };
    const reachable = withRoutes.filter(s =>
      isPointOnRoadCorridor(routePoint.lat, routePoint.lng, s.road as LatLngPoint[], normalizeRoadWidth(s.widthM))
    );

    if (reachable.length === 0) {
      if (params.routeToPickup) {
        const candidates = shapes.filter(s => s.center);
        const point = hasPickup
          ? { lat: Number(params.pickupLat), lng: Number(params.pickupLng) }
          : { lat: params.dropoffLat, lng: params.dropoffLng };
        const nearest = candidates.reduce<TerminalGateShape | null>((best, s) => {
          if (!best?.center || !s.center) return best?.center ? best : s;
          return haversineDistanceMeters(point, s.center) < haversineDistanceMeters(point, best.center) ? s : best;
        }, null);
        return {
          terminal: nearest ? { id: nearest.id, name: nearest.name } : null,
          allowed: true,
          checkedCount: withRoutes.length,
          reachable: [],
        };
      }
      return { terminal: null, allowed: false, checkedCount: withRoutes.length, reachable: [] };
    }

    // With no restaurant position to measure from there is nothing to rank by,
    // so the nearest-to-customer fallback below takes over.
    const terminal = hasPickup
      ? reachable.reduce((best, s) => {
          // A terminal with no centre cannot be ranked; keep the one already held.
          if (!best.center) return s.center ? s : best;
          if (!s.center) return best;
          const d = haversineDistanceMeters({ lat: Number(params.pickupLat), lng: Number(params.pickupLng) }, s.center);
          const bd = haversineDistanceMeters({ lat: Number(params.pickupLat), lng: Number(params.pickupLng) }, best.center);
          return d < bd ? s : best;
        })
      : reachable.reduce((best, s) => {
          // Without the restaurant, rank by the customer instead.
          if (!best.center) return s.center ? s : best;
          if (!s.center) return best;
          return haversineDistanceMeters(params, s.center) < haversineDistanceMeters(params, best.center) ? s : best;
        });

    return {
      terminal: { id: terminal.id, name: terminal.name },
      allowed: true,
      checkedCount: withRoutes.length,
      reachable: reachable.map(s => ({ id: s.id, name: s.name })),
    };
  } catch (error) {
    console.warn('[findDeliveryTerminalForOrder] lookup failed:', error);
    return { terminal: null, allowed: true, checkedCount: 0, reachable: [] };
  }
}

// ---------------------------------------------------------------------------
// Admin approval workflow
// ---------------------------------------------------------------------------
// The Rider Admin can only *propose* terminal/driver changes; the Super Admin
// (admin_type = 'business_customer') reviews them here. Submitting a request
// never touches the terminals/users tables — only approving one does.
// ---------------------------------------------------------------------------

export type ApprovalRequestType =
  | 'terminal_create'
  | 'terminal_update'
  | 'terminal_delete'
  | 'driver_assign'
  | 'driver_unassign'
  // A business proposing a change to its own shop profile. Requires
  // ADMIN_BUSINESS_APPROVALS.sql: the CHECK constraint on this column is what
  // decides whether the insert is accepted, and it originally enumerated only
  // the five types above.
  | 'business_profile_update'
  // A driver proposing a change to its own TODA plate number. The plate is the
  // vehicle's legal identity, so it is not the driver's to change unilaterally
  // -- a wrong plate attaches fares and violations to the wrong tricycle.
  | 'rider_plate_update';

export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRequest {
  id: string;
  request_type: ApprovalRequestType;
  payload: any;
  status: ApprovalRequestStatus;
  requested_by_email?: string | null;
  requested_by_name?: string | null;
  requested_at?: string | null;
  reviewed_by_email?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
}

export const APPROVAL_REQUEST_LABELS: Record<ApprovalRequestType, string> = {
  terminal_create: 'Add terminal',
  terminal_update: 'Edit terminal',
  terminal_delete: 'Delete terminal',
  driver_assign: 'Assign driver',
  driver_unassign: 'Unassign driver',
  business_profile_update: 'Shop profile change',
  rider_plate_update: 'Driver plate change',
};

/**
 * The shop fields a business may propose changing.
 *
 * Kept in one place because the same list drives the payload the admin
 * compares, the patch the business submits, and the SQL the Super Admin applies.
 * Adding a field here without adding it to `applyBusinessProfileUpdate` would
 * stage a change the admin can see but silently drop on approve.
 */
export const PROFILE_REVIEWED_FIELDS = [
  { key: 'name', label: 'Shop name', column: 'name' },
  { key: 'subtitle', label: 'Branch / tagline', column: 'subtitle' },
  { key: 'address', label: 'Address', column: 'address' },
  { key: 'delivery_time', label: 'Delivery time', column: 'delivery_time' },
  { key: 'operating_hours', label: 'Operating hours', column: 'operating_hours' },
  { key: 'latitude', label: 'Latitude', column: 'latitude' },
  { key: 'longitude', label: 'Longitude', column: 'longitude' },
  { key: 'cuisine', label: 'What we serve', column: 'cuisine' },
] as const;

/** The shop fields one proposed change carries. */
export type BusinessProfileUpdate = {
  restaurant_id: string;
  business_user_id?: string | null;
  name?: string | null;
  subtitle?: string | null;
  address?: string | null;
  delivery_time?: string | null;
  operating_hours?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  cuisine?: string[] | null;
};

/** What sits in `admin_approval_requests.payload` for a business change. */
export type BusinessProfileUpdatePayload = {
  restaurant_id: string;
  business_user_id?: string | null;
  /** Live values at the time the change was proposed, so the diff survives. */
  before: BusinessProfileUpdate;
  /** The values the Super Admin would apply if they approve. */
  after: BusinessProfileUpdate;
};

function describeApprovalError(error: any): string {
  if (!error) return 'Unknown error';
  // PGRST205 = table not found in schema cache; 42P01 = undefined_table
  if (error.code === 'PGRST205' || error.code === '42P01') {
    return 'Approval queue table is missing. Run ADMIN_APPROVAL_REQUESTS.sql in Supabase.';
  }
  // 23514 = check_violation. The request_type CHECK enumerates the allowed
  // values, so a request type added in code but not yet in the database is
  // rejected by Postgres before the app ever sees a row. Without this the shop
  // just sees a wall of SQL.
  if (error.code === '23514') {
    return 'The approval queue does not know this request type yet. Run ADMIN_APPROVAL_REQUEST_TYPES.sql in Supabase.';
  }
  return error.message || String(error);
}

/** Recalculate a terminal's rider_count from the users table. */
async function recountTerminalRiders(terminalId: string) {
  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('terminal_id', terminalId);
  await supabase
    .from('terminals')
    .update({ rider_count: (data || []).length })
    .eq('id', terminalId);
}

/**
 * Write a reviewed shop profile to `restaurants` (and mirror the address onto
 * the owner, which the business app still reads as `business_address`).
 *
 * Shared by two callers so they cannot drift: the Super Admin approving a
 * staged change, and the business app's one escape hatch that lets a shop that
 * has never been pinned place its first pin without waiting for a review.
 *
 * Only fields present on the patch are written. A `null` is a real value here --
 * "unpin the map" is `latitude: null`, not "leave it alone" -- so the caller
 * decides which keys to include rather than sending a full object.
 */
export async function applyBusinessProfileUpdate(
  patch: BusinessProfileUpdate,
): Promise<{ success: boolean; error?: string }> {
  try {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const { key, column } of PROFILE_REVIEWED_FIELDS) {
      if (!(key in patch)) continue;
      const value = (patch as Record<string, unknown>)[key];
      row[column] = value === undefined ? null : value;
    }

    const { error } = await supabase
      .from('restaurants')
      .update(row)
      .eq('id', patch.restaurant_id);
    if (error) return { success: false, error: describeApprovalError(error) };

    // The address is shown in two places that are genuinely the same fact. The
    // business app's profile screen reads `users.business_address`; the
    // storefront reads `restaurants.address`. Writing only one of them is how
    // they drifted apart in the first place.
    if (patch.business_user_id && typeof patch.address === 'string') {
      const { error: userError } = await supabase
        .from('users')
        .update({ business_address: patch.address, updated_at: new Date().toISOString() })
        .eq('id', patch.business_user_id);
      if (userError) {
        // The shop itself is already saved; a stale owner row is recoverable and
        // must not report the whole approval as failed.
        console.warn('[applyBusinessProfileUpdate] users.business_address not mirrored:', userError);
      }
    }

    /*
     * Same problem, same fix, for the name.
     *
     * `restaurants.name` is the shop as customers see it and as orders are made
     * out; `users.business_name` is what the app header and the Settings screen
     * read. A rename applied here used to update only the first, so approving a
     * staged rename moved the storefront and left the owner's own header showing
     * the old name. This is the path a rename actually travels -- the business
     * proposes, the Super Admin applies -- so this is where the copy has to be
     * brought along.
     */
    if (patch.business_user_id && typeof patch.name === 'string' && patch.name.trim()) {
      const { error: nameError } = await supabase
        .from('users')
        .update({ business_name: patch.name.trim(), updated_at: new Date().toISOString() })
        .eq('id', patch.business_user_id);
      if (nameError) {
        console.warn('[applyBusinessProfileUpdate] users.business_name not mirrored:', nameError);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('[applyBusinessProfileUpdate] error:', error);
    return { success: false, error: 'Network error while saving the shop profile' };
  }
}

/** Apply an approved request's side effect to terminals/users. */
async function applyApprovalRequest(
  request: ApprovalRequest
): Promise<{ success: boolean; error?: string }> {
  const payload = request.payload || {};
  try {
    switch (request.request_type) {
      case 'terminal_create':
      case 'terminal_update': {
        const { error } = await supabase.from('terminals').upsert(
          {
            id: payload.id,
            name: payload.name,
            boundary: payload.boundary,
            center_lat: payload.center_lat,
            center_lng: payload.center_lng,
            radius_km: payload.radius_km ?? 2.0,
            is_active: payload.is_active ?? true,
            rider_count: payload.rider_count ?? 0,
            // Carried through so a Rider Admin's plotted boundary survives approval:
            // the road, the area that encloses it, the corridor width, and whether
            // the check is enforced at all.
            boundary_polygon: payload.boundary_polygon ?? null,
            boundary_area: payload.boundary_area ?? null,
            road_width_m: payload.road_width_m ?? DEFAULT_ROAD_WIDTH_M,
            boundary_enabled: payload.boundary_enabled !== false,
            // This terminal's own ride fare (ADD_TERMINAL_FARES.sql).
            base_fare: payload.base_fare ?? 20,
            per_km: payload.per_km ?? 10,
            // Colours (ADD_TERMINAL_MARKER_COLOR.sql, ADD_TERMINAL_SHAPE_COLORS.sql).
            // Carried through so a Rider Admin's chosen colours survive approval
            // rather than snapping back to the defaults the moment a Super Admin
            // taps Approve.
            marker_color: normalizeTerminalColor(payload.marker_color),
            route_color: normalizeRouteColor(payload.route_color),
            border_color: normalizeBorderColor(payload.border_color),
            // The terminal's routes (ADD_TERMINAL_ROUTES.sql). Spread
            // conditionally, never written as null: a request made before this
            // column existed carries no routes at all, and naming it would blank
            // a terminal's plotted roads on approval.
            ...(payload.routes !== undefined ? { routes: payload.routes } : {}),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
        if (error) return { success: false, error: describeApprovalError(error) };
        return { success: true };
      }

      case 'terminal_delete': {
        // Unassign every driver still on the terminal, then delete it.
        const { error: unassignError } = await supabase
          .from('users')
          .update({ terminal_id: null, terminal_name: null })
          .eq('terminal_id', payload.id);
        if (unassignError) return { success: false, error: describeApprovalError(unassignError) };

        const { error } = await supabase.from('terminals').delete().eq('id', payload.id);
        if (error) return { success: false, error: describeApprovalError(error) };
        return { success: true };
      }

      case 'driver_assign': {
        const { error } = await supabase
          .from('users')
          .update({ terminal_id: payload.terminal_id, terminal_name: payload.terminal_name })
          .eq('id', payload.driver_id);
        if (error) return { success: false, error: describeApprovalError(error) };
        if (payload.terminal_id) await recountTerminalRiders(payload.terminal_id);
        if (payload.previous_terminal_id) await recountTerminalRiders(payload.previous_terminal_id);
        return { success: true };
      }

      case 'driver_unassign': {
        const { error } = await supabase
          .from('users')
          .update({ terminal_id: null, terminal_name: null })
          .eq('id', payload.driver_id);
        if (error) return { success: false, error: describeApprovalError(error) };
        if (payload.terminal_id) await recountTerminalRiders(payload.terminal_id);
        return { success: true };
      }

      case 'business_profile_update': {
        // The payload keeps `after` so the reviewed values are the ones applied,
        // not a re-read of the row. A second edit staged while this one sat in
        // the queue would otherwise be silently applied by approving the first.
        return applyBusinessProfileUpdate(payload.after || payload);
      }

      case 'rider_plate_update': {
        if (!payload.driver_id || !payload.new_plate) {
          return { success: false, error: 'This plate request is missing the driver or the new plate number.' };
        }
        const { error } = await supabase
          .from('users')
          .update({ toda_plate: payload.new_plate, updated_at: new Date().toISOString() })
          .eq('id', payload.driver_id);
        if (error) return { success: false, error: error.message };
        return { success: true };
      }

      default:
        return { success: false, error: `Unknown request type: ${request.request_type}` };
    }
  } catch (error) {
    console.error('[applyApprovalRequest] error:', error);
    return { success: false, error: 'Network error while applying the request' };
  }
}

/** Rider Admin: stage a change for Super Admin review. */
export async function submitApprovalRequest(params: {
  requestType: ApprovalRequestType;
  payload: any;
  requestedByEmail?: string | null;
  requestedByName?: string | null;
}): Promise<{ success: boolean; data?: ApprovalRequest; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('admin_approval_requests')
      .insert([{
        request_type: params.requestType,
        payload: params.payload,
        status: 'pending',
        requested_by_email: params.requestedByEmail || null,
        requested_by_name: params.requestedByName || null,
        requested_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) return { success: false, error: describeApprovalError(error) };
    return { success: true, data: data as ApprovalRequest };
  } catch (error) {
    console.error('[submitApprovalRequest] error:', error);
    return { success: false, error: 'Network error while submitting for approval' };
  }
}

/** Fetch approval requests, newest first. */
export async function getApprovalRequests(filters?: {
  status?: ApprovalRequestStatus;
  requestedByEmail?: string;
}): Promise<{ data: ApprovalRequest[]; error?: string }> {
  try {
    let query = supabase
      .from('admin_approval_requests')
      .select('*')
      .order('requested_at', { ascending: false });

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.requestedByEmail) query = query.eq('requested_by_email', filters.requestedByEmail);

    const { data, error } = await query;
    if (error) return { data: [], error: describeApprovalError(error) };
    return { data: (data || []) as ApprovalRequest[] };
  } catch (error) {
    console.error('[getApprovalRequests] error:', error);
    return { data: [], error: 'Network error while loading approval requests' };
  }
}

/** Super Admin: apply a request's change, then mark it approved. */
export async function approveApprovalRequest(
  request: ApprovalRequest,
  reviewedByEmail?: string | null
): Promise<{ success: boolean; error?: string }> {
  const applied = await applyApprovalRequest(request);
  if (!applied.success) return applied;

  const { error } = await supabase
    .from('admin_approval_requests')
    .update({
      status: 'approved',
      reviewed_by_email: reviewedByEmail || null,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq('id', request.id);

  if (error) return { success: false, error: describeApprovalError(error) };
  return { success: true };
}

/** Super Admin: reject a request without applying anything. */
export async function rejectApprovalRequest(
  requestId: string,
  reviewedByEmail?: string | null,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('admin_approval_requests')
      .update({
        status: 'rejected',
        reviewed_by_email: reviewedByEmail || null,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason || null,
      })
      .eq('id', requestId);

    if (error) return { success: false, error: describeApprovalError(error) };
    return { success: true };
  } catch (error) {
    console.error('[rejectApprovalRequest] error:', error);
    return { success: false, error: 'Network error while rejecting the request' };
  }
}

/** How many requests are waiting for the Super Admin. */
export async function getPendingApprovalCount(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('admin_approval_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Business shop-profile changes (Super Admin reviews these)
// ---------------------------------------------------------------------------

/** The change a shop currently has waiting, if any. */
export async function getPendingBusinessProfileUpdate(
  restaurantId: string,
): Promise<{ request: ApprovalRequest | null; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('admin_approval_requests')
      .select('*')
      .eq('request_type', 'business_profile_update')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { request: null, error: describeApprovalError(error) };
    const request = (data as ApprovalRequest | null) ?? null;
    if (!request) return { request: null };
    // Guard against a row belonging to some other shop: the business screens
    // ask for their own restaurant's queue by id, so anything else is not ours.
    const payload = request.payload || {};
    if (payload.restaurant_id && payload.restaurant_id !== restaurantId) {
      return { request: null };
    }
    return { request };
  } catch (error) {
    console.error('[getPendingBusinessProfileUpdate] error:', error);
    return { request: null, error: 'Network error while loading your pending change' };
  }
}

/**
 * Business: propose a shop-profile change for Super Admin review.
 *
 * Replaces any change already waiting for this shop rather than queueing a
 * second one. Two stacked requests for the same shop means the admin reviews
 * two versions of one edit and whichever is approved second silently wins.
 */
export async function submitBusinessProfileUpdate(params: {
  restaurantId: string;
  businessUserId?: string | null;
  before: BusinessProfileUpdate;
  after: BusinessProfileUpdate;
  requestedByEmail?: string | null;
  requestedByName?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const payload: BusinessProfileUpdatePayload = {
    restaurant_id: params.restaurantId,
    business_user_id: params.businessUserId ?? null,
    before: params.before,
    after: params.after,
  };

  try {
    const row = {
      request_type: 'business_profile_update' as const,
      payload,
      status: 'pending' as const,
      requested_by_email: params.requestedByEmail || null,
      requested_by_name: params.requestedByName || null,
      requested_at: new Date().toISOString(),
      reviewed_by_email: null,
      reviewed_at: null,
      rejection_reason: null,
    };

    // Update-in-place rather than insert. An upsert on `id` cannot do this,
    // because the id of the row already queued is not known here -- without
    // the lookup below every Save would stack another copy of the same edit.
    const { data: existing, error: lookupError } = await supabase
      .from('admin_approval_requests')
      .select('id')
      .eq('request_type', 'business_profile_update')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) return { success: false, error: describeApprovalError(lookupError) };

    const error = existing
      ? (await supabase.from('admin_approval_requests').update(row).eq('id', existing.id)).error
      : (await supabase.from('admin_approval_requests').insert([row])).error;

    if (error) return { success: false, error: describeApprovalError(error) };
    return { success: true };
  } catch (error) {
    console.error('[submitBusinessProfileUpdate] error:', error);
    return { success: false, error: 'Network error while sending your change for approval' };
  }
}

/** Business: pull a staged change back before the Super Admin sees it. */
export async function withdrawBusinessProfileUpdate(
  requestId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('admin_approval_requests')
      .delete()
      .eq('id', requestId)
      .eq('status', 'pending');
    if (error) return { success: false, error: describeApprovalError(error) };
    return { success: true };
  } catch (error) {
    console.error('[withdrawBusinessProfileUpdate] error:', error);
    return { success: false, error: 'Network error while withdrawing your change' };
  }
}

// ---------------------------------------------------------------------------
// Rider TODA plate changes
// ---------------------------------------------------------------------------
//
// A plate number identifies the vehicle the fares and violations attach to, so a
// driver cannot rewrite it: the row keeps its current plate until a Super Admin
// approves the change. Drivers stage a request here; `applyApprovalRequest`
// above writes the new plate on approve.

export type RiderPlateUpdatePayload = {
  driver_id: string;
  driver_name?: string | null;
  /** Live value when the change was proposed, so the reviewer sees the diff. */
  previous_plate: string | null;
  /** The plate to write if approved. */
  new_plate: string;
};

/** The change this driver currently has waiting, if any. */
export async function getPendingRiderPlateUpdate(
  driverId: string,
): Promise<{ request: ApprovalRequest | null; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('admin_approval_requests')
      .select('*')
      .eq('request_type', 'rider_plate_update')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { request: null, error: describeApprovalError(error) };
    const request = (data as ApprovalRequest | null) ?? null;
    if (!request) return { request: null };
    // The lookup above takes the newest pending plate change in the queue, which
    // may belong to another driver. Only a row naming this driver is theirs.
    if (request.payload?.driver_id && request.payload.driver_id !== driverId) {
      return { request: null };
    }
    return { request };
  } catch (error) {
    console.error('[getPendingRiderPlateUpdate] error:', error);
    return { request: null, error: 'Network error while loading your pending plate change' };
  }
}

/**
 * Rider: propose a new TODA plate for Super Admin review.
 *
 * Replaces this driver's existing pending request rather than queueing a second
 * one, for the same reason as the shop-profile queue: two stacked requests mean
 * the admin reviews two versions of one edit and the later approval silently
 * discards the earlier intent.
 */
export async function submitRiderPlateUpdate(params: {
  driverId: string;
  driverName?: string | null;
  previousPlate?: string | null;
  newPlate: string;
  requestedByEmail?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const payload: RiderPlateUpdatePayload = {
    driver_id: params.driverId,
    driver_name: params.driverName ?? null,
    previous_plate: params.previousPlate ?? null,
    new_plate: params.newPlate,
  };

  try {
    const row = {
      request_type: 'rider_plate_update' as const,
      payload,
      status: 'pending' as const,
      requested_by_email: params.requestedByEmail || null,
      requested_by_name: params.driverName || null,
      requested_at: new Date().toISOString(),
      reviewed_by_email: null,
      reviewed_at: null,
      rejection_reason: null,
    };

    const { data: existing, error: lookupError } = await supabase
      .from('admin_approval_requests')
      .select('id')
      .eq('request_type', 'rider_plate_update')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) return { success: false, error: describeApprovalError(lookupError) };

    const error = existing
      ? (await supabase.from('admin_approval_requests').update(row).eq('id', existing.id)).error
      : (await supabase.from('admin_approval_requests').insert([row])).error;

    if (error) return { success: false, error: describeApprovalError(error) };
    return { success: true };
  } catch (error) {
    console.error('[submitRiderPlateUpdate] error:', error);
    return { success: false, error: 'Network error while sending your plate change for approval' };
  }
}

// ---------------------------------------------------------------------------
// Audit trail (Super Admin)
// ---------------------------------------------------------------------------
// Every platform-changing action is recorded here so the Super Admin can see
// who changed what and when. Requires CREATE_AUDIT_LOGS.sql.
// ---------------------------------------------------------------------------

export interface AuditLog {
  id: string;
  actor_email?: string | null;
  actor_name?: string | null;
  /** admin | rider | customer | business */
  actor_role?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  summary?: string | null;
  details?: any;
  created_at?: string | null;
}

export interface AuditLogInput {
  action: string;
  actorEmail?: string | null;
  actorName?: string | null;
  /** admin | rider | customer | business */
  actorRole?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string;
  details?: any;
}

/**
 * Record an audit entry. Best-effort: a missing table or network error is
 * logged but never blocks the action that triggered it.
 */
export async function logAudit(input: AuditLogInput): Promise<void> {
  try {
    const { error } = await supabase.from('audit_logs').insert([
      {
        actor_email: input.actorEmail || null,
        actor_name: input.actorName || null,
        actor_role: input.actorRole || null,
        action: input.action,
        entity_type: input.entityType || null,
        entity_id: input.entityId || null,
        summary: input.summary || null,
        details: input.details ?? null,
      },
    ]);
    if (error) console.warn('[logAudit] insert failed:', error.message);
  } catch (error) {
    console.warn('[logAudit] failed:', error);
  }
}

/** Recent audit entries, newest first. */
export async function getAuditLogs(limit = 200): Promise<{ data: AuditLog[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') {
        return { data: [], error: 'Audit log table is missing. Run CREATE_AUDIT_LOGS.sql in Supabase.' };
      }
      return { data: [], error: error.message };
    }
    return { data: (data || []) as AuditLog[] };
  } catch (error) {
    console.error('[getAuditLogs] error:', error);
    return { data: [], error: 'Network error while loading the audit trail' };
  }
}

// Extract a safe file extension (fallback 'jpg') so weird filenames can't break the storage path
//
// The empty check is not paranoia about the extension: `file` is typed `File`, which
// is a promise no caller in a language without null checks can keep. `proofFile`
// on the checkout screen is null whenever the customer skipped the optional
// proof, and `safeFileExtension` read `.name` straight off it -- a TypeError that
// unwound the whole order-placing call. Falling back to 'jpg' for a missing file
// keeps a caller that forgets its guard from taking the screen down with it.
function safeFileExtension(file: File): string {
  const raw = file?.name?.split('.').pop() || '';
  return /^[a-zA-Z0-9]{1,10}$/.test(raw) ? raw.toLowerCase() : 'jpg';
}
/**
 * Turn a storage upload failure into something a person can act on.
 *
 * A missing bucket is the overwhelmingly common case here -- the proof buckets
 * are created by a migration, and every upload against a project where it has
 * not been run fails with a message that says nothing about the migration. The
 * UI can then say which SQL to run instead of showing a raw storage error.
 */
function describeStorageError(error: { message?: string } | null): string {
  const message = error?.message || 'Upload failed';
  if (/bucket/i.test(message) || /not found/i.test(message)) {
    return 'Proof storage is not set up. Run ADD_ORDER_PAYMENT_AND_DELIVERY_PROOF.sql in Supabase.';
  }
  return message;
}

// ---------------------------------------------------------------------------
// Fuzzy place matching for shared-ride lobbies
// ---------------------------------------------------------------------------
// Google Maps can return different formatted strings for the same physical
// place (e.g. "B. Hive Plaza, 108 Gen. T. de Leon, Valenzuela, ..." vs
// "108 Gen T. De Leon, Corner Santolan Rd, Valenzuela, ..."), so exact string
// equality hides lobbies from other customers browsing for the same route.
// These helpers normalize and compare both the short display name and the
// full address, matching either one.
export function normalizePlace(value?: string | null): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function placesMatch(a?: string | null, b?: string | null): boolean {
  const na = normalizePlace(a);
  const nb = normalizePlace(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // One contains the other (e.g. short name "b hive plaza" vs full address
  // "b hive plaza 108 gen t de leon ..."). Require a minimum length so we
  // don't match on tiny fragments like "rd".
  return na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na));
}

// Whether a lobby leaves from the same place the user does.
//
// `userTerminalId` is the strongest signal available and is checked first. A
// lobby created from the terminal picker records the terminal id, while the
// strings are a description of where that terminal sits -- and descriptions are
// not unique: GTDL and IN TODA TERMINAL both have the boundary "Marulas", so
// matching those two on their address alone would merge them into one pickup
// point. Falls back to the fuzzy name/address comparison for lobbies recorded
// before a terminal was chosen.
export function isSamePickup(
  lobby: any,
  userPickup: string,
  userPickupAddress?: string,
  userTerminalId?: string | null
): boolean {
  if (userTerminalId && lobby.terminal_id) return lobby.terminal_id === userTerminalId;

  return (
    placesMatch(lobby.pickup_location, userPickup) ||
    placesMatch(lobby.pickup_location, userPickupAddress) ||
    placesMatch(lobby.pickup_address, userPickupAddress) ||
    placesMatch(lobby.pickup_address, userPickup)
  );
}

// Compare a lobby's pickup/dropoff against the user's. Both legs must match;
// each leg matches if the short display name OR the full address matches.
//
// Used where a shared ride means the same trip for both parties -- quietly
// joining someone else's lobby on the way to a different place is not that.
// Callers that only need the same pickup can use isSamePickup instead.
export function isSimilarRoute(
  lobby: any,
  userPickup: string,
  userDropoff: string,
  userPickupAddress?: string,
  userDropoffAddress?: string,
  userTerminalId?: string | null,
  routeContext?: {
    dropoffCoords?: LatLngPoint | null;
    routePoints?: LatLngPoint[] | null;
    routeWidthM?: number | null;
  }
): boolean {
  const pickupMatch = isSamePickup(lobby, userPickup, userPickupAddress, userTerminalId);
  if (!pickupMatch) return false;

  const lobbyDropoffLat = Number(lobby.dropoff_lat);
  const lobbyDropoffLng = Number(lobby.dropoff_lng);
  const hasLobbyDropoffCoords = lobby.dropoff_lat != null && lobby.dropoff_lng != null &&
    Number.isFinite(lobbyDropoffLat) && Number.isFinite(lobbyDropoffLng);
  const hasRouteGeometry = Array.isArray(routeContext?.routePoints) && routeContext.routePoints.length >= 2;

  if (routeContext?.dropoffCoords && hasLobbyDropoffCoords && hasRouteGeometry) {
    const route = { road: routeContext.routePoints!, widthM: routeContext.routeWidthM };
    return isPointWithinTerminalRoute(
      routeContext.dropoffCoords.lat,
      routeContext.dropoffCoords.lng,
      route,
    ) && isPointWithinTerminalRoute(lobbyDropoffLat, lobbyDropoffLng, route);
  }

  const dropoffMatch =
    placesMatch(lobby.dropoff_location, userDropoff) ||
    placesMatch(lobby.dropoff_location, userDropoffAddress) ||
    placesMatch(lobby.dropoff_address, userDropoffAddress) ||
    placesMatch(lobby.dropoff_address, userDropoff);

  return dropoffMatch;
}

/**
 * Append a decline to a row's `declined_by` JSON column.
 *
 * Shared by ride requests and shared ride lobbies. An earlier decline from the
 * same driver is replaced rather than stacked, so the array can never grow a
 * duplicate entry for one driver. Requires ADD_CANCELLATION_REASONS.sql.
 */
async function appendDecline(
  table: 'ride_requests' | 'shared_ride_lobbies',
  rowId: string,
  driverId: string,
  reason: string
) {
  try {
    const { data: current, error: readError } = await supabase
      .from(table)
      .select('declined_by')
      .eq('id', rowId)
      .maybeSingle();

    if (readError) return { data: null, error: readError };

    const existing = Array.isArray(current?.declined_by) ? (current!.declined_by as any[]) : [];
    const next = [
      ...existing.filter((entry: any) => entry?.driver_id !== driverId),
      { driver_id: driverId, reason, at: new Date().toISOString() },
    ];

    const { data, error } = await supabase
      .from(table)
      .update({ declined_by: next, updated_at: new Date().toISOString() })
      .eq('id', rowId)
      .select()
      .single();

    return { data, error };
  } catch (error) {
    console.error(`[appendDecline] ${table} ${rowId}:`, error);
    return { data: null, error: error as any };
  }
}

// Helper functions for common operations
export const supabaseHelpers = {
  // User operations
  async getUserById(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    return { data, error };
  },

  async getUserByEmail(email: string) {
    const normalizedEmail = email.toLowerCase().trim();

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (data && !error) {
      return { data, error: null };
    }

    try {
      const localUsersJson = localStorage.getItem('trikeserve_users');
      const localUsers: any[] = localUsersJson ? JSON.parse(localUsersJson) : [];
      const localUser = localUsers.find((u) => (u.email || '').toLowerCase() === normalizedEmail);

      if (localUser) {
        return {
          data: {
            ...localUser,
            role: localUser.role || 'customer',
            is_verified: localUser.is_verified ?? localUser.isVerified ?? true,
            created_at: localUser.created_at || localUser.createdAt || new Date().toISOString(),
          },
          error: null,
        };
      }
    } catch (localError) {
      console.warn('[supabaseHelpers.getUserByEmail] Local user lookup failed:', localError);
    }

    return { data, error };
  },

  async createUser(user: any) {
    const { data, error } = await supabase
      .from('users')
      .insert([user])
      .select()
      .single();
    return { data, error };
  },

  async updateUser(userId: string, updates: any) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    return { data, error };
  },

  // Ride operations
  async createRideRequest(rideRequest: any) {
    const { data, error } = await supabase
      .from('ride_requests')
      .insert([rideRequest])
      .select()
      .single();
    return { data, error };
  },

  async getRideRequests(filters?: any) {
    let query = supabase.from('ride_requests').select('*');

    if (filters?.customerId) query = query.eq('customer_id', filters.customerId);
    if (filters?.driverId) query = query.eq('driver_id', filters.driverId);
    if (filters?.status) query = query.eq('status', filters.status);

    const { data, error } = await query.order('created_at', { ascending: false });
    return { data, error };
  },

  async getRideRequest(rideId: string) {
    const { data, error } = await supabase
      .from('ride_requests')
      .select('*')
      .eq('id', rideId)
      .single();
    return { data, error };
  },

  // Database-driven status updates for customer notifications
  async updateRideStatus(rideId: string, status: string, statusDetails?: any) {
    const timestamp = new Date().toISOString();
    const updateData: any = {
      status,
      updated_at: timestamp,
      ...statusDetails
    };

    const { data, error } = await supabase
      .from('ride_requests')
      .update(updateData)
      .eq('id', rideId)
      .select()
      .single();

    return { data, error };
  },

  // Store accepted request in database
  async acceptRideRequest(rideId: string, driverId: string, driverName: string, driverPhoto?: string, driverPlate?: string, driverRating?: string) {
    const timestamp = new Date().toISOString();

    // DEBUG: Log what we're about to update
    console.log('📤 acceptRideRequest DEBUG LOG:');
    console.log('   Ride ID:', rideId);
    console.log('   Driver ID:', driverId);
    console.log('   Driver Name:', driverName);
    console.log('   Driver Photo:', driverPhoto);
    console.log('   Driver Plate:', driverPlate, '(will be:', (driverPlate || 'N/A'), ')');
    console.log('   Driver Rating:', driverRating, '(will be:', (driverRating || '4.8'), ')');

    const updateData = {
      driver_id: driverId,
      driver_name: driverName,
      driver_photo: driverPhoto,
      driver_plate: driverPlate || 'N/A',
      driver_rating: driverRating || '4.8',
      status: 'accepted',
      accepted_at: timestamp,
      accepted_driver_id: driverId,
      updated_at: timestamp
    };

    console.log('📝 Update object:', updateData);

    const { data, error } = await supabase
      .from('ride_requests')
      .update(updateData)
      .eq('id', rideId)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating ride_requests:', error);
    } else {
      console.log('✅ Successfully updated ride_requests:', data);
    }

    return { data, error };
  },

  // Atomically claim a pending ride for a driver (fails if already claimed).
  // Guards on status='pending' and driver_id IS NULL so two drivers can't accept the same request.
  async claimRideRequest(rideId: string, driverId: string, driverName: string, driverPhoto?: string, driverPlate?: string, driverRating?: string) {
    const timestamp = new Date().toISOString();

    const updateData = {
      driver_id: driverId,
      driver_name: driverName,
      driver_photo: driverPhoto || null,
      driver_plate: driverPlate || 'N/A',
      driver_rating: driverRating || '4.8',
      status: 'accepted',
      accepted_at: timestamp,
      accepted_driver_id: driverId,
      updated_at: timestamp
    };

    const { data, error } = await supabase
      .from('ride_requests')
      .update(updateData)
      .eq('id', rideId)
      .eq('status', 'pending')
      .is('driver_id', null)
      .select()
      .single();

    return { data, error };
  },

  // Update driver's current status for the ride
  async updateDriverRideStatus(rideId: string, driverStatus: string, statusMessage?: string) {
    const timestamp = new Date().toISOString();
    const { data, error } = await supabase
      .from('ride_requests')
      .update({
        driver_status: driverStatus,
        driver_status_message: statusMessage,
        driver_status_updated_at: timestamp,
        updated_at: timestamp
      })
      .eq('id', rideId)
      .select()
      .single();

    return { data, error };
  },

  async updateRideRequest(rideId: string, updates: any) {
    const { data, error } = await supabase
      .from('ride_requests')
      .update(updates)
      .eq('id', rideId)
      .select()
      .single();
    return { data, error };
  },

  /**
   * Record a rider declining a ride request, with the reason they gave.
   *
   * The decline is stored against that rider only (inside `declined_by`), so the
   * request stays available to every other rider and the customer is unaffected.
   * Requires ADD_CANCELLATION_REASONS.sql.
   */
  async declineRideRequest(requestId: string, driverId: string, reason: string) {
    return appendDecline('ride_requests', requestId, driverId, reason);
  },

  /** Same as declineRideRequest, for a shared ride lobby. */
  async declineLobby(lobbyId: string, driverId: string, reason: string) {
    return appendDecline('shared_ride_lobbies', lobbyId, driverId, reason);
  },

  /** True when this rider has already declined the request/lobby. */
  isDeclinedByDriver(row: any, driverId?: string | null): boolean {
    if (!driverId) return false;
    const declines = Array.isArray(row?.declined_by) ? row.declined_by : [];
    return declines.some((entry: any) => entry?.driver_id === driverId);
  },

  // Shared ride lobby operations
  async createLobby(lobby: any) {
    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .insert([lobby])
      .select()
      .single();
    return { data, error };
  },

  async getLobbyById(lobbyId: string) {
    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .select('*')
      .eq('id', lobbyId)
      .single();
    return { data, error };
  },

  async getLobbies(filters?: any) {
    let query = supabase.from('shared_ride_lobbies').select('*');

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.pickupLocation) query = query.eq('pickup_location', filters.pickupLocation);

    const { data, error } = await query.order('created_at', { ascending: false });
    return { data, error };
  },

  async updateLobby(lobbyId: string, updates: any) {
    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .update(updates)
      .eq('id', lobbyId)
      .select()
      .single();
    return { data, error };
  },

  // Enhanced Shared Ride Lobby Operations
  async getAvailableLobbyByRoute(
    pickupAddr: string,
    dropoffAddr: string,
    pickupLoc?: string,
    dropoffLoc?: string,
    terminalId?: string | null,
    routeContext?: {
      dropoffCoords?: LatLngPoint | null;
      routePoints?: LatLngPoint[] | null;
      routeWidthM?: number | null;
    },
  ) {
    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .select('*')
      .eq('status', 'waiting')
      .gt('max_seats', 0)
      .order('created_at', { ascending: true });

    if (error) return { data: null, error };

    // Match on short display names first, falling back to the full addresses.
    const match = (data || []).find((l: any) =>
      isSimilarRoute(l, pickupLoc || pickupAddr, dropoffLoc || dropoffAddr, pickupAddr, dropoffAddr, terminalId, routeContext)
    );

    return { data: match || null, error };
  },

  async getAvailableLobbies() {
    // Fetch all waiting lobbies — the fuzzy route matching happens client-side
    // in BrowseAvailableLobbies / ShareRideLobby, because exact address
    // equality hides lobbies whose Google-formatted address strings differ.
    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .select('*')
      .eq('status', 'waiting')
      .order('created_at', { ascending: true });

    return { data, error };
  },

  async getWaitingLobbiesForDriver() {
    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .select('*')
      .eq('status', 'waiting')
      .order('created_at', { ascending: true });

    return { data, error };
  },

  /**
   * Terminal coverage used for the queue hint: the boundary area the admin
   * plotted (terminals.boundary_polygon) plus the centre/radius fallback.
   *
   * `select('*')` keeps this working even before the boundary migration runs.
   */
  async getTerminalGeofence(terminalId: string) {
    const { data, error } = await supabase
      .from('terminals')
      .select('*')
      .eq('id', terminalId)
      .maybeSingle();

    return { data, error };
  },

  // Terminal queue operations (FIFO per terminal)
  // Only the driver at position 1 of a terminal's queue may accept private and
  // share rides. Delivery is not gated by the queue.
  /**
   * Waiting rows for one terminal, oldest first.
   *
   * `sinceIso` drops rows that stopped heartbeating (an app that was closed or
   * killed), so a dead row can never hold a terminal's first position. `id` is a
   * tiebreaker so two drivers who joined in the same instant still get a
   * deterministic order — only one driver can ever be position 1.
   */
  async getTerminalQueue(terminalId: string, sinceIso?: string) {
    let query = supabase
      .from('terminal_queue')
      .select('*')
      .eq('terminal_id', terminalId)
      .eq('status', 'waiting');

    if (sinceIso) query = query.gte('updated_at', sinceIso);

    const { data, error } = await query
      .order('joined_at', { ascending: true })
      .order('id', { ascending: true });

    return { data, error };
  },

  /** Refresh a queued driver's row so it doesn't look abandoned. */
  async heartbeatTerminalQueue(terminalId: string, driverId: string) {
    const { error } = await supabase
      .from('terminal_queue')
      .update({ updated_at: new Date().toISOString() })
      .eq('terminal_id', terminalId)
      .eq('driver_id', driverId);

    return { error };
  },

  /** Reap rows abandoned by a closed/killed app so the table doesn't grow. */
  async deleteStaleTerminalQueue(terminalId: string, beforeIso: string) {
    const { error } = await supabase
      .from('terminal_queue')
      .delete()
      .eq('terminal_id', terminalId)
      .lt('updated_at', beforeIso);

    return { error };
  },

  /**
   * Join the queue for a terminal. `joined_at` is always reset so re-joining
   * puts the driver at the back of the queue.
   */
  async joinTerminalQueue(entry: {
    terminalId: string;
    driverId: string;
    driverName?: string;
    driverPlate?: string;
  }) {
    const timestamp = new Date().toISOString();
    const { data, error } = await supabase
      .from('terminal_queue')
      .upsert(
        [
          {
            terminal_id: entry.terminalId,
            driver_id: entry.driverId,
            driver_name: entry.driverName || null,
            driver_plate: entry.driverPlate || null,
            status: 'waiting',
            joined_at: timestamp,
            updated_at: timestamp,
          },
        ],
        { onConflict: 'terminal_id,driver_id' }
      )
      .select()
      .single();

    return { data, error };
  },

  async leaveTerminalQueue(terminalId: string, driverId: string) {
    const { error } = await supabase
      .from('terminal_queue')
      .delete()
      .eq('terminal_id', terminalId)
      .eq('driver_id', driverId);

    return { error };
  },

  /**
   * Delete a driver's queue rows, optionally keeping one terminal.
   *
   * `keepTerminalId` = the driver's current terminal; rows in any other terminal
   * are ghosts that would block that terminal's first slot forever, because the
   * driver can neither accept its rides (wrong terminal) nor re-join it. Pass
   * nothing/null to give up every slot, e.g. when the driver accepts a ride.
   */
  async clearTerminalQueueRows(driverId: string, keepTerminalId?: string | null) {
    let query = supabase
      .from('terminal_queue')
      .delete()
      .eq('driver_id', driverId);

    if (keepTerminalId) query = query.neq('terminal_id', keepTerminalId);

    const { error } = await query;
    return { error };
  },

  async createShareRideLobby(lobby: any) {
    const timestamp = new Date().toISOString();
    const lobbyData = {
      ...lobby,
      passengers_json: lobby.passengers_json ?? lobby.passengers ?? [],
      created_at: timestamp,
      updated_at: timestamp
    };

    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .insert([lobbyData])
      .select()
      .single();

    return { data, error };
  },

  async joinShareRideLobby(lobbyId: string, passenger: any) {
    // First get the current lobby
    const { data: lobby, error: fetchError } = await supabase
      .from('shared_ride_lobbies')
      .select('*')
      .eq('id', lobbyId)
      .single();

    if (fetchError) return { data: null, error: fetchError };
    if (!lobby) return { data: null, error: new Error('Lobby not found') };

    // Parse passengers
    let passengers = [];
    try {
      passengers = Array.isArray(lobby.passengers_json) ? lobby.passengers_json : JSON.parse(lobby.passengers_json || '[]');
    } catch (e) {
      passengers = [];
    }

    // Older rows stored the whole lobby fare in price_per_seat. Preserve that
    // total across the existing passengers before adding a newly priced seat.
    const missingFareCount = passengers.filter((p: any) => {
      if (p?.fare == null || p.fare === '') return true;
      const fare = Number(p.fare);
      return !Number.isFinite(fare) || fare < 0;
    }).length;
    const hasAnyPassengerFare = passengers.some((p: any) => {
      if (p?.fare == null || p.fare === '') return false;
      const fare = Number(p.fare);
      return Number.isFinite(fare) && fare >= 0;
    });
    const legacyTripTotal = Number(lobby.price_per_seat || 0);
    const validLegacyTripTotal = Number.isFinite(legacyTripTotal) && legacyTripTotal >= 0 ? legacyTripTotal : 0;
    const totalCents = Math.round(validLegacyTripTotal * 100);
    const baseLegacyFareCents = missingFareCount > 0 ? Math.floor(totalCents / missingFareCount) : 0;
    let remainingLegacyFareCents = missingFareCount > 0
      ? totalCents - baseLegacyFareCents * missingFareCount
      : 0;
    passengers = passengers.map((p: any) => {
      if (p?.fare != null && p.fare !== '') {
        const fare = Number(p.fare);
        if (Number.isFinite(fare) && fare >= 0) return { ...p, fare };
      }
      if (hasAnyPassengerFare) return { ...p, fare: validLegacyTripTotal };

      const fareCents = baseLegacyFareCents + (remainingLegacyFareCents > 0 ? 1 : 0);
      remainingLegacyFareCents = Math.max(0, remainingLegacyFareCents - 1);
      return { ...p, fare: fareCents / 100 };
    });

    // Check if passenger already in lobby
    if (passengers.some((p: any) => p.id === passenger.id)) {
      return { data: lobby, error: null };
    }

    // Check capacity
    if (passengers.length >= lobby.max_seats) {
      return { data: null, error: new Error('Lobby is full') };
    }

    // Add passenger
    passengers.push(passenger);
    const timestamp = new Date().toISOString();

    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .update({
        passengers_json: passengers,
        updated_at: timestamp
      })
      .eq('id', lobbyId)
      .select()
      .single();

    return { data, error };
  },

   async leaveShareRideLobby(lobbyId: string, passengerId: string) {
     console.log(`🚪 LEAVE LOBBY: lobbyId=${lobbyId}, passengerId=${passengerId}`);

     try {
       // First get the current lobby
       const { data: lobby, error: fetchError } = await supabase
         .from('shared_ride_lobbies')
         .select('*')
         .eq('id', lobbyId)
         .single();

       if (fetchError) {
         console.error('❌ Error fetching lobby:', fetchError);
         return { data: null, error: fetchError };
       }

       if (!lobby) {
         console.error('❌ Lobby not found:', lobbyId);
         return { data: null, error: new Error('Lobby not found') };
       }

       console.log('✅ Lobby found:', { id: lobbyId, status: lobby.status });

       // Parse passengers
       let passengers = [];
       try {
         passengers = Array.isArray(lobby.passengers_json) ? lobby.passengers_json : JSON.parse(lobby.passengers_json || '[]');
       } catch (e) {
         console.warn('⚠️ Error parsing passengers:', e);
         passengers = [];
       }

       console.log(`👥 Current passengers (${passengers.length}):`, passengers.map((p: any) => p.id));

       // Remove passenger and companions (companions have ID like "userId_companion_1")
       const updatedPassengers = passengers.filter((p: any) => {
         const isMainPassenger = p.id === passengerId;
         const isCompanion = p.id.startsWith(`${passengerId}_companion_`);
         const shouldKeep = !isMainPassenger && !isCompanion;

         if (!shouldKeep) {
           console.log(`  🚶 Removing passenger: ${p.id}`);
         }

         return shouldKeep;
       });

       console.log(`👥 Updated passengers (${updatedPassengers.length}):`, updatedPassengers.map((p: any) => p.id));

       const timestamp = new Date().toISOString();

        const isHostLeaving = lobby.customer_id === passengerId;

        // Only an empty lobby ends. When its host leaves, the earliest remaining
        // main passenger takes over; companion seats cannot become the host.
        if (updatedPassengers.length === 0) {
          console.log('🗑️ Lobby is now empty, marking as cancelled');
         const { data, error } = await supabase
           .from('shared_ride_lobbies')
           .update({
             status: 'cancelled',
             passengers_json: [],
             updated_at: timestamp
           })
           .eq('id', lobbyId)
           .select()
           .single();

         if (error) {
           console.error('❌ Error marking lobby as cancelled:', error);
           return { data: null, error };
         }

         console.log('✅ Lobby marked as cancelled');
         return { data, error };
       }

       // Transfer ownership to the next main passenger in join order. This is
       // the first remaining non-companion in passengers_json (Rob -> Lou in
       // the example where Nixon joined after Lou).
       const nextHost = isHostLeaving
         ? updatedPassengers.find((passenger: any) => !String(passenger.id || '').includes('_companion_')) || updatedPassengers[0]
         : null;
       const updates: Record<string, any> = {
         passengers_json: updatedPassengers,
         updated_at: timestamp,
       };

       if (nextHost) {
         updates.customer_id = nextHost.id;
         const nextHostDropoff = nextHost.dropoff || nextHost.dropoffAddress;
         if (nextHostDropoff) updates.dropoff_location = nextHost.dropoff || nextHost.dropoffAddress;
         if (nextHost.dropoffAddress || nextHost.dropoff) {
           updates.dropoff_address = nextHost.dropoffAddress || nextHost.dropoff;
         }
         const nextHostLat = Number(nextHost.dropoffLat);
         const nextHostLng = Number(nextHost.dropoffLng);
         if (
           nextHost.dropoffLat != null &&
           nextHost.dropoffLng != null &&
           Number.isFinite(nextHostLat) &&
           Number.isFinite(nextHostLng)
         ) {
           updates.dropoff_lat = nextHostLat;
           updates.dropoff_lng = nextHostLng;
         }
       }

       console.log(isHostLeaving ? '📝 Updating lobby and promoting the next host' : '📝 Updating lobby with remaining passengers');
       const { data, error } = await supabase
         .from('shared_ride_lobbies')
         .update(updates)
         .eq('id', lobbyId)
         .select()
         .single();

       if (error) {
         console.error('❌ Error updating lobby:', error);
         return { data: null, error };
       }

       console.log('✅ Successfully left lobby');
       return { data, error };
     } catch (err) {
       console.error('❌ Unexpected error in leaveShareRideLobby:', err);
       return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
     }
   },

  async acceptLobbyAsDriver(lobbyId: string, driverId: string, driverName: string, driverPlate?: string, driverRating?: string) {
    const timestamp = new Date().toISOString();

    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .update({
        driver_id: driverId,
        driver_name: driverName,
        driver_plate: driverPlate || null,
        driver_rating: driverRating || '4.8',
        status: 'driver_found',
        updated_at: timestamp
      })
      .eq('id', lobbyId)
      .select()
      .single();

    return { data, error };
  },

  async updateLobbyPassengers(lobbyId: string, passengers: any[]) {
    const timestamp = new Date().toISOString();

    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .update({
        passengers_json: passengers,
        updated_at: timestamp
      })
      .eq('id', lobbyId)
      .select()
      .single();

    return { data, error };
  },

  async startLobbyRide(lobbyId: string) {
    const timestamp = new Date().toISOString();

    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .update({
        status: 'in_progress',
        updated_at: timestamp
      })
      .eq('id', lobbyId)
      .select()
      .single();

    return { data, error };
  },

  // Track the driver's progress on a shared-ride lobby so customers in the
  // lobby see the same status popups they get for private rides.
  async updateLobbyDriverStatus(lobbyId: string, driverStatus: string, statusMessage?: string) {
    const timestamp = new Date().toISOString();
    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .update({
        driver_status: driverStatus,
        driver_status_message: statusMessage,
        driver_status_updated_at: timestamp,
        updated_at: timestamp
      })
      .eq('id', lobbyId)
      .select()
      .single();

    return { data, error };
  },

  // Persist drop-off progress per passenger so a rider can advance through a
  // shared ride without treating every passenger as dropped off at once.
  async updateLobbyPassengerDropoffStatus(lobbyId: string, passengerId: string, status: string) {
    const { data: lobby, error: readError } = await supabase
      .from('shared_ride_lobbies')
      .select('passengers_json')
      .eq('id', lobbyId)
      .maybeSingle();

    if (readError || !lobby) {
      return { data: null, error: readError || new Error('Shared ride lobby was not found') };
    }

    let passengers = lobby.passengers_json;
    if (typeof passengers === 'string') {
      try {
        passengers = JSON.parse(passengers);
      } catch {
        passengers = [];
      }
    }
    if (!Array.isArray(passengers)) passengers = [];

    let foundPassenger = false;
    const timestamp = new Date().toISOString();
    const updatedPassengers = passengers.map((passenger: any) => {
      if (String(passenger?.id || '') !== passengerId) return passenger;
      foundPassenger = true;
      return {
        ...passenger,
        dropoff_status: status,
        dropoff_status_updated_at: timestamp,
      };
    });

    if (!foundPassenger) {
      return { data: null, error: new Error('Passenger was not found in this shared ride') };
    }

    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .update({ passengers_json: updatedPassengers, updated_at: timestamp })
      .eq('id', lobbyId)
      .select('id, passengers_json')
      .single();

    return { data, error };
  },

  // Save the driver's real-time GPS location to the lobby so customers
  // can see live tracking on their map.
  async updateLobbyDriverLocation(lobbyId: string, lat: number, lng: number) {
    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .update({
        driver_lat: lat,
        driver_lng: lng,
        updated_at: new Date().toISOString()
      })
      .eq('id', lobbyId)
      .select()
      .single();

    return { data, error };
  },

  async completeLobbyRide(lobbyId: string) {
    const timestamp = new Date().toISOString();

    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .update({
        status: 'completed',
        updated_at: timestamp
      })
      .eq('id', lobbyId)
      .select()
      .single();

    return { data, error };
  },

  // Complete a shared ride: close the lobby AND record it as a completed
  // ride_requests row so it appears in the driver's recent trips/earnings
  // (queried by driver_id + status='completed') and in the host customer's
  // activity log (queried by customer_id + status='completed').
  async completeSharedRide(lobbyId: string, details: {
    customerId?: string;
    driverId?: string;
    driverName?: string;
    driverRating?: string;
    pickup: string;
    dropoff: string;
    pickupAddress?: string;
    dropoffAddress?: string;
    pickupLat?: number | null;
    pickupLng?: number | null;
    dropoffLat?: number | null;
    dropoffLng?: number | null;
    amount: number;
    passengerCount?: number;
    paymentMethod?: 'COD' | 'GCASH';
  }) {
    const timestamp = new Date().toISOString();

    // 1) Close the lobby so it stops showing as active for everyone.
    const lobbyResult = await this.completeLobbyRide(lobbyId);

    // 2) Record the completed shared ride in ride_requests. ride_requests
    //    requires a customer_id (NOT NULL + FK), so skip the insert when we
    //    don't have one and just close the lobby.
    if (!details.customerId) {
      console.warn('[supabaseHelpers.completeSharedRide] No customer id — lobby closed but ride not recorded.');
      return { lobby: lobbyResult, ride: { data: null, error: null } };
    }

    const rideResult = await supabase
      .from('ride_requests')
      .insert([{
        customer_id: details.customerId,
        driver_id: details.driverId || null,
        pickup_location: details.pickup,
        dropoff_location: details.dropoff,
        pickup_address: details.pickupAddress || null,
        dropoff_address: details.dropoffAddress || null,
        pickup_lat: details.pickupLat ?? null,
        pickup_lng: details.pickupLng ?? null,
        dropoff_lat: details.dropoffLat ?? null,
        dropoff_lng: details.dropoffLng ?? null,
        status: 'completed',
        ride_type: 'share',
        payment_method: details.paymentMethod || 'GCASH',
        amount: details.amount,
        passenger_count: details.passengerCount || 1,
        driver_name: details.driverName || null,
        driver_rating: details.driverRating || '4.8',
        created_at: timestamp,
        updated_at: timestamp,
      }])
      .select()
      .single();

    return { lobby: lobbyResult, ride: rideResult };
  },

  // Record a customer's rating for a driver after a completed ride.
  async rateDriver(details: {
    driverId: string;
    customerId: string;
    rating: number;
    lobbyId?: string;
  }) {
    const { data, error } = await supabase
      .from('driver_ratings')
      .insert([{
        driver_id: details.driverId,
        customer_id: details.customerId,
        rating: details.rating,
        lobby_id: details.lobbyId || null,
      }])
      .select()
      .single();

    return { data, error };
  },

  // Compute a driver's average rating from all ratings they've received.
  // Returns { average, count } — average is null when there are no ratings.
  async getDriverRating(driverId: string) {
    const { data, error } = await supabase
      .from('driver_ratings')
      .select('rating')
      .eq('driver_id', driverId);

    if (error) return { average: null, count: 0, error };

    const ratings = (data || [])
      .map((r: any) => Number(r.rating))
      .filter((n: number) => !isNaN(n));
    const count = ratings.length;
    const average = count > 0
      ? ratings.reduce((sum: number, n: number) => sum + n, 0) / count
      : null;

    return { average, count, error: null };
  },

  // ---- Delivery notifications & business ratings ----

  // Keep one customer notification row per order and refresh it as the order
  // advances. Older duplicate rows are collapsed on the next status update.
  async upsertCustomerOrderNotification(notification: {
    recipient_id: string;
    order_id?: string | null;
    order_number?: string | null;
    restaurant_name?: string | null;
    title: string;
    message: string;
    type: string;
    read: boolean;
    created_at: string;
  }) {
    if (!notification.order_id) {
      const { data, error } = await supabase
        .from('delivery_notifications')
        .insert([notification])
        .select()
        .single();
      return { data, error };
    }

    const { data: existingRows, error: lookupError } = await supabase
      .from('delivery_notifications')
      .select('id')
      .eq('recipient_id', notification.recipient_id)
      .eq('order_id', notification.order_id)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (lookupError) return { data: null, error: lookupError };

    if (existingRows?.length) {
      const [current, ...duplicates] = existingRows;
      const { data, error } = await supabase
        .from('delivery_notifications')
        .update(notification)
        .eq('id', current.id)
        .select()
        .single();
      if (error) return { data, error };

      const duplicateIds = duplicates.map((row: any) => row.id);
      if (duplicateIds.length) {
        const { error: deleteError } = await supabase
          .from('delivery_notifications')
          .delete()
          .eq('recipient_id', notification.recipient_id)
          .eq('order_id', notification.order_id)
          .in('id', duplicateIds);
        if (deleteError) return { data, error: deleteError };
      }
      return { data, error: null };
    }

    const { data, error } = await supabase
      .from('delivery_notifications')
      .insert([notification])
      .select()
      .single();
    return { data, error };
  },

  // Parse the order id out of a delivery ride request's tagged pickup location:
  // `DELIVERY|ORDER_ID:<id>|ORDER_NO:<no>|<restaurant label>`
  parseOrderIdFromDeliveryPickup(pickupLocation?: string) {
    if (!pickupLocation) return null;
    const match = String(pickupLocation).match(/ORDER_ID:([0-9a-fA-F-]+)/);
    return match ? match[1] : null;
  },

  // Notify both the customer and the business about a delivery status change.
  // Prefer the order id carried by the active ride; older request payloads can
  // still fall back to the id embedded in the tagged pickup location.
  async notifyDeliveryStatusChange(params: {
    pickupLocation?: string;
    orderId?: string;
    orderNumber?: string;
    customerId?: string;
    senderId?: string;
    senderName?: string;
    status: string;
    message?: string;
    deliveryProofUrl?: string;
  }) {
    const { pickupLocation, customerId, senderId, senderName, status, message } = params;
    const orderId = params.orderId || this.parseOrderIdFromDeliveryPickup(pickupLocation);

    let businessId: string | null = null;
    let restaurantName = '';
    let orderNumber = params.orderNumber || '';
    let resolvedCustomerId: string | null = customerId || null;

    if (orderId) {
      const { data: order } = await supabase
        .from('orders')
        .select('business_id, customer_id, order_number, restaurant_email')
        .eq('id', orderId)
        .single();
      if (order) {
        businessId = order.business_id || null;
        orderNumber = order.order_number || orderNumber;
        resolvedCustomerId = order.customer_id || resolvedCustomerId;

        // orders.restaurant_email actually holds the restaurant id; map it to
        // the business user via restaurants.business_user_id when business_id
        // is not set on the order.
        if (!businessId && order.restaurant_email) {
          const { data: restaurant } = await supabase
            .from('restaurants')
            .select('business_user_id, name')
            .eq('id', order.restaurant_email)
            .maybeSingle();
          if (restaurant?.business_user_id) {
            businessId = restaurant.business_user_id;
          }
          restaurantName = restaurant?.name?.trim() || '';
        }

        if (businessId) {
          const { data: restaurant } = await supabase
            .from('restaurants')
            .select('name')
            .eq('business_user_id', businessId)
            .maybeSingle();
          restaurantName = restaurant?.name?.trim() || '';
        }
      }
    }

    const statusLabels: Record<string, { title: string; message: string; emoji: string }> = {
      'on-the-way': {
        title: 'Driver on the way',
        message: 'Your driver is on the way to pick up your order.',
        emoji: '🛵',
      },
      'arrived': {
        title: 'Driver arrived at restaurant',
        message: 'Your driver has arrived at the restaurant to pick up your order.',
        emoji: '📍',
      },
      'picked-up': {
        title: 'Order picked up',
        message: 'Your driver has picked up your order and is heading to you!',
        emoji: '📦',
      },
      'dropped-off': {
        title: 'Arrived at your location',
        message: 'Your driver has arrived at your delivery address.',
        emoji: '🏁',
      },
      'awaiting-payment': {
        title: 'Delivery arriving',
        message: 'Your driver is almost there — please prepare your payment.',
        emoji: '💰',
      },
      'completed': {
        title: 'Delivery completed',
        message: 'Your delivery has been completed. Enjoy your meal! 🍽️',
        emoji: '✅',
      },
      'cancelled': {
        title: 'Delivery cancelled',
        message: message || 'The driver cancelled this delivery.',
        emoji: '⚠️',
      },
    };

    const label = statusLabels[status] || {
      title: 'Delivery update',
      message: message || 'Your delivery status has been updated.',
      emoji: '🚚',
    };

    const notifications: any[] = [];
    const stamp = new Date().toISOString();
    let customerNotification: any = null;

    if (resolvedCustomerId) {
      customerNotification = {
        recipient_id: resolvedCustomerId,
        order_id: orderId || null,
        order_number: orderNumber || null,
        restaurant_name: restaurantName || null,
        title: label.title,
        message: restaurantName
          ? `${label.message} (${restaurantName})`
          : label.message,
        type: 'delivery',
        read: false,
        created_at: stamp,
      };
    }

    if (businessId) {
      const businessLabels: Record<string, { title: string; message: string }> = {
        'on-the-way': { title: 'Driver on the way', message: 'The delivery driver is on the way to pick up this order.' },
        'arrived': { title: 'Driver arrived', message: 'The delivery driver has arrived at your restaurant to pick up the order.' },
        'picked-up': { title: 'Order picked up', message: 'The delivery driver has picked up the order and is heading to the customer.' },
        'dropped-off': { title: 'Arrived at customer', message: 'The delivery driver has arrived at the customer\'s delivery address.' },
        'awaiting-payment': { title: 'At customer\'s location', message: 'The delivery driver is at the customer\'s location completing the delivery.' },
        'completed': { title: 'Delivery completed', message: 'This order has been delivered successfully.' },
        'cancelled': { title: 'Delivery cancelled', message: message || 'The driver cancelled this delivery.' },
      };
      const bizLabel = businessLabels[status] || { title: 'Delivery update', message: message || 'The delivery status has been updated.' };
      notifications.push({
        recipient_id: businessId,
        order_id: orderId || null,
        order_number: orderNumber || null,
        restaurant_name: restaurantName || null,
        title: '🚚 ' + bizLabel.title,
        message: orderNumber ? `${bizLabel.message} Order #${orderNumber}.` : bizLabel.message,
        type: 'delivery',
        read: false,
        created_at: stamp,
      });
    }

    let customerData: any = null;
    let customerError: any = null;
    if (customerNotification) {
      const result = await this.upsertCustomerOrderNotification(customerNotification);
      customerData = result.data;
      customerError = result.error;
      if (customerError) console.error('[supabase] Failed to update customer delivery notification:', customerError);
    }

    // Store each delivery milestone in the same direct chat used by each pair.
    if (senderId) {
      const customerChatMessages: Record<string, string> = {
        'on-the-way': "I'm on my way to pick up your order.",
        arrived: "I've arrived at the restaurant to pick up your order.",
        'picked-up': "I've picked up your order and I'm heading to you!",
        'dropped-off': "I've arrived at your delivery address.",
        'awaiting-payment': "I'm almost there — please prepare your payment.",
        completed: "I've completed your delivery. Enjoy your meal!",
        cancelled: "I've cancelled this delivery.",
      };
      const businessChatMessages: Record<string, string> = {
        'on-the-way': "I'm on my way to pick up this order.",
        arrived: "I've arrived at your restaurant to pick up the order.",
        'picked-up': "I've picked up the order and I'm heading to the customer.",
        'dropped-off': "I've arrived at the customer's delivery address.",
        'awaiting-payment': "I'm at the customer's location completing the delivery.",
        completed: "I've completed this order.",
        cancelled: "I've cancelled this delivery.",
      };
      const recipientMessages: Array<Promise<{ data: any; error: any }>> = [];
      const customerMessage = customerChatMessages[status] || "I've updated the delivery status.";
      const businessMessage = businessChatMessages[status] || "I've updated the delivery status.";

      if (resolvedCustomerId) {
        // The customer gets the completion text; the delivery proof stays in
        // the order record and is sent only to the business chat below.
        recipientMessages.push(this.sendOrderProgressChatMessage({
          orderId: orderId || '',
          orderNumber: orderNumber || undefined,
          senderId,
          senderName: senderName || 'Driver',
          senderRole: 'rider',
          recipientId: resolvedCustomerId,
          recipientRole: 'customer',
          message: customerMessage,
        }));
      }
      if (businessId) {
        recipientMessages.push(this.sendOrderProgressChatMessage({
          orderId: orderId || '',
          orderNumber: orderNumber || undefined,
          senderId,
          senderName: senderName || 'Driver',
          senderRole: 'rider',
          recipientId: businessId,
          recipientName: restaurantName || 'Restaurant',
          recipientRole: 'business',
          message: businessMessage,
          imageUrl: status === 'completed' ? params.deliveryProofUrl : undefined,
        }));
      }

      const chatResults = await Promise.all(recipientMessages);
      chatResults.forEach(({ error: chatError }) => {
        if (chatError) console.error('[supabase] Failed to send delivery progress chat message:', chatError);
      });
    }

    if (notifications.length === 0) {
      return { data: customerData ? [customerData] : null, error: customerError };
    }

    const { data, error } = await supabase
      .from('delivery_notifications')
      .insert(notifications)
      .select();

    if (error) console.error('[supabase] Failed to notify the business about delivery status:', error);
    return { data: [...(customerData ? [customerData] : []), ...(data || [])], error: error || customerError };
  },

  // Notify the customer when the business updates an order's status
  // (pending -> confirmed -> preparing -> ready -> delivered/cancelled).
  async notifyBusinessOrderStatusChange(params: {
    orderId: string;
    orderNumber?: string;
    status: string;
  }) {
    const { orderId, orderNumber, status } = params;

    // Resolve the customer from the order.
    let customerId: string | null = null;
    let businessId: string | null = null;
    let name = '';
    let number = orderNumber || '';
    const { data: order } = await supabase
      .from('orders')
      .select('customer_id, business_id, restaurant_email, order_number')
      .eq('id', orderId)
      .maybeSingle();
    if (order) {
      customerId = order.customer_id || null;
      number = order.order_number || number;
      businessId = order.business_id || null;
      if (!businessId && order.restaurant_email) {
        const { data: restaurant } = await supabase
          .from('restaurants')
          .select('business_user_id, name')
          .eq('id', order.restaurant_email)
          .maybeSingle();
        businessId = restaurant?.business_user_id || null;
        name = restaurant?.name?.trim() || '';
      }
      if (businessId) {
        const { data: restaurant } = await supabase
          .from('restaurants')
          .select('name')
          .eq('business_user_id', businessId)
          .maybeSingle();
        name = restaurant?.name?.trim() || '';
      }
    }
    if (!customerId) return { data: null, error: null };

    const labels: Record<string, { title: string; message: string; emoji: string }> = {
      'payment-confirmed': {
        title: 'Payment received',
        message: 'The shop has received your GCash payment and is preparing your order.',
        emoji: '\uD83D\uDD18',
      },
      'driver-requested': {
        title: 'Driver requested',
        message: 'The restaurant has prepared your food order and requested a driver.',
        emoji: '\uD83D\uDEB5',
      },
      'confirmed': {
        title: 'Order Confirmed',
        message: 'Your order has been confirmed and is being prepared.',
        emoji: '✅',
      },
      'preparing': {
        title: 'Preparing your order',
        message: 'The restaurant is now preparing your order.',
        emoji: '👨\u200d🍳',
      },
      'ready': {
        title: 'Order ready',
        message: 'Your order is ready and waiting for a driver.',
        emoji: '📦',
      },
      'delivered': {
        title: 'Order Delivered',
        message: 'Your order has been delivered. Enjoy your meal!',
        emoji: '🍽️',
      },
      'cancelled': {
        title: 'Order Cancelled',
        message: 'Your order was cancelled by the restaurant.',
        emoji: '❌',
      },
    };
    const label = labels[status] || {
      title: 'Order update',
      message: 'Your order status has been updated.',
      emoji: '🛍️',
    };

    const chatMessages: Record<string, string> = {
      'payment-confirmed': "We've received your GCash payment and we're preparing your order.",
      'driver-requested': "We've prepared your food order and requested a driver.",
      confirmed: "We've confirmed your order and we're preparing it.",
      preparing: "We're preparing your order.",
      ready: "Your order is ready, and we're waiting for a driver.",
      delivered: "We've delivered your order. Enjoy your meal!",
      cancelled: "We've cancelled your order.",
    };

    if (businessId) {
      const { error: chatError } = await this.sendOrderProgressChatMessage({
        orderId,
        orderNumber: number || undefined,
        senderId: businessId,
        senderName: name || 'Restaurant',
        senderRole: 'business',
        recipientId: customerId,
        recipientRole: 'customer',
        message: chatMessages[status] || "We've updated your order status.",
      });
      if (chatError) console.error('[supabase] Failed to send business order progress chat message:', chatError);
    }

    return this.upsertCustomerOrderNotification({
        recipient_id: customerId,
        order_id: orderId,
        order_number: number || null,
        restaurant_name: name || null,
        title: label.title,
        message: name ? `${label.message} (${name})` : label.message,
        type: 'order',
        read: false,
        created_at: new Date().toISOString(),
      });
  },

  async notifyBusinessNewOrder(params: {
    orderId: string;
    orderNumber: string;
    restaurantName: string;
    customerName: string;
    customerId?: string;
    total: number;
    businessUserId: string;
  }) {
    const { orderId, orderNumber, restaurantName, customerName, customerId, total, businessUserId } = params;

    const { data, error } = await supabase
      .from('delivery_notifications')
      .insert([{
        recipient_id: businessUserId,
        order_id: orderId,
        order_number: orderNumber,
        restaurant_name: restaurantName,
        title: '🛒 New Order Received!',
        message: `${customerName} just placed an order for ₱${total.toFixed(2)} (Order #${orderNumber})`,
        type: 'new_order',
        read: false,
        created_at: new Date().toISOString(),
      }])
      .select();

    if (customerId) {
      const { error: chatError } = await this.sendOrderProgressChatMessage({
        orderId,
        orderNumber,
        senderId: customerId,
        senderName: customerName || 'Customer',
        senderRole: 'customer',
        recipientId: businessUserId,
        recipientName: restaurantName || 'Restaurant',
        recipientRole: 'business',
        message: 'I placed a new food order.',
      });
      if (chatError) console.error('[supabase] Failed to send new-order chat message:', chatError);
    }

    return { data, error };
  },

  async notifyBusinessDeliveryCompleted(params: {
    orderId: string;
    orderNumber: string;
    restaurantName: string;
    businessUserId: string;
  }) {
    const { orderId, orderNumber, restaurantName, businessUserId } = params;

    const { data, error } = await supabase
      .from('delivery_notifications')
      .insert([{
        recipient_id: businessUserId,
        order_id: orderId,
        order_number: orderNumber,
        restaurant_name: restaurantName,
        title: '✅ Delivery Completed!',
        message: `Order #${orderNumber} has been delivered successfully`,
        type: 'delivery_completed',
        read: false,
        created_at: new Date().toISOString(),
      }])
      .select();

    return { data, error };
  },

  async getDeliveryNotifications(recipientId: string) {
    const { data, error } = await supabase
      .from('delivery_notifications')
      .select('*')
      .eq('recipient_id', recipientId)
      .order('created_at', { ascending: false })
      .limit(50);
    return { data, error };
  },

  async markDeliveryNotificationsRead(recipientId: string) {
    const { data, error } = await supabase
      .from('delivery_notifications')
      .update({ read: true })
      .eq('recipient_id', recipientId)
      .eq('read', false)
      .select();
    return { data, error };
  },

  async clearDeliveryNotifications(recipientId: string) {
    const { data, error } = await supabase
      .from('delivery_notifications')
      .delete()
      .eq('recipient_id', recipientId)
      .select('id');
    return { data, error };
  },

  // Record a customer's rating for a business after a completed delivery.
  async rateBusiness(details: {
    businessId: string;
    restaurantId?: string;
    customerId: string;
    rating: number;
    orderId?: string;
  }) {
    const { data, error } = await supabase
      .from('business_ratings')
      .insert([{
        business_id: details.businessId,
        restaurant_id: details.restaurantId || null,
        customer_id: details.customerId,
        rating: details.rating,
        order_id: details.orderId || null,
      }])
      .select()
      .single();

    return { data, error };
  },

  // Compute a business's average rating from all ratings received.
  async getBusinessRating(businessId: string) {
    const { data, error } = await supabase
      .from('business_ratings')
      .select('rating')
      .eq('business_id', businessId);

    if (error) return { average: null, count: 0, error };

    const ratings = (data || [])
      .map((r: any) => Number(r.rating))
      .filter((n: number) => !isNaN(n));
    const count = ratings.length;
    const average = count > 0
      ? ratings.reduce((sum: number, n: number) => sum + n, 0) / count
      : null;

    return { average, count, error: null };
  },

   subscribeLobbyUpdates(lobbyId: string, callback: (data: any) => Promise<void> | void) {
     console.log(`📡 Setting up real-time subscription for lobby: ${lobbyId}`);

     const channel = supabase
       .channel(`lobby_${lobbyId}`)
       .on(
         'postgres_changes',
         {
           event: '*',
           schema: 'public',
           table: 'shared_ride_lobbies',
           filter: `id=eq.${lobbyId}`
         },
         async (payload) => {
           console.log('🔄 🔄 🔄 REAL-TIME UPDATE RECEIVED 🔄 🔄 🔄', {
             event: payload.eventType,
             table: payload.table,
             lobbyId: payload.new?.id,
             newData: payload.new
           });

           try {
             // Call the callback with the new data
             // The callback can be async, so we await it
             await Promise.resolve(callback(payload.new));
           } catch (err) {
             console.error('❌ Error processing lobby update callback:', err);
           }
         }
       )
       .subscribe((status) => {
         if (status === 'SUBSCRIBED') {
           console.log(`✅ Real-time subscription ACTIVE for lobby: ${lobbyId}`);
         } else if (status === 'CHANNEL_ERROR') {
           console.error(`❌ Subscription ERROR for lobby: ${lobbyId}`);
         } else if (status === 'CLOSED') {
           console.warn(`⚠️ Subscription CLOSED for lobby: ${lobbyId}`);
         }
       });

     // Return unsubscribe function
     return () => {
       console.log(`🛑 Unsubscribing from lobby: ${lobbyId}`);
       supabase.removeChannel(channel);
     };
   },

  // Message operations
  async saveMessage(message: any) {
    const { data, error } = await supabase
      .from('messages')
      .insert([message])
      .select()
      .single();
    return { data, error };
  },

  async getMessages(senderId: string, receiverId: string) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`)
      .order('created_at', { ascending: true });
    return { data, error };
  },

  async markMessageAsRead(messageId: string) {
    const { data, error } = await supabase
      .from('messages')
      .update({ read: true })
      .eq('id', messageId)
      .select()
      .single();
    return { data, error };
  },

  // Chat operations
  async getChatConversationByThreadKey(threadKey: string) {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('thread_key', threadKey)
      .single();
    return { data, error };
  },

  async getChatConversationById(conversationId: string) {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (error || !data) return { data, error };

    // Resolve the live names/photos, exactly as the inbox does. A thread opened
    // straight by id ("Chat with Driver" on a ride) used to skip this and render
    // the snapshot stored on the row -- a name initial or an emoji -- so the
    // driver was shown as a pilot glyph even though their photo was on file.
    const merged = await supabaseHelpers.resolveChatDisplayProfiles([data]);
    return { data: merged[0], error };
  },

  async ensureChatConversation(conversation: {
    threadKey: string;
    threadType?: string;
    contextType?: string | null;
    contextId?: string | null;
    participantAId: string;
    participantBId: string;
    participantARole: string;
    participantBRole: string;
    participantAName?: string;
    participantBName?: string;
    participantAAvatar?: string;
    participantBAvatar?: string;
    subject?: string | null;
  }) {
    const findExistingForPair = async () => {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*')
        .or(`and(participant_a_id.eq.${conversation.participantAId},participant_b_id.eq.${conversation.participantBId}),and(participant_a_id.eq.${conversation.participantBId},participant_b_id.eq.${conversation.participantAId})`)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false });

      if (error) return { data: null, error };
      const participantAId = conversation.participantAId.toLowerCase();
      const participantBId = conversation.participantBId.toLowerCase();
      const match = (data || []).find((candidate: any) => {
        const candidateAId = String(candidate.participant_a_id || '').toLowerCase();
        const candidateBId = String(candidate.participant_b_id || '').toLowerCase();
        return (candidateAId === participantAId && candidateBId === participantBId) ||
          (candidateAId === participantBId && candidateBId === participantAId);
      });
      return { data: match || null, error: null };
    };

    const updateExistingConversation = async (existing: any) => {
      const updates: Record<string, any> = {};

      const participants = [
        {
          id: conversation.participantAId,
          role: conversation.participantARole,
          name: conversation.participantAName,
          avatar: conversation.participantAAvatar,
        },
        {
          id: conversation.participantBId,
          role: conversation.participantBRole,
          name: conversation.participantBName,
          avatar: conversation.participantBAvatar,
        },
      ];

      for (const participant of participants) {
        const side = String(existing.participant_a_id).toLowerCase() === participant.id.toLowerCase()
          ? 'a'
          : 'b';
        const roleField = `participant_${side}_role`;
        const nameField = `participant_${side}_name`;
        const avatarField = `participant_${side}_avatar`;

        if (participant.role && existing[roleField] !== participant.role) {
          updates[roleField] = participant.role;
        }
        if (participant.name && existing[nameField] !== participant.name) {
          updates[nameField] = participant.name;
        }
        if (participant.avatar && existing[avatarField] !== participant.avatar) {
          updates[avatarField] = participant.avatar;
        }
      }

      if (conversation.threadType && existing.thread_type !== conversation.threadType) {
        updates.thread_type = conversation.threadType;
      }
      if (conversation.contextType !== undefined) {
        const contextType = conversation.contextType || null;
        if (existing.context_type !== contextType) updates.context_type = contextType;
      }
      if (conversation.contextId !== undefined || conversation.contextType !== undefined) {
        const contextId = conversation.contextId || null;
        if (existing.context_id !== contextId) updates.context_id = contextId;
      }

      const contextChanged =
        ('context_type' in updates && updates.context_type !== existing.context_type) ||
        ('context_id' in updates && updates.context_id !== existing.context_id);
      const subject = conversation.subject === undefined
        ? (contextChanged ? null : existing.subject)
        : conversation.subject;
      if (existing.subject !== subject) {
        updates.subject = subject;
      }

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        const { data: updated } = await supabase
          .from('chat_conversations')
          .update(updates)
          .eq('id', existing.id)
          .select()
          .single();
        return { data: updated || existing, error: null };
      }

      return { data: existing, error: null };
    };

    const existing = await findExistingForPair();
    if (existing.error) return existing;
    if (existing.data) return updateExistingConversation(existing.data);

    const { data, error } = await supabase
      .from('chat_conversations')
      .insert([{
        thread_key: conversation.threadKey,
        thread_type: conversation.threadType || 'direct',
        context_type: conversation.contextType || null,
        context_id: conversation.contextId || null,
        participant_a_id: conversation.participantAId,
        participant_b_id: conversation.participantBId,
        participant_a_role: conversation.participantARole,
        participant_b_role: conversation.participantBRole,
        participant_a_name: conversation.participantAName || null,
        participant_b_name: conversation.participantBName || null,
        participant_a_avatar: conversation.participantAAvatar || null,
        participant_b_avatar: conversation.participantBAvatar || null,
        subject: conversation.subject || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) {
      // Two participants may open a new chat at the same time. The pair-wide
      // thread key makes their insert collide safely; resolve that race by
      // loading and reusing the conversation that won.
      const racedConversation = await findExistingForPair();
      if (racedConversation.data) return updateExistingConversation(racedConversation.data);
    }

    return { data, error };
  },

  // Find or create the one persistent chat between two users. Ride context is
  // saved as metadata and never creates a second conversation for the pair.
  async findOrCreateRideChat(params: {
    currentUserId: string;
    currentUserName?: string;
    currentUserRole?: string;
    peerId: string;
    peerRole?: string;
    peerName?: string;
    peerAvatar?: string;
    contextId?: string;
  }) {
    const { currentUserId, currentUserName, currentUserRole, peerId, peerRole, peerName, peerAvatar, contextId } = params;

    const threadKey = buildChatThreadKey({
      participantAId: currentUserId,
      participantBId: peerId,
      contextType: 'ride',
      contextId: contextId || null,
    });

    return supabaseHelpers.ensureChatConversation({
      threadKey,
      threadType: 'ride',
      contextType: 'ride',
      contextId: contextId || null,
      participantAId: currentUserId,
      participantBId: peerId,
      participantARole: currentUserRole || 'customer',
      participantBRole: peerRole || (currentUserRole === 'rider' ? 'customer' : 'rider'),
      participantAName: currentUserName,
      participantBName: peerName,
      participantAAvatar: (currentUserName || '?')[0]?.toUpperCase() || '🙋',
      participantBAvatar: peerAvatar || '👨\u200d✈️',
      subject: contextId ? `Ride ${contextId.substring(0, 8)}` : 'Ride Chat',
    });
  },

  /**
   * Overlay each participant's live name and profile photo onto conversation rows.
   *
   * The `participant_*_avatar` / `participant_*_name` columns on
   * `chat_conversations` are a snapshot written once when the thread is created,
   * and they were seeded with a name initial and an emoji rather than a photo —
   * so a thread showed a letter or a glyph no matter what the person had
   * uploaded, and a photo added later never appeared. Reading `users.avatar_url`
   * here means the real person is shown, including for threads that already
   * exist.
   *
   * Shared by the inbox and the single-thread lookup so the two agree; a thread
   * opened directly by id used to skip this and showed the stored emoji.
   */
  async resolveChatDisplayProfiles(rows: any[]) {
    if (!rows || rows.length === 0) return rows || [];

    // One lookup for every distinct participant across all the rows.
    const ids = Array.from(
      new Set(rows.flatMap((c: any) => [c.participant_a_id, c.participant_b_id]).filter(Boolean))
    );

    const profiles: Record<string, { avatar_url: string | null; name: string | null; role?: string | null }> = {};
    try {
      const { data: people } = await supabase
        .from('users')
        .select('id, name, avatar_url, role')
        .in('id', ids);
      for (const person of people || []) {
        profiles[person.id] = {
          avatar_url: person.avatar_url,
          name: person.name,
          role: person.role,
        };
      }
    } catch (e) {
      // A failed profile read must not take the conversation down with it; the
      // denormalised snapshot is still on the row as a fallback.
      console.warn('[supabase] Could not resolve chat profiles:', e);
    }

    /**
     * Shop names for the business owners taking part.
     *
     * A conversation with a shop should use the current name from its restaurant
     * profile, rather than an owner name or an older name saved on the thread.
     */
    const shopNames: Record<string, string> = {};
    const businessIds = ids.filter((id) => profiles[id]?.role === 'business');
    if (businessIds.length > 0) {
      try {
        const { data: shops } = await supabase
          .from('restaurants')
          .select('business_user_id, name')
          .in('business_user_id', businessIds);
        for (const shop of shops || []) {
          if (shop.business_user_id && shop.name) {
            shopNames[shop.business_user_id] = shop.name;
          }
        }
      } catch (e) {
        console.warn('[supabase] Could not resolve shop names for chat:', e);
      }
    }

    // Prefer the live profile photo. Fall back to the stored value, which is an
    // initial or emoji for older threads.
    return rows.map((c: any) => ({
      ...c,
      participant_a_avatar: profiles[c.participant_a_id]?.avatar_url || c.participant_a_avatar,
      participant_b_avatar: profiles[c.participant_b_id]?.avatar_url || c.participant_b_avatar,
      participant_a_name: shopNames[c.participant_a_id] || profiles[c.participant_a_id]?.name || c.participant_a_name,
      participant_b_name: shopNames[c.participant_b_id] || profiles[c.participant_b_id]?.name || c.participant_b_name,
    }));
  },

  async getChatConversations(userId: string) {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('*')
      .or(`participant_a_id.eq.${userId},participant_b_id.eq.${userId}`)
      .order('updated_at', { ascending: false });

    if (error || !data || data.length === 0) return { data, error };

    const visible = data.filter((conversation: any) =>
      conversation.participant_a_id === userId
        ? !conversation.deleted_by_a_at
        : !conversation.deleted_by_b_at
    );
    const merged = await supabaseHelpers.resolveChatDisplayProfiles(visible);
    return { data: merged, error };
  },

  async deleteChatConversationForUser(conversationId: string, userId: string) {
    const { data: conversation, error: readError } = await supabase
      .from('chat_conversations')
      .select('participant_a_id, participant_b_id')
      .eq('id', conversationId)
      .single();
    if (readError || !conversation) return { error: readError || new Error('Conversation not found') };

    const isParticipantA = conversation.participant_a_id === userId;
    if (!isParticipantA && conversation.participant_b_id !== userId) {
      return { error: new Error('You are not a participant in this conversation') };
    }

    const { error } = await supabase
      .from('chat_conversations')
      .update({ [isParticipantA ? 'deleted_by_a_at' : 'deleted_by_b_at']: new Date().toISOString() })
      .eq('id', conversationId);
    return { error };
  },

  async uploadChatAttachment(conversationId: string, userId: string, file: File) {
    const extension = safeFileExtension(file);
    const filePath = `${conversationId}/${userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage
      .from('chat_attachments')
      .upload(filePath, file, { contentType: file.type, upsert: false });
    if (error) return { data: null, error };

    const { data } = supabase.storage.from('chat_attachments').getPublicUrl(filePath);
    return { data, error: null };
  },

  async reportChatConversation(report: {
    conversationId: string;
    reporterId: string;
    reportedUserId: string;
    details: string;
  }) {
    return await supabase.from('chat_reports').insert({
      conversation_id: report.conversationId,
      reporter_id: report.reporterId,
      reported_user_id: report.reportedUserId,
      details: report.details,
    });
  },

  async getChatMessages(conversationId: string) {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    return { data, error };
  },

  async sendChatMessage(message: {
    conversationId: string;
    senderId: string;
    receiverId: string;
    senderName: string;
    senderRole: string;
    receiverRole: string;
    message: string;
  }) {
    const timestamp = new Date().toISOString();

    /*
     * Read the conversation before writing into it.
     *
     * The receiver used to be whatever the caller passed, and the conversation
     * was only fetched afterwards to bump the unread counters. So a wrong guess
     * from any chat surface went straight into the row: the table holds one
     * message addressed to its own sender, and one whose sender is not a
     * participant of the conversation it landed in. Neither can be read by the
     * person it was meant for, and both skew the counters.
     *
     * Resolving the other participant here makes the receiver a fact about the
     * conversation rather than a value every caller has to get right. A
     * caller's `receiverId` is no longer trusted to address the message.
     */
    const { data: conversation, error: conversationError } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('id', message.conversationId)
      .single();

    if (conversationError || !conversation) {
      console.error('[supabase] Cannot send: conversation not found:', conversationError);
      return { data: null, error: conversationError || new Error('Conversation not found') };
    }

    const isSenderA = conversation.participant_a_id === message.senderId;
    const isSenderB = conversation.participant_b_id === message.senderId;
    const receiverId = isSenderA
      ? conversation.participant_b_id
      : isSenderB
        ? conversation.participant_a_id
        : null;

    // No receiver means the sender is a stranger to this thread; a receiver
    // equal to the sender means the thread is addressed to nobody. Both are
    // refused rather than written.
    if (!receiverId || receiverId === message.senderId) {
      console.error('[supabase] Cannot send: sender is not a participant of this conversation');
      return { data: null, error: new Error('Sender is not a participant of this conversation') };
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .insert([{
        conversation_id: message.conversationId,
        sender_id: message.senderId,
        receiver_id: receiverId,
        sender_name: message.senderName,
        sender_role: message.senderRole,
        receiver_role: message.receiverRole,
        message: message.message,
        read: false,
        created_at: timestamp,
        updated_at: timestamp,
      }])
      .select()
      .single();

    if (!error) {
      await supabase
        .from('chat_conversations')
        .update({
          last_message_preview: message.message.startsWith('chat-image:') ? 'Photo' : message.message,
          last_message_sender_id: message.senderId,
          last_message_at: timestamp,
          // The receiver's counter is the one that moves: the sender is looking
          // at the thread they just wrote in.
          unread_count_a: isSenderA
            ? (conversation.unread_count_a || 0)
            : (conversation.unread_count_a || 0) + 1,
          unread_count_b: isSenderA
            ? (conversation.unread_count_b || 0) + 1
            : (conversation.unread_count_b || 0),
          [isSenderA ? 'deleted_by_a_at' : 'deleted_by_b_at']: null,
          updated_at: timestamp,
        })
        .eq('id', message.conversationId);
    }

    return { data, error };
  },

  /** Send a ride milestone through the existing direct chat for this rider and passenger. */
  async sendRideProgressChatMessage(message: {
    rideId: string;
    senderId: string;
    senderName: string;
    recipientId: string;
    recipientName?: string;
    message: string;
  }) {
    if (!message.senderId || !message.recipientId || message.senderId === message.recipientId) {
      return { data: null, error: null };
    }

    const { data: conversation, error: conversationError } = await this.findOrCreateRideChat({
      currentUserId: message.senderId,
      currentUserName: message.senderName,
      currentUserRole: 'rider',
      peerId: message.recipientId,
      peerName: message.recipientName || 'Customer',
      peerRole: 'customer',
      contextId: message.rideId,
    });

    if (conversationError || !conversation) {
      return { data: null, error: conversationError || new Error('Could not resolve ride chat conversation') };
    }

    // Suppress an immediate retry of the same milestone while still allowing
    // the same rider and passenger to receive it on a later ride.
    const retrySince = new Date(Date.now() - 30_000).toISOString();
    const { data: recentMessage } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('conversation_id', conversation.id)
      .eq('sender_id', message.senderId)
      .eq('message', message.message)
      .gte('created_at', retrySince)
      .limit(1)
      .maybeSingle();

    if (recentMessage) return { data: recentMessage, error: null };

    return this.sendChatMessage({
      conversationId: conversation.id,
      senderId: message.senderId,
      receiverId: message.recipientId,
      senderName: message.senderName,
      senderRole: 'rider',
      receiverRole: 'customer',
      message: message.message,
    });
  },

  /** Send an order milestone through the one direct thread shared by a user pair. */
  async sendOrderProgressChatMessage(message: {
    orderId: string;
    orderNumber?: string;
    senderId: string;
    senderName: string;
    senderRole: string;
    recipientId: string;
    recipientName?: string;
    recipientRole: string;
    message: string;
    imageUrl?: string;
  }) {
    if (!message.senderId || !message.recipientId || message.senderId === message.recipientId) {
      return { data: null, error: null };
    }

    const content = message.orderNumber
      ? `Order #${message.orderNumber} · ${message.message}`
      : message.message;
    const { data: conversation, error: conversationError } = await this.ensureChatConversation({
      threadKey: buildChatThreadKey({
        participantAId: message.senderId,
        participantBId: message.recipientId,
      }),
      participantAId: message.senderId,
      participantBId: message.recipientId,
      participantARole: message.senderRole,
      participantBRole: message.recipientRole,
      participantAName: message.senderName,
      participantBName: message.recipientName,
      participantAAvatar: message.senderName.trim().charAt(0).toUpperCase() || '?',
      participantBAvatar: message.recipientName?.trim().charAt(0).toUpperCase() || undefined,
    });

    if (conversationError || !conversation) {
      return { data: null, error: conversationError || new Error('Could not resolve chat conversation') };
    }

    // Status listeners can replay the current state after reconnecting. Keep one
    // copy of each order milestone in a participant pair's shared thread.
    const { data: existingMessage } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('conversation_id', conversation.id)
      .eq('sender_id', message.senderId)
      .eq('message', content)
      .limit(1)
      .maybeSingle();
    const textResult = existingMessage
      ? { data: existingMessage, error: null }
      : await this.sendChatMessage({
          conversationId: conversation.id,
          senderId: message.senderId,
          receiverId: message.recipientId,
          senderName: message.senderName,
          senderRole: message.senderRole,
          receiverRole: message.recipientRole,
          message: content,
        });
    if (textResult.error || !message.imageUrl) return textResult;

    const imageContent = `chat-image:${message.imageUrl}`;
    const { data: existingImageMessage } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('conversation_id', conversation.id)
      .eq('sender_id', message.senderId)
      .eq('message', imageContent)
      .limit(1)
      .maybeSingle();
    if (existingImageMessage) return textResult;

    const imageResult = await this.sendChatMessage({
      conversationId: conversation.id,
      senderId: message.senderId,
      receiverId: message.recipientId,
      senderName: message.senderName,
      senderRole: message.senderRole,
      receiverRole: message.recipientRole,
      message: imageContent,
    });
    return imageResult.error ? imageResult : textResult;
  },

  async markChatConversationRead(conversationId: string, userId: string) {
    const timestamp = new Date().toISOString();
    const { data: conversation } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    const { data, error } = await supabase
      .from('chat_messages')
      .update({ read: true, read_at: timestamp, updated_at: timestamp })
      .eq('conversation_id', conversationId)
      .neq('sender_id', userId)
      .eq('read', false)
      .select();

    if (conversation) {
      const isParticipantA = conversation.participant_a_id === userId;
      await supabase
        .from('chat_conversations')
        .update({
          unread_count_a: isParticipantA ? 0 : conversation.unread_count_a || 0,
          unread_count_b: isParticipantA ? conversation.unread_count_b || 0 : 0,
          updated_at: timestamp,
        })
        .eq('id', conversationId);
    }

    return { data, error };
  },

  async getUnreadChatCount(userId: string) {
    const { data, error, count } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact' })
      .eq('receiver_id', userId)
      .eq('read', false);

    return { count, data, error };
  },

  subscribeToChatConversation(conversationId: string, callback: (data: any) => void) {
    const channel = supabase
      .channel(`chat_conversation_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => callback(payload.new)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  },

  subscribeToUserChatThreads(userId: string, callback: () => void) {
    const channel = supabase
      // Multiple screens can watch the same user (for example the business
      // sidebar and its incoming chat head). Realtime channel topics must be
      // unique per subscription so one listener cannot collide with another.
      .channel(`chat_threads_${userId}_${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_conversations',
          filter: `participant_a_id=eq.${userId}`,
        },
        () => callback()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_conversations',
          filter: `participant_b_id=eq.${userId}`,
        },
        () => callback()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  },

  // Order operations
  async createOrder(order: any) {
    const { data, error } = await supabase
      .from('orders')
      .insert([order])
      .select()
      .single();
    return { data, error };
  },

  async getOrders(customerId: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    return { data, error };
  },

  // Get all orders with filters
  async getAllOrders(filters?: any) {
    let query = supabase.from('orders').select('*');

    if (filters?.restaurantId) query = query.eq('restaurant_id', filters.restaurantId);
    if (filters?.customerId) query = query.eq('customer_id', filters.customerId);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.orderNumber) query = query.eq('order_number', filters.orderNumber);
    if (filters?.customerEmail) query = query.eq('customer_email', filters.customerEmail);

    const { data, error } = await query.order('created_at', { ascending: false });
    return { data, error };
  },

  // Get order by ID
  async getOrderById(orderId: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    return { data, error };
  },

  // Get order by order number
  async getOrderByNumber(orderNumber: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_number', orderNumber)
      .single();
    return { data, error };
  },

  // Get business orders (orders for a specific restaurant)
  async getBusinessOrders(restaurantId: string, filters?: any) {
    let query = supabase.from('orders').select('*').eq('restaurant_id', restaurantId);

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.startDate) query = query.gte('created_at', filters.startDate);
    if (filters?.endDate) query = query.lte('created_at', filters.endDate);

    const { data, error } = await query.order('created_at', { ascending: false });
    return { data, error };
  },

  // Get pending orders for a business
  async getPendingOrders(restaurantId: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('restaurant_id', restaurantId)
      // 'payment-confirmed' is still live work: the money is in, the food is
      // not cooked yet. Left out, a paid order stopped appearing in the pending
      // list the moment the shop confirmed it.
      .in('status', ['pending', 'payment-confirmed', 'preparing', 'ready', 'on-the-way'])
      .order('created_at', { ascending: true });
    return { data, error };
  },

  // Search orders by customer email
  async searchOrdersByCustomerEmail(customerEmail: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .ilike('customer_email', `%${customerEmail}%`)
      .order('created_at', { ascending: false });
    return { data, error };
  },

  // Get recent orders (last N orders)
  async getRecentOrders(limit: number = 10) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    return { data, error };
  },

  // Update an order's delivery status using either the order ID or order number.
  // This keeps delivery requests and business/customer order views in sync.
  async updateDeliveryOrderStatus(orderId?: string, orderNumber?: string, status?: string) {
    const timestamp = new Date().toISOString();
    const payload = {
      status,
      updated_at: timestamp,
    };

    if (orderId) {
      const byId = await supabase
        .from('orders')
        .update(payload)
        .eq('id', orderId)
        .select()
        .single();

      if (byId.data || !orderNumber) {
        return byId;
      }
    }

    if (orderNumber) {
      const { data: order, error: lookupError } = await supabase
        .from('orders')
        .select('id')
        .eq('order_number', orderNumber)
        .single();

      if (lookupError || !order?.id) {
        return { data: null, error: lookupError || new Error('Order not found') };
      }

      return supabase
        .from('orders')
        .update(payload)
        .eq('id', order.id)
        .select()
        .single();
    }

    return { data: null, error: new Error('Missing order identifier') };
  },

  async updateOrder(orderId: string, updates: any) {
    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId)
      .select()
      .single();
    return { data, error };
  },

  // Delete order
  async deleteOrder(orderId: string) {
    const { data, error } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId);
    return { data, error };
  },

  // File uploads
  async uploadRestaurantImage(restaurantId: string, file: File) {
    const fileExt = file.name.split('.').pop();
    const filePath = `${restaurantId}/image.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('restaurants')
      .upload(filePath, file, { upsert: true });

    if (error) return { data: null, error };

    const { data: publicUrlData } = supabase.storage
      .from('restaurants')
      .getPublicUrl(filePath);

    return { data: publicUrlData, error: null };
  },

  async uploadRestaurantBanner(restaurantId: string, file: File) {
    const filePath = `${restaurantId}/banner.${safeFileExtension(file)}`;

    const { data, error } = await supabase.storage
      .from('restaurants')
      .upload(filePath, file, { upsert: true });

    if (error) return { data: null, error };

    const { data: publicUrlData } = supabase.storage
      .from('restaurants')
      .getPublicUrl(filePath);

    return { data: publicUrlData, error: null };
  },

  async uploadRestaurantLogo(restaurantId: string, file: File) {
    const filePath = `${restaurantId}/logo.${safeFileExtension(file)}`;

    const { data, error } = await supabase.storage
      .from('restaurants')
      .upload(filePath, file, { upsert: true });

    if (error) return { data: null, error };

    const { data: publicUrlData } = supabase.storage
      .from('restaurants')
      .getPublicUrl(filePath);

    return { data: publicUrlData, error: null };
  },

  async uploadProfilePhoto(userId: string, file: File) {
    const filePath = `${userId}/avatar.${safeFileExtension(file)}`;

    // `user_profiles`, not `avatars`: the latter was never created by any
    // migration, so every upload failed against a missing bucket and the UI
    // could only report a generic failure. This bucket is created by
    // SUPABASE_SCHEMA.sql with public read plus a per-user insert policy that
    // keys off the `${userId}/` folder, which is exactly the path above.
    const { error } = await supabase.storage
      .from('user_profiles')
      .upload(filePath, file, { upsert: true });

    if (error) return { data: null, error };

    const { data: publicUrlData } = supabase.storage
      .from('user_profiles')
      .getPublicUrl(filePath);

    return { data: publicUrlData, error: null };
  },

  async uploadMenuItemImage(menuItemId: string, file: File) {
    const fileExt = file.name.split('.').pop();
    const filePath = `${menuItemId}/image.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('menu_items')
      .upload(filePath, file, { upsert: true });

    if (error) return { data: null, error };

    const { data: publicUrlData } = supabase.storage
      .from('menu_items')
      .getPublicUrl(filePath);

    return { data: publicUrlData, error: null };
  },
  // ---------------------------------------------------------------------------
  // Payment proof and delivery proof
  // ---------------------------------------------------------------------------
  //
  // Both are order screenshots: the customer's GCash transfer receipt, and the
  // rider's photo at handover. One bucket ('order_proofs', created by
  // ADD_ORDER_PAYMENT_AND_DELIVERY_PROOF.sql), one folder per order.
  //
  // `safeFileExtension` rather than `file.name.split('.')`, which is what the
  // menu-image upload above does: an unvalidated extension goes straight into
  // the storage path.

  /** The customer's screenshot of their GCash transfer. */
  async uploadOrderPaymentProof(orderId: string, file: File) {
    const filePath = orderId + '/payment.' + safeFileExtension(file);

    const { error } = await supabase.storage
      .from('order_proofs')
      .upload(filePath, file, { upsert: true });

    if (error) return { data: null, error: describeStorageError(error) };

    const { data: publicUrlData } = supabase.storage
      .from('order_proofs')
      .getPublicUrl(filePath);

    return { data: publicUrlData, error: null };
  },

  /** The rider's photo of the handover. */
  async uploadDeliveryProof(orderId: string, file: File) {
    const filePath = orderId + '/delivery.' + safeFileExtension(file);

    const { error } = await supabase.storage
      .from('order_proofs')
      .upload(filePath, file, { upsert: true });

    if (error) return { data: null, error: describeStorageError(error) };

    const { data: publicUrlData } = supabase.storage
      .from('order_proofs')
      .getPublicUrl(filePath);

    return { data: publicUrlData, error: null };
  },

  /** The restaurant's photo of the packed order, shown to riders before pickup. */
  async uploadRestaurantPackagePhoto(orderId: string, file: File) {
    const filePath = orderId + '/restaurant-package-' + Date.now() + '.' + safeFileExtension(file);

    const { error } = await supabase.storage
      .from('order_proofs')
      .upload(filePath, file);

    if (error) return { data: null, error: describeStorageError(error) };

    const { data: publicUrlData } = supabase.storage
      .from('order_proofs')
      .getPublicUrl(filePath);

    return { data: publicUrlData, error: null };
  },

  /**
   * Shop: the transfer has been verified. Moves the order to `payment-confirmed`
   * and records who verified it and when.
   *
   * Guarded on the order still being `pending`, so two people tapping Confirm at
   * the same moment cannot both record a confirmation -- the second update
   * matches no row and reports back rather than overwriting the first one's name.
   */
  async confirmOrderPayment(
    orderId: string,
    businessUserEmail?: string | null,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('orders')
        .update({
          status: 'payment-confirmed',
          payment_confirmed_at: new Date().toISOString(),
          payment_confirmed_by: businessUserEmail || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();

      if (error) return { success: false, error: error.message };
      if (!data) return { success: false, error: 'This order is no longer awaiting payment.' };
      return { success: true };
    } catch (error) {
      console.error('[confirmOrderPayment] error:', error);
      return { success: false, error: 'Network error while confirming the payment' };
    }
  },

  /** Rider: attach the handover photo to the order. */
  async attachDeliveryProof(
    orderId: string,
    proofUrl: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          delivery_proof_url: proofUrl,
          delivery_proof_uploaded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      console.error('[attachDeliveryProof] error:', error);
      return { success: false, error: 'Network error while saving the delivery photo' };
    }
  },

  /** What the shop told customers to do before paying, for the checkout screen. */
  async getPaymentInstructions(restaurantId: string): Promise<{
    instructions: string | null;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('payment_instructions')
        .eq('id', restaurantId)
        .maybeSingle();

      if (error) return { instructions: null, error: error.message };
      return { instructions: data?.payment_instructions?.trim() || null };
    } catch (error) {
      console.error('[getPaymentInstructions] error:', error);
      return { instructions: null, error: 'Network error while loading payment instructions' };
    }
  },

  // Load the admin-set base delivery fee (admin_settings > rates > deliveryBaseFee)
  async getAdminDeliveryFee(): Promise<number> {
    const fallback = 0;
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('setting_value')
        .eq('setting_key', 'rates')
        .single();

      if (!error && data?.setting_value) {
        const parsed = JSON.parse(data.setting_value);
        if (typeof parsed?.deliveryBaseFee === 'number') return parsed.deliveryBaseFee;
      }
    } catch (e) {
      console.warn('[supabaseHelpers] Could not load admin delivery fee from Supabase:', e);
    }

    // Fallback to the localStorage backup of the admin rates
    try {
      const saved = localStorage.getItem('trikeserve_rates');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.deliveryBaseFee === 'number') return parsed.deliveryBaseFee;
      }
    } catch (e) {
      console.warn('[supabaseHelpers] Could not load admin delivery fee from localStorage:', e);
    }

    return fallback;
  },

  // Order Processing Operations
  async createOrderProcessing(processing: any) {
    const { data, error } = await supabase
      .from('order_processing')
      .insert([processing])
      .select()
      .single();
    return { data, error };
  },

  async getOrderProcessing(orderId: string) {
    const { data, error } = await supabase
      .from('order_processing')
      .select('*')
      .eq('order_id', orderId)
      .single();
    return { data, error };
  },

  async getRestaurantProcessing(restaurantId: string, filters?: any) {
    let query = supabase
      .from('order_processing')
      .select('*')
      .eq('restaurant_id', restaurantId);

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.startDate) query = query.gte('created_at', filters.startDate);
    if (filters?.endDate) query = query.lte('created_at', filters.endDate);

    const { data, error } = await query.order('created_at', { ascending: false });
    return { data, error };
  },

  async updateOrderProcessingStatus(orderId: string, status: string, updates?: any) {
    const timestamp = new Date().toISOString();
    const statusUpdateMap: { [key: string]: string } = {
      'received': 'received_at',
      'confirmed': 'confirmed_at',
      'preparing': 'preparing_started_at',
      'quality_check': 'quality_check_at',
      'ready': 'ready_at',
      'assigned_rider': 'rider_assigned_at',
      'on_the_way': 'delivery_started_at',
      'delivered': 'delivered_at',
      'completed': 'completed_at',
      'cancelled': 'cancelled_at',
    };

    const updateData: any = {
      status,
      updated_at: timestamp,
      ...updates,
    };

    // Auto-set timestamp field for this status
    const timestampField = statusUpdateMap[status];
    if (timestampField) {
      updateData[timestampField] = timestamp;
    }

    const { data, error } = await supabase
      .from('order_processing')
      .update(updateData)
      .eq('order_id', orderId)
      .select()
      .single();

    return { data, error };
  },

  async getProcessingByStatus(restaurantId: string, status: string) {
    const { data, error } = await supabase
      .from('order_processing')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('status', status)
      .order('created_at', { ascending: true });

    return { data, error };
  },

  async getActiveProcessing(restaurantId: string) {
    const { data, error } = await supabase
      .from('order_processing')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .in('status', ['received', 'confirmed', 'preparing', 'quality_check', 'ready', 'assigned_rider', 'on_the_way'])
      .order('created_at', { ascending: true });

    return { data, error };
  },

  async getProcessingHistory(restaurantId: string, limit: number = 50) {
    const { data, error } = await supabase
      .from('order_processing')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .in('status', ['delivered', 'completed', 'cancelled'])
      .order('completed_at', { ascending: false })
      .limit(limit);

    return { data, error };
  },

  async assignRiderToOrder(orderId: string, riderId: string, riderName: string) {
    const { data, error } = await supabase
      .from('order_processing')
      .update({
        assigned_rider_id: riderId,
        assigned_rider_name: riderName,
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', orderId)
      .select()
      .single();

    return { data, error };
  },

  async recordQualityCheck(orderId: string, passed: boolean, issues?: any) {
    const { data, error } = await supabase
      .from('order_processing')
      .update({
        qa_passed: passed,
        quality_issues: issues || null,
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', orderId)
      .select()
      .single();

    return { data, error };
  },

  async getProcessingStats(restaurantId: string, dateRange?: { start: string; end: string }) {
    let query = supabase
      .from('order_processing')
      .select('*', { count: 'exact' })
      .eq('restaurant_id', restaurantId);

    if (dateRange?.start) query = query.gte('created_at', dateRange.start);
    if (dateRange?.end) query = query.lte('created_at', dateRange.end);

    const { data, error, count } = await query;

    if (error) return { data: null, error };

    // Calculate statistics
    const stats = {
      totalOrders: count,
      completed: data?.filter(p => p.status === 'completed').length || 0,
      cancelled: data?.filter(p => p.status === 'cancelled').length || 0,
      averagePrepTime: 0,
      qualityIssues: data?.filter(p => !p.qa_passed).length || 0,
    };

    // Calculate average prep time
    const completedWithTime = data?.filter(p => p.actual_prep_time) || [];
    if (completedWithTime.length > 0) {
      const totalTime = completedWithTime.reduce((sum: number, p: any) => sum + (p.actual_prep_time || 0), 0);
      stats.averagePrepTime = Math.round(totalTime / completedWithTime.length);
    }

    return { data: stats, error: null };
  },

  // ─── Ride reports ────────────────────────────────────────────────────
  // Customers and riders submit ride reports; Super Admins review these. Rider
  // report categories are prefixed with `Rider report: ` so the shared table
  // keeps the reporter role clear without changing its existing schema.
  async createRideReport(report: {
    rideId?: string;
    reporterId?: string;
    reporterName?: string;
    reporterEmail?: string;
    driverId?: string;
    driverName?: string;
    category: string;
    description: string;
    rideRoute?: string;
  }) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('ride_reports')
      .insert([{
        ride_id: report.rideId || null,
        reporter_id: report.reporterId || null,
        reporter_name: report.reporterName || null,
        reporter_email: report.reporterEmail || null,
        driver_id: report.driverId || null,
        driver_name: report.driverName || null,
        category: report.category,
        description: report.description,
        ride_route: report.rideRoute || null,
        status: 'pending',
        created_at: now,
        updated_at: now,
      }])
      .select()
      .single();

    return { data, error };
  },

  async getRideReports(status?: string) {
    let query = supabase
      .from('ride_reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    return { data: data || [], error };
  },

  async updateRideReportStatus(id: string, status: string, adminNotes?: string) {
    const { data, error } = await supabase
      .from('ride_reports')
      .update({ status, admin_notes: adminNotes ?? null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return { data, error };
  },

  // Follow the driver's active ride for a delivery order: the ride request the
  // driver accepted for that order. Emits the ride row on every change so the
  // customer and business maps can follow driver_lat/lng live.
  subscribeToOrderDelivery(orderId: string, callback: (data: any) => void) {
    const channel = supabase
      .channel(`order_delivery_${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ride_requests',
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          const record = payload?.new || (payload as any)?.record || null;
          if (record) callback(record);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // Real-time subscription for driver status updates
  subscribeToRideUpdates(rideId: string, callback: (data: any) => void) {
    console.log(`📡 Setting up real-time subscription for ride: ${rideId}`);

    const channel = supabase
      .channel(`ride_${rideId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ride_requests',
          filter: `id=eq.${rideId}`
        },
        (payload) => {
          try {
            console.log('🔄 Real-time update received:', payload);
            // Some payloads (DELETE) may not include `new`. Prefer `new` then `record`.
            const record = payload?.new || payload?.record || null;
            if (!record) {
              console.warn('⚠️ Real-time payload had no record/new field:', payload);
              return;
            }
            callback(record);
          } catch (err) {
            console.error('❌ Error processing realtime payload for ride', rideId, err, payload);
          }
        }
      )
      .subscribe((statusOrEvent) => {
        // Status can be a string or an object depending on client version; log full value for debugging.
        console.log(`📡 subscribe() callback for ride ${rideId} - status:`, statusOrEvent);

        // Attempt to detect common error states
        try {
          const statusStr = typeof statusOrEvent === 'string' ? statusOrEvent : statusOrEvent?.status || statusOrEvent?.type;
          if (statusStr === 'SUBSCRIBED') {
            console.log(`✅ Real-time subscription active for ride: ${rideId}`);
          } else if (String(statusStr).toUpperCase().includes('CHANNEL_ERROR') || String(statusStr).toUpperCase().includes('ERROR')) {
            console.error(`❌ Subscription error for ride: ${rideId} - status:`, statusOrEvent);
          }
        } catch (err) {
          console.warn('⚠️ Unable to parse subscribe status for ride:', rideId, statusOrEvent, err);
        }
      });

    // Return unsubscribe function
    return () => {
      console.log(`🛑 Unsubscribing from ride: ${rideId}`);
      supabase.removeChannel(channel);
    };
  },

  // Subscribe to accepted rides (for driver acceptance in real-time)
  subscribeToAcceptedRides(customerId: string, callback: (data: any) => void) {
    console.log(`📡 Setting up real-time subscription for customer accepted rides: ${customerId}`);

    const channel = supabase
      .channel(`customer_${customerId}_rides`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ride_requests',
          filter: `customer_id=eq.${customerId}`
        },
        (payload) => {
          // Only notify if driver has been assigned
          if (payload.new.accepted_driver_id) {
            console.log('🎉 Driver accepted ride (real-time):', payload);
            callback(payload.new);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`✅ Real-time subscription active for customer: ${customerId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`❌ Subscription error for customer: ${customerId}`);
        }
      });

    return () => {
      console.log(`🛑 Unsubscribing from customer rides: ${customerId}`);
      supabase.removeChannel(channel);
    };
  },

  // Restaurant cuisine & location
  // Added with ADD_RESTAURANT_CUISINE_AND_LOCATION.sql. The customer filters
  // read these; without the migration every call here fails, so each one
  // degrades quietly rather than breaking the page that asked for it.
  async getRestaurantProfile(restaurantId: string) {
    const { data, error } = await supabase
      .from('restaurants')
      .select('id, name, cuisine, latitude, longitude')
      .eq('id', restaurantId)
      .single();
    return { data, error };
  },

  async updateRestaurantCuisine(
    restaurantId: string,
    cuisine: string[],
  ) {
    const { data, error } = await supabase
      .from('restaurants')
      .update({ cuisine, updated_at: new Date().toISOString() })
      .eq('id', restaurantId)
      .select()
      .single();
    return { data, error };
  },

  async updateRestaurantLocation(
    restaurantId: string,
    coords: { latitude: number; longitude: number },
  ) {
    const { data, error } = await supabase
      .from('restaurants')
      .update({
        latitude: coords.latitude,
        longitude: coords.longitude,
        updated_at: new Date().toISOString(),
      })
      .eq('id', restaurantId)
      .select()
      .single();
    return { data, error };
  },

  // Saved delivery addresses
  // Added with ADD_USER_ADDRESSES_AND_SEARCH.sql. Owner-scoped by RLS; the
  // helpers never filter by anything else.
  async getSavedAddresses(userId: string) {
    if (!userId) return { data: [] as any[], error: null };
    const { data, error } = await supabase
      .from('user_addresses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    return { data: data || [], error };
  },

  async addSavedAddress(input: {
    userId: string;
    label: string;
    address: string;
    latitude?: number | null;
    longitude?: number | null;
  }) {
    const { data, error } = await supabase
      .from('user_addresses')
      .insert([
        {
          user_id: input.userId,
          label: input.label,
          address: input.address,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          is_default: false,
        },
      ])
      .select()
      .single();
    return { data, error };
  },

  async updateSavedAddress(
    addressId: string,
    patch: { label?: string; address?: string; latitude?: number | null; longitude?: number | null },
  ) {
    const { data, error } = await supabase
      .from('user_addresses')
      .update(patch)
      .eq('id', addressId)
      .select()
      .single();
    return { data, error };
  },

  async deleteSavedAddress(addressId: string) {
    const { error } = await supabase
      .from('user_addresses')
      .delete()
      .eq('id', addressId);
    return { error };
  },

  // Search logging, for "popular searches"
  async logRestaurantSearch(
    term: string,
    opts: { restaurantId?: string | null; userId?: string | null } = {},
  ) {
    // Normalised here rather than at the call sites so "  Adobo " and "adobo"
    // cannot become two separate rows in the popularity ranking.
    const cleaned = term.trim().toLowerCase().replace(/\s+/g, ' ');
    if (cleaned.length < 2) return { error: null };

    const { error } = await supabase.from('restaurant_searches').insert([
      {
        term: cleaned.slice(0, 120),
        restaurant_id: opts.restaurantId ?? null,
        user_id: opts.userId ?? null,
      },
    ]);
    return { error };
  },

  async getPopularSearchTerms(limit = 8) {
    // Counts in the client: the table is small, and this avoids shipping a
    // database function that every existing deployment would have to apply
    // before the feature worked at all.
    const { data, error } = await supabase
      .from('restaurant_searches')
      .select('term')
      .limit(500);
    if (error || !data?.length) return { data: [] as string[], error };

    const counts = new Map<string, number>();
    for (const row of data as any[]) {
      const term = String(row.term || '').trim();
      if (!term) continue;
      counts.set(term, (counts.get(term) || 0) + 1);
    }

    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([term]) => term);
    return { data: top, error: null };
  },
};

