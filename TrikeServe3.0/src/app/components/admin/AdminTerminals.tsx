import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, Edit2, Trash2, UserPlus, UserMinus, MapPin, Users, Menu, X, Navigation, Search, Loader2, Save, Shield,
  ClipboardCheck, Clock, ShieldCheck, ChevronDown
} from "lucide-react";
import { GoogleMap, MarkerF, InfoWindow, Polygon, Polyline } from "@react-google-maps/api";
import useMapLoader from "@/lib/mapLoader";
import { autocompletePlacesNew, createPlacesSessionToken, fetchPlaceDetailsNew } from "@/lib/placesApi";

import { supabase } from "../../../utils/supabase";
import { useAuth } from "../../contexts/AuthContext";
import {
  submitApprovalRequest,
  getApprovalRequests,
  getRiderAdmins,
  assignRiderAdminTerminal,
  getAdminTerminalAssignment,
  normalizeBoundaryRoad,
  normalizeBoundaryArea,
  normalizeRoadWidth,
  DEFAULT_ROAD_WIDTH_M,
  logAudit,
  APPROVAL_REQUEST_LABELS,
  type ApprovalRequest,
  type RiderAdminSummary,
  type LatLngPoint,
} from "../../../lib/supabase";
import ConfirmationModal from "../ui/confirmation-modal";
import Toast from "../ui/Toast";
import AdminShell from "./AdminShell";
import { StatSkeleton } from "./AdminSkeleton";
import EmptyState from "../ui/EmptyState";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// Default centre for a new terminal's location / boundary picker — Gen T Deleon,
// Valenzuela City (same point the customer/business map selectors default to).
const DEFAULT_TERMINAL_CENTER = { lat: 14.7244, lng: 120.9668 };

// Named in save errors, because a missing column fails the whole upsert and would
// otherwise look like the admin's edits simply weren't sticking.
const MIGRATION_HINT = 'ADD_TERMINAL_ROAD_BOUNDARY.sql / ADD_TERMINAL_BORDER_AREA.sql';

// How often a Rider Admin re-reads their terminal scope, so a Super Admin's
// unassignment takes effect on a screen that is already open.
const ASSIGNMENT_POLL_MS = 15000;

interface Terminal {
  id: string;
  name: string;
  boundary: string;
  center_lat: number;
  center_lng: number;
  radius_km: number;
  is_active: boolean;
  rider_count: number;
  // The road this terminal runs along, plotted on the map; null when none yet.
  boundary_polygon: LatLngPoint[] | null;
  // Closed ring enclosing that road; null when none yet.
  boundary_area: LatLngPoint[] | null;
  // Full width of that road's corridor in metres (ADD_TERMINAL_ROAD_BOUNDARY.sql).
  // A drop-off is accepted within half of this distance of the plotted road.
  road_width_m: number;
  // Whether the road is enforced on drop-off checks. The road itself is kept
  // either way, so this can be switched off and back on without replotting.
  boundary_enabled: boolean;
  // This terminal's own ride fare, set by the terminal admin
  // (ADD_TERMINAL_FARES.sql). Falls back to the platform default when null.
  base_fare: number;
  per_km: number;
}

interface StoredRider {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  role: string;
  isVerified?: boolean;
  todaPlate?: string;
  toda_plate?: string;
  licenseNumber?: string;
  terminalId?: string;
  terminal_id?: string;
  terminalName?: string;
  terminal_name?: string;
  [key: string]: unknown;
}

// Seed terminals (same as the reference implementation) so the page is
// immediately usable; persisted under `trikeserve_terminals` afterwards.
const TERMINALS_KEY = "trikeserve_terminals";

const SEED_TERMINALS: Terminal[] = [
  { id: "t1", name: "Valenzuela Terminal", boundary: "Main Road, Valenzuela City", center_lat: 14.7294, center_lng: 120.9349, radius_km: 2.0, is_active: true, rider_count: 2, boundary_polygon: null, base_fare: 20, per_km: 10 },
  { id: "t2", name: "Malinta Terminal", boundary: "Malinta, Valenzuela City", center_lat: 14.7150, center_lng: 120.9500, radius_km: 1.5, is_active: true, rider_count: 1, boundary_polygon: null, base_fare: 20, per_km: 10 },
  { id: "t3", name: "Paso de Blas Terminal", boundary: "Paso de Blas, Valenzuela City", center_lat: 14.6950, center_lng: 120.9600, radius_km: 1.8, is_active: false, rider_count: 0, boundary_polygon: null, base_fare: 20, per_km: 10 },
];

// Demo riders so driver assignment works out of the box, mirroring the mock
// riders in the reference app. They are merged (deduped by id) with any real
// users already stored in `trikeserve_users`.
const MOCK_RIDERS: StoredRider[] = [
  { id: "u2", name: "Juan dela Cruz", email: "juan@example.com", phone: "09181234567", role: "rider", isVerified: true, todaPlate: "TV-1234", licenseNumber: "N05-12-345678", terminalId: "t1", terminalName: "Valenzuela Terminal" },
  { id: "u3", name: "Ana Reyes", email: "ana@example.com", phone: "09191234567", role: "rider", isVerified: false, todaPlate: "TV-5678" },
  { id: "u6", name: "Carlo Bautista", email: "carlo@example.com", phone: "09221234567", role: "rider", isVerified: true, todaPlate: "TV-9012", terminalId: "t2", terminalName: "Malinta Terminal" },
];

function getStoredTerminals(): Terminal[] {
  const raw = localStorage.getItem(TERMINALS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through to seeds */
    }
  }
  return [...SEED_TERMINALS];
}

/** All known users: stored users plus demo riders, deduped by id. */
function getAllUsers(): StoredRider[] {
  let stored: StoredRider[] = [];
  const raw = localStorage.getItem("trikeserve_users");
  if (raw) {
    try {
      stored = JSON.parse(raw);
    } catch {
      stored = [];
    }
  }
  return [...stored, ...MOCK_RIDERS.filter(m => !stored.find(u => u.id === m.id))];
}

export default function AdminTerminals() {
  const { user } = useAuth();
  // The Super Admin manages terminals directly. A Rider Admin is scoped to the
  // single terminal assigned to them, and their changes are staged for approval.
  const isSuperAdmin = user?.adminType === 'business_customer';
  const isRiderAdmin = user?.adminType === 'rider';

  // Terminal the current Rider Admin is limited to
  const [assignedTerminalId, setAssignedTerminalId] = useState<string | null>(user?.terminalId ?? null);
  const [assignedTerminalName, setAssignedTerminalName] = useState<string | null>(user?.terminalName ?? null);
  // Rider Admin accounts + their terminal scope (Super Admin view)
  const [riderAdmins, setRiderAdmins] = useState<RiderAdminSummary[]>([]);
  const [savingAssignmentId, setSavingAssignmentId] = useState<string | null>(null);

  const [terminals, setTerminals] = useState<Terminal[]>(getStoredTerminals());
  // true until the first Supabase round-trip resolves, so the page can show a
  // skeleton instead of a half-populated list.
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<StoredRider[]>(getAllUsers());
  const [showForm, setShowForm] = useState(false);
  const [editTerminal, setEditTerminal] = useState<Terminal | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    boundary: "",
    center_lat: DEFAULT_TERMINAL_CENTER.lat,
    center_lng: DEFAULT_TERMINAL_CENTER.lng,
    is_active: true,
    boundary_polygon: [] as LatLngPoint[],
    // The closed ring that encloses the road. Separate from the road because the
    // two are plotted independently and either can be absent.
    boundary_area: [] as LatLngPoint[],
    road_width_m: DEFAULT_ROAD_WIDTH_M,
    boundary_enabled: true,
    // This terminal's own ride fare, editable by the terminal admin.
    base_fare: 20,
    per_km: 10,
  });
  const [showMapPicker, setShowMapPicker] = useState(false);
  // The map picker either moves the terminal pin, plots the road, or plots the
  // area that encloses it.
  const [mapPickerMode, setMapPickerMode] = useState<'location' | 'boundary' | 'area'>('location');
  // Undo/redo for plotting. `boundaryPast` holds the states the current shape can
  // be stepped back to; `boundaryFuture` holds the ones it was stepped away from,
  // which Redo walks forward through. The shapes in `form` stay the single source
  // of truth — these are just the states either side of them.
  const [boundaryPast, setBoundaryPast] = useState<{ road: LatLngPoint[]; area: LatLngPoint[] }[]>([]);
  const [boundaryFuture, setBoundaryFuture] = useState<{ road: LatLngPoint[]; area: LatLngPoint[] }[]>([]);
  // Bound on the stacks so a long plotting session can't grow them without limit.
  const BOUNDARY_HISTORY_MAX = 50;
  const [isSnappingRoad, setIsSnappingRoad] = useState(false);
  // Set once the Roads API turns out to be unusable (most often simply not
  // enabled on the Google Cloud project), so the picker can say why the plotted
  // line isn't following the road instead of leaving the admin to guess.
  const [roadSnapUnavailable, setRoadSnapUnavailable] = useState(false);

  /**
   * Pull a tapped point onto the nearest real road via the Roads API, so the
   * plotted line follows the road instead of cutting across it. Falls back to
   * the raw tap whenever the API is unavailable or unhappy — a slightly crooked
   * road is better than refusing to plot one.
   */
  const snapToRoad = useCallback(async (point: LatLngPoint): Promise<LatLngPoint> => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setRoadSnapUnavailable(true);
      return point;
    }

    setIsSnappingRoad(true);
    try {
      // A path is comma-separated lat,lng pairs; `|` would separate whole points.
      const url =
        'https://roads.googleapis.com/v1/snapToRoads' +
        `?path=${point.lat.toFixed(6)},${point.lng.toFixed(6)}` +
        `&interpolate=false&key=${encodeURIComponent(apiKey)}`;

      const res = await fetch(url);
      if (!res.ok) {
        // 403 means the Roads API isn't enabled on this key's project; 400 is
        // usually a bad key. Either way, snapping won't happen for this session.
        if (res.status === 403 || res.status === 400) setRoadSnapUnavailable(true);
        return point;
      }

      const json = await res.json();
      const snapped = json?.snappedPoints?.[0]?.location;
      if (!snapped) return point;

      setRoadSnapUnavailable(false);
      return { lat: Number(snapped.latitude), lng: Number(snapped.longitude) };
    } catch {
      return point;
    } finally {
      setIsSnappingRoad(false);
    }
  }, []);

  /**
   * Densify a whole plotted path along the road network. Each tap already snaps
   * to the nearest road, but two taps on a curving road would still be joined by
   * a straight line that cuts the corner; interpolating between them fills in the
   * road's own vertices. Falls back to the taps as given if the API is unusable.
   */
  const densifyRoad = useCallback(async (points: LatLngPoint[]): Promise<LatLngPoint[]> => {
    if (points.length < 2) return points;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return points;

    try {
      const path = points.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('|');
      const url =
        'https://roads.googleapis.com/v1/snapToRoads' +
        `?path=${path}&interpolate=true&key=${encodeURIComponent(apiKey)}`;

      const res = await fetch(url);
      if (!res.ok) return points;

      const json = await res.json();
      const snapped: LatLngPoint[] = (json?.snappedPoints || [])
        .map((p: any) => ({ lat: Number(p?.location?.latitude), lng: Number(p?.location?.longitude) }))
        .filter((p: LatLngPoint) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

      // Keep the taps themselves if interpolation came back empty or thinner than
      // what we already had — never let a road get saved with fewer points.
      return snapped.length >= points.length ? snapped : points;
    } catch {
      return points;
    }
  }, []);

  /**
   * What the pin and road looked like when the map picker opened, so closing
   * can tell whether the admin has work in there that closing would throw away.
   */
  const [mapPickerSnapshot, setMapPickerSnapshot] = useState<{
    center_lat: number;
    center_lng: number;
    polygon: LatLngPoint[];
    area: LatLngPoint[];
  } | null>(null);
  const { isLoaded: isMapsLoaded } = useMapLoader();
  const formMapRef = useRef<google.maps.Map | null>(null);
  // The admin's live GPS position — the map picker opens here so a terminal is
  // placed relative to where the admin actually is, not a hardcoded city.
  const [adminLocation, setAdminLocation] = useState<{ lat: number; lng: number } | null>(null);

  const refreshAdminLocation = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setAdminLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60_000 }
    );
  }, []);

  useEffect(() => {
    refreshAdminLocation();
  }, [refreshAdminLocation]);

  function openMapPicker() {
    refreshAdminLocation();
    setMapPickerSnapshot({
      center_lat: form.center_lat,
      center_lng: form.center_lng,
      polygon: [...form.boundary_polygon],
      area: [...form.boundary_area],
    });
    setShowMapPicker(true);
  }

  const samePoints = (a: LatLngPoint[], b: LatLngPoint[]) =>
    a.length === b.length && a.every((p, i) => p.lat === b[i].lat && p.lng === b[i].lng);

  /** True when the pin moved or either boundary shape was edited since the picker opened. */
  const hasUnsavedMapChanges =
    !!mapPickerSnapshot &&
    (form.center_lat !== mapPickerSnapshot.center_lat ||
      form.center_lng !== mapPickerSnapshot.center_lng ||
      !samePoints(form.boundary_polygon, mapPickerSnapshot.polygon) ||
      !samePoints(form.boundary_area, mapPickerSnapshot.area));

  /** Closes the picker outright. Going through requestCloseMapPicker is the user-facing path. */
  function closeMapPicker() {
    setShowMapPicker(false);
    setShowMapSearchDropdown(false);
    setMapSearchQuery("");
    setMapPickerSnapshot(null);
  }

  // Closing without saving is the easy way to lose a plotted boundary, so ask
  // first — but only when there is genuinely something to lose.
  function requestCloseMapPicker() {
    if (!hasUnsavedMapChanges) {
      closeMapPicker();
      return;
    }

    const plotted = form.boundary_polygon.length + form.boundary_area.length;
    openModal({
      title: 'Discard Map Changes?',
      message:
        plotted > 0
          ? `You have ${plotted} plotted point${plotted === 1 ? '' : 's'} and a moved pin that have not been saved yet. Closing now discards them.`
          : 'You have moved the terminal pin and it has not been saved yet. Closing now discards it.',
      variant: 'warning',
      confirmLabel: 'Discard Changes',
      zIndexClassName: 'z-[2030]',
      onConfirm: () => {
        closeModal();
        closeMapPicker();
      },
    });
  }

  // Saving from the picker runs the same checks the form's Save does — the picker
  // can be opened before the terminal has a name or area, so those aren't optional.
  function saveChangesFromPicker() {
    if (!form.name || !form.boundary) {
      setToast({ message: 'Add a terminal name and boundary area before saving.', variant: 'error' });
      return;
    }

    const validationError = boundaryValidationError();
    if (validationError) {
      setToast({ message: validationError, variant: 'error' });
      return;
    }

    confirmSaveTerminal();
  }

  /** Snapshot of both shapes as they stand, for the undo stacks. */
  const boundaryNow = () => ({
    road: form.boundary_polygon,
    area: form.boundary_area,
  });

  // Every edit to either shape goes through commitBoundary, so undo/redo can't
  // miss one. It records both shapes as they stand and applies `next`, and drops
  // any redo branch — editing after an undo starts a new one.
  function commitBoundary(next: Partial<{ road: LatLngPoint[]; area: LatLngPoint[] }>) {
    setBoundaryPast(p => [...p, boundaryNow()].slice(-BOUNDARY_HISTORY_MAX));
    setBoundaryFuture([]);
    setForm(f => ({
      ...f,
      ...(next.road ? { boundary_polygon: next.road } : {}),
      ...(next.area ? { boundary_area: next.area } : {}),
    }));
  }

  function undoBoundary() {
    if (boundaryPast.length === 0) return;
    const previous = boundaryPast[boundaryPast.length - 1];
    setBoundaryPast(p => p.slice(0, -1));
    setBoundaryFuture(future => [boundaryNow(), ...future].slice(0, BOUNDARY_HISTORY_MAX));
    setForm(f => ({
      ...f,
      boundary_polygon: previous.road,
      boundary_area: previous.area,
    }));
  }

  function redoBoundary() {
    if (boundaryFuture.length === 0) return;
    const next = boundaryFuture[0];
    setBoundaryFuture(future => future.slice(1));
    setBoundaryPast(past => [...past, boundaryNow()].slice(-BOUNDARY_HISTORY_MAX));
    setForm(f => ({
      ...f,
      boundary_polygon: next.road,
      boundary_area: next.area,
    }));
  }

  // Opening a different terminal starts fresh shapes, so it also starts a
  // fresh history — otherwise Redo could walk back into another terminal's area.
  function resetBoundaryHistory() {
    setBoundaryPast([]);
    setBoundaryFuture([]);
  }
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [mapSearchResults, setMapSearchResults] = useState<any[]>([]);
  const [isMapSearching, setIsMapSearching] = useState(false);
  const [showMapSearchDropdown, setShowMapSearchDropdown] = useState(false);
  const [placesSessionToken, setPlacesSessionToken] = useState<string>(() => createPlacesSessionToken());

  // Pending rider assignment changes (not saved until user clicks Save Changes)
  type PendingAction = { action: 'assign' | 'unassign'; terminalId: string; terminalName: string };
  const [pendingChanges, setPendingChanges] = useState<Record<string, PendingAction>>({});

  // The Rider Admin's own submitted requests, so they can see review status
  const [myRequests, setMyRequests] = useState<ApprovalRequest[]>([]);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; variant?: 'success' | 'error' | 'warning' } | null>(null);

  // Confirmation modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'success';
    confirmLabel: string;
    onConfirm: () => void;
    zIndexClassName?: string;
  } | null>(null);

  const openModal = (config: typeof modalConfig) => {
    setModalConfig(config);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalConfig(null);
  };

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  // Load from Supabase when available; fall back to localStorage data otherwise.
  useEffect(() => {
    loadData();
    loadMyRequests();
    loadMyAssignment();
    loadRiderAdmins();
  }, [user?.email]);

  // A Rider Admin's scope can be pulled away by the Super Admin at any moment,
  // and this screen used to read it exactly once on mount. Someone left sitting
  // on the page therefore carried on seeing — and could still open and edit — a
  // terminal they were no longer assigned to, which reads to the Super Admin as
  // "the unassign didn't work". Poll for it, and re-check whenever the tab comes
  // back to the foreground, which is when someone is most likely to have been
  // switched to another tab to make the change.
  useEffect(() => {
    if (!isRiderAdmin || !user?.email) return;

    const refresh = () => { loadMyAssignment(); };
    const interval = setInterval(refresh, ASSIGNMENT_POLL_MS);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [isRiderAdmin, user?.email]);

  // Losing the assignment while the edit form is open would leave it saving
  // against a terminal this admin can no longer touch. Close it instead.
  useEffect(() => {
    if (!isRiderAdmin) return;
    if (!assignedTerminalId) {
      setShowForm(false);
      setShowMapPicker(false);
      setEditTerminal(null);
    }
  }, [isRiderAdmin, assignedTerminalId]);

  async function loadData() {
    setLoading(true);
    try {
      const [dbTerminals, dbRiders] = await Promise.all([
        loadTerminalsFromSupabase(),
        loadRidersFromSupabase(),
      ]);
      if (dbTerminals) setTerminals(dbTerminals);
      if (dbRiders) setUsers(dbRiders);
    } finally {
      setLoading(false);
    }
  }

  async function loadTerminalsFromSupabase(): Promise<Terminal[] | null> {
    try {
      const { data, error } = await supabase.from("terminals").select("*");
      if (error || !data || data.length === 0) return null;
      return data.map((t: any) => ({
        id: t.id,
        name: t.name,
        boundary: t.boundary,
        center_lat: t.center_lat ?? DEFAULT_TERMINAL_CENTER.lat,
        center_lng: t.center_lng ?? DEFAULT_TERMINAL_CENTER.lng,
        radius_km: t.radius_km ?? 2.0,
        is_active: t.is_active ?? true,
        rider_count: t.rider_count ?? 0,
        boundary_polygon: normalizeBoundaryRoad(t.boundary_polygon),
        boundary_area: normalizeBoundaryArea(t.boundary_area),
        road_width_m: normalizeRoadWidth(t.road_width_m),
        boundary_enabled: t.boundary_enabled !== false,
        base_fare: t.base_fare ?? 20,
        per_km: t.per_km ?? 10,
      }));
    } catch {
      return null;
    }
  }

  async function loadRidersFromSupabase(): Promise<StoredRider[] | null> {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("role", "rider");
      if (error || !data) return null;
      return data.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        isVerified: u.is_verified,
        todaPlate: u.toda_plate,
        licenseNumber: u.license_number,
        terminalId: u.terminal_id,
        terminalName: u.terminal_name,
      }));
    } catch {
      return null;
    }
  }

  async function loadMyRequests() {
    if (!user?.email) return;
    const { data } = await getApprovalRequests({ requestedByEmail: user.email });
    setMyRequests(data);
  }

  // Read the Rider Admin's terminal scope fresh from the DB so a Super Admin
  // assignment takes effect without the Rider Admin having to log out.
  async function loadMyAssignment() {
    if (!isRiderAdmin || !user?.email) return;
    const { terminal_id, terminal_name } = await getAdminTerminalAssignment(user.email);
    setAssignedTerminalId(terminal_id);
    setAssignedTerminalName(terminal_name);
  }

  async function loadRiderAdmins() {
    if (!isSuperAdmin) return;
    const { data } = await getRiderAdmins();
    setRiderAdmins(data);
  }

  async function handleAssignRiderAdmin(adminId: string, terminalId: string) {
    const terminal = terminals.find(t => t.id === terminalId) || null;
    setSavingAssignmentId(adminId);
    const result = await assignRiderAdminTerminal(adminId, terminalId || null, terminal?.name ?? null);
    setSavingAssignmentId(null);

    if (!result.success) {
      setToast({ message: `Assignment failed: ${result.error}`, variant: 'error' });
      return;
    }

    logAudit({
      action: 'assign_rider_admin',
      actorRole: 'admin',
      entityType: 'rider_admin',
      entityId: adminId,
      summary: terminal
        ? `Assigned ${admin.email} to ${terminal.name}`
        : `Unassigned ${admin.email}`,
      details: { terminal_id: terminalId, terminal_name: terminal?.name ?? null },
      actorEmail: user?.email,
      actorName: user?.name,
    });
    await loadRiderAdmins();
    setToast({
      message: terminal ? `Rider admin assigned to ${terminal.name}` : 'Rider admin unassigned',
      variant: 'success',
    });
  }

  // Confirm before changing a Rider Admin's scope — the select stays on the old
  // value until the Super Admin actually accepts the change.
  function confirmAssignRiderAdmin(admin: RiderAdminSummary, terminalId: string) {
    const terminal = terminals.find(t => t.id === terminalId) || null;
    const label = admin.name || admin.email || 'this Rider Admin';

    openModal({
      title: terminal ? "Assign Terminal" : "Remove Assignment",
      message: terminal
        ? `Assign ${label} to ${terminal.name}? They will only be able to edit this terminal and manage its drivers, and their changes will still need your approval.`
        : `Remove the terminal assignment for ${label}? They will not be able to manage any terminal until you assign them again.`,
      variant: terminal ? 'success' : 'warning',
      confirmLabel: terminal ? 'Assign' : 'Remove',
      onConfirm: async () => {
        closeModal();
        await handleAssignRiderAdmin(admin.id, terminalId);
      },
    });
  }

  const riders = users.filter(u => u.role === "rider");

  const riderTerminalId = (r: StoredRider) => r.terminalId || r.terminal_id;
  const riderTerminalName = (r: StoredRider) => r.terminalName || r.terminal_name;
  const riderPlate = (r: StoredRider) => r.todaPlate || r.toda_plate || "";
  // Users are stored with `name` in this app and `first_name`/`last_name` in
  // older/mock data — support both so existing localStorage isn't broken.
  const riderName = (r: StoredRider): string => {
    if (r.name) return r.name;
    const first = r.first_name || "";
    const last = r.last_name || "";
    if (first || last) return `${first} ${last}`.trim();
    return "Driver";
  };

  function getRidersForTerminal(tid: string) {
    return riders.filter(r => riderTerminalId(r) === tid);
  }

  function getUnassignedRiders() {
    return riders.filter(r => !riderTerminalId(r));
  }

  // A Rider Admin only ever sees the terminal they are scoped to.
  const visibleTerminals = isRiderAdmin
    ? terminals.filter(t => t.id === assignedTerminalId)
    : terminals;

  function openCreate() {
    setForm({ name: "", boundary: "", center_lat: DEFAULT_TERMINAL_CENTER.lat, center_lng: DEFAULT_TERMINAL_CENTER.lng, is_active: true, boundary_polygon: [], boundary_area: [], road_width_m: DEFAULT_ROAD_WIDTH_M, boundary_enabled: true, base_fare: 20, per_km: 10 });
    setEditTerminal(null);
    setMapPickerMode('location');
    resetBoundaryHistory();
    setShowForm(true);
  }

  function openEdit(t: Terminal) {
    setForm({
      name: t.name,
      boundary: t.boundary,
      center_lat: t.center_lat,
      center_lng: t.center_lng,
      is_active: t.is_active,
      boundary_polygon: t.boundary_polygon ? [...t.boundary_polygon] : [],
      boundary_area: t.boundary_area ? [...t.boundary_area] : [],
      road_width_m: normalizeRoadWidth(t.road_width_m),
      boundary_enabled: t.boundary_enabled !== false,
      base_fare: t.base_fare ?? 20,
      per_km: t.per_km ?? 10,
    });
    setEditTerminal(t);
    setMapPickerMode('location');
    resetBoundaryHistory();
    setShowForm(true);
  }

  const handleFormMapClick = useCallback(async (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();

    // Only the shapes are undoable — moving the pin stays out of the history so
    // Undo can't yank it somewhere unexpected.
    if (mapPickerMode === 'location') {
      setForm(f => ({ ...f, center_lat: lat, center_lng: lng }));
      return;
    }

    if (mapPickerMode === 'area') {
      // The area is a hand-drawn ring, so taps go down exactly as given.
      setBoundaryPast(p => [...p, { road: form.boundary_polygon, area: form.boundary_area }].slice(-BOUNDARY_HISTORY_MAX));
      setBoundaryFuture([]);
      setForm(f => ({ ...f, boundary_area: [...f.boundary_area, { lat, lng }] }));
      return;
    }

    const point = await snapToRoad({ lat, lng });
    setBoundaryPast(p => [...p, { road: form.boundary_polygon, area: form.boundary_area }].slice(-BOUNDARY_HISTORY_MAX));
    setBoundaryFuture([]);
    setForm(f => ({ ...f, boundary_polygon: [...f.boundary_polygon, point] }));
  }, [mapPickerMode, form.boundary_polygon, form.boundary_area, snapToRoad]);

  const handleFormMapLoad = useCallback((map: google.maps.Map) => {
    formMapRef.current = map;
    // Open on the admin's current position; fall back to the terminal's pin and
    // then the Gen T Deleon default when GPS isn't available.
    map.setCenter(adminLocation ?? { lat: form.center_lat, lng: form.center_lng });
    map.setZoom(15);
  }, [adminLocation, form.center_lat, form.center_lng]);

  // GPS can resolve after the map mounts; once it does, move the picker to it.
  useEffect(() => {
    if (showMapPicker && adminLocation && formMapRef.current) {
      formMapRef.current.setCenter(adminLocation);
      formMapRef.current.setZoom(15);
    }
  }, [showMapPicker, adminLocation]);

  // Debounced Places autocomplete search for terminal location
  useEffect(() => {
    if (!mapSearchQuery.trim()) {
      setMapSearchResults([]);
      setShowMapSearchDropdown(false);
      return;
    }
    if (!GOOGLE_MAPS_API_KEY) return;

    setIsMapSearching(true);
    const timer = setTimeout(async () => {
      try {
        const suggestions = await autocompletePlacesNew({
          input: mapSearchQuery.trim(),
          apiKey: GOOGLE_MAPS_API_KEY,
          locationBias: { lat: form.center_lat, lng: form.center_lng },
          restrictToCountry: "ph",
          sessionToken: placesSessionToken,
        });
        setMapSearchResults(suggestions || []);
        setShowMapSearchDropdown(true);
      } catch (err) {
        console.warn("[AdminTerminals] Autocomplete failed:", err);
        setMapSearchResults([]);
      } finally {
        setIsMapSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [mapSearchQuery]);

  const handleMapSearchPick = async (suggestion: any) => {
    setMapSearchQuery(suggestion.displayName);
    setShowMapSearchDropdown(false);
    if (!GOOGLE_MAPS_API_KEY || !suggestion.place_id) return;
    try {
      const place = await fetchPlaceDetailsNew({
        placeId: suggestion.place_id,
        apiKey: GOOGLE_MAPS_API_KEY,
        sessionToken: placesSessionToken,
      });
      const lat = place?.lat;
      const lng = place?.lng;
      if (typeof lat === "number" && typeof lng === "number") {
        setForm(f => ({ ...f, center_lat: lat, center_lng: lng }));
        if (formMapRef.current) {
          formMapRef.current.panTo({ lat, lng });
          formMapRef.current.setZoom(16);
        }
      }
    } catch (err) {
      console.warn("[AdminTerminals] Place details failed:", err);
    } finally {
      setPlacesSessionToken(createPlacesSessionToken());
    }
  };

  /** Error message when a plotted shape can't be saved as-is, else null. */
  function boundaryValidationError(): string | null {
    // A single tap doesn't describe a road yet — two points do.
    if (form.boundary_polygon.length > 0 && form.boundary_polygon.length < 2) {
      return 'Add at least 2 points to the road, or clear it.';
    }
    // A ring needs three corners before it encloses anything.
    if (form.boundary_area.length > 0 && form.boundary_area.length < 3) {
      return `Add at least 3 points to the border area (${form.boundary_area.length} so far), or clear it.`;
    }
    return null;
  }

  // Confirm before applying a boundary — it decides which customer drop-offs this
  // terminal accepts and where its drivers may queue up.
  function confirmSaveTerminal() {
    if (!form.name || !form.boundary) return;

    const validationError = boundaryValidationError();
    if (validationError) {
      setToast({ message: validationError, variant: 'error' });
      return;
    }

    const roadPts = form.boundary_polygon.length;
    const areaPts = form.boundary_area.length;
    const hadBoundary =
      (editTerminal?.boundary_polygon?.length ?? 0) >= 2 ||
      (editTerminal?.boundary_area?.length ?? 0) >= 3;
    const halfWidth = Math.round(normalizeRoadWidth(form.road_width_m) / 2);

    const describe = () => {
      const parts: string[] = [];
      if (roadPts >= 2) parts.push(`a road with ${roadPts} points (${halfWidth} m either side)`);
      if (areaPts >= 3) parts.push(`a border area with ${areaPts} points`);
      return parts.join(' and ');
    };

    // Nothing boundary-related to confirm when none was ever or is being plotted.
    if (roadPts < 2 && areaPts < 3 && !hadBoundary) {
      saveTerminal();
      return;
    }

    const removing = roadPts < 2 && areaPts < 3;

    openModal({
      title: removing ? 'Remove Boundary' : 'Confirm Boundary',
      message: removing
        ? `Save ${form.name} with no boundary? Its road and border area will no longer restrict where customers are dropped off or where drivers can queue.`
        : `Save ${form.name} with ${describe()}? Customers can't be dropped off and drivers can't queue outside every terminal's boundary.${isRiderAdmin ? ' Your change will be sent to the Super Admin for approval.' : ''}`,
      variant: removing ? 'warning' : 'success',
      confirmLabel: removing ? 'Save' : 'Save Boundary',
      onConfirm: async () => {
        closeModal();
        await saveTerminal();
      },
    });
  }

  // Confirm before wiping a plotted shape (available from the form and the map picker).
  function confirmClearBoundary() {
    const roadPts = form.boundary_polygon.length;
    const areaPts = form.boundary_area.length;
    if (roadPts === 0 && areaPts === 0) return;

    const shape =
      areaPts > 0 && roadPts > 0 ? 'road and border area' : areaPts > 0 ? 'border area' : 'road';
    const total = roadPts + areaPts;

    openModal({
      title: `Clear ${shape === 'road' ? 'Road' : 'Border Area'}`,
      message: `Remove all ${total} plotted point${total === 1 ? '' : 's'}? This terminal will have no ${shape} until you plot again, so its drop-offs will not be checked and its drivers can queue from anywhere.`,
      variant: 'warning',
      confirmLabel: 'Clear',
      // The map picker sits at z-[2010], so the dialog has to outrank it.
      zIndexClassName: 'z-[2030]',
      onConfirm: () => {
        closeModal();
        commitBoundary({ road: [], area: [] });
      },
    });
  }

  async function saveTerminal() {
    if (!form.name || !form.boundary) return;
    if (boundaryValidationError()) return;

    // Two points already describe a road; three enclose an area. Anything less
    // isn't worth saving.
    const tappedRoad = form.boundary_polygon.length >= 2 ? form.boundary_polygon : null;
    const boundaryArea = form.boundary_area.length >= 3 ? form.boundary_area : null;
    const roadWidthM = normalizeRoadWidth(form.road_width_m);
    // Store the road as the network actually runs it, not just the tapped corners.
    const boundaryPolygon = tappedRoad ? await densifyRoad(tappedRoad) : null;

    // This terminal's own ride fare, kept non-negative with a safe default.
    const fareValue = (value: number, fallback: number) =>
      Number.isFinite(value) && value >= 0 ? value : fallback;
    const base_fare = fareValue(Number(form.base_fare), 20);
    const per_km = fareValue(Number(form.per_km), 10);

    const target: Terminal = editTerminal
      ? { ...editTerminal, name: form.name, boundary: form.boundary, center_lat: form.center_lat, center_lng: form.center_lng, is_active: form.is_active, boundary_polygon: boundaryPolygon, boundary_area: boundaryArea, road_width_m: roadWidthM, boundary_enabled: form.boundary_enabled, base_fare, per_km }
      : {
          id: `t_${Date.now()}`,
          name: form.name,
          boundary: form.boundary,
          center_lat: form.center_lat,
          center_lng: form.center_lng,
          radius_km: 2.0,
          is_active: form.is_active,
          rider_count: 0,
          boundary_polygon: boundaryPolygon,
          boundary_area: boundaryArea,
          road_width_m: roadWidthM,
          boundary_enabled: true,
          base_fare,
          per_km,
        };

    // Super Admin changes apply immediately.
    if (isSuperAdmin) {
      const { error } = await supabase.from("terminals").upsert(
        {
          id: target.id,
          name: target.name,
          boundary: target.boundary,
          center_lat: target.center_lat,
          center_lng: target.center_lng,
          radius_km: target.radius_km,
          is_active: target.is_active,
          rider_count: target.rider_count,
          boundary_polygon: target.boundary_polygon,
          boundary_area: target.boundary_area,
          road_width_m: target.road_width_m,
          // Carried through on edit so saving an unrelated field never silently
          // switches a deliberately disabled road back on.
          boundary_enabled: target.boundary_enabled,
          base_fare: target.base_fare,
          per_km: target.per_km,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      if (error) {
        // A missing column makes PostgREST reject the entire upsert, so a forgotten
        // migration looks like "my edits aren't saving" rather than a schema problem.
        // Name the migration instead of leaking the raw code.
        const quoted = error.message.match(/['"]([\w.]+)['"] column of/i);
        const missing = quoted
          ? quoted[1]
          : error.message.match(/column ([\w.]+) does not exist/i)?.[1];

        setToast({
          message: missing
            ? `Save failed — the database has no "${missing.split('.').pop()}" column. Run ${MIGRATION_HINT} in the Supabase SQL Editor.`
            : `Save failed: ${error.message}`,
          variant: 'error',
        });
        return;
      }

      logAudit({
        action: editTerminal ? 'update_terminal' : 'create_terminal',
        actorRole: 'admin',
        entityType: 'terminal',
        entityId: target.id,
        summary: `${editTerminal ? 'Updated' : 'Created'} terminal: ${target.name}`,
        details: {
          name: target.name,
          boundary: target.boundary,
          base_fare: target.base_fare,
          per_km: target.per_km,
          is_active: target.is_active,
        },
        actorEmail: user?.email,
        actorName: user?.name,
      });

      setTerminals(ts =>
        editTerminal ? ts.map(t => (t.id === editTerminal.id ? target : t)) : [...ts, target]
      );
      setShowForm(false);
      closeMapPicker();
      resetBoundaryHistory();
      setToast({ message: editTerminal ? 'Terminal updated' : 'Terminal created', variant: 'success' });
      return;
    }

    // Rider Admin: only their assigned terminal, and only as a request.
    if (!editTerminal || editTerminal.id !== assignedTerminalId) {
      setToast({ message: 'You can only edit the terminal assigned to you', variant: 'error' });
      return;
    }

    const result = await submitApprovalRequest({
      requestType: 'terminal_update',
      payload: target,
      requestedByEmail: user?.email,
      requestedByName: user?.name,
    });

    if (!result.success) {
      setToast({ message: `Request failed: ${result.error}`, variant: 'error' });
      return;
    }

    setShowForm(false);
    closeMapPicker();
    resetBoundaryHistory();
    await loadMyRequests();
    setToast({ message: 'Terminal change submitted for Super Admin approval', variant: 'warning' });
  }

  /**
   * Switch one terminal's boundary check on or off, leaving the road and the
   * enclosing area plotted.
   *
   * Applied straight to the row rather than through the form, so it takes effect
   * immediately without the admin having to reopen and re-save the terminal. Both
   * shapes stay on the map either way — this only decides whether drop-offs and
   * driver queues are checked against them.
   */
  async function toggleBoundaryEnabled(terminal: Terminal) {
    const next = !terminal.boundary_enabled;

    // Optimistic, with the old value kept so a failure can put it back.
    setTerminals(ts =>
      ts.map(t => (t.id === terminal.id ? { ...t, boundary_enabled: next } : t))
    );
    if (editTerminal?.id === terminal.id) {
      setEditTerminal({ ...editTerminal, boundary_enabled: next });
    }

    const { error } = await supabase
      .from('terminals')
      .update({ boundary_enabled: next })
      .eq('id', terminal.id);

    if (error) {
      setTerminals(ts =>
        ts.map(t => (t.id === terminal.id ? { ...t, boundary_enabled: !next } : t))
      );
      if (editTerminal?.id === terminal.id) {
        setEditTerminal({ ...editTerminal, boundary_enabled: !next });
      }
      setToast({ message: `Could not update the boundary: ${error.message}`, variant: 'error' });
      return;
    }

    logAudit({
      action: next ? 'enable_terminal_boundary' : 'disable_terminal_boundary',
      actorRole: 'admin',
      entityType: 'terminal',
      entityId: terminal.id,
      summary: `${next ? 'Enabled' : 'Disabled'} the road boundary check for: ${terminal.name}`,
      details: { boundary_enabled: next },
      actorEmail: user?.email,
      actorName: user?.name,
    });

    setToast({
      message: next
        ? `Boundary check enabled — drop-offs and driver queues are checked against ${terminal.name}`
        : `Boundary check disabled — ${terminal.name}'s boundary is kept but not enforced`,
      variant: next ? 'success' : 'warning',
    });
  }

  function confirmDeleteTerminal(id: string) {
    openModal({
      title: "Delete Terminal",
      message: "Delete this terminal? Assigned drivers will be unassigned.",
      variant: "danger",
      confirmLabel: "Delete",
      onConfirm: () => {
        closeModal();
        deleteTerminal(id);
      },
    });
  }

  async function deleteTerminal(id: string) {
    // Only the Super Admin may remove a terminal, and it applies immediately.
    if (!isSuperAdmin) return;
    const target = terminals.find(t => t.id === id);
    if (!target) return;

    try {
      // Release drivers and unscope any Rider Admin pointed at this terminal.
      await supabase.from("users").update({ terminal_id: null, terminal_name: null }).eq("terminal_id", id);
      await supabase.from("admins").update({ terminal_id: null, terminal_name: null }).eq("terminal_id", id);

      const { error } = await supabase.from("terminals").delete().eq("id", id);
      if (error) {
        setToast({ message: `Delete failed: ${error.message}`, variant: 'error' });
        return;
      }

      logAudit({
        action: 'delete_terminal',
        actorRole: 'admin',
        entityType: 'terminal',
        entityId: id,
        summary: `Deleted terminal: ${target.name}`,
        details: { name: target.name, boundary: target.boundary },
        actorEmail: user?.email,
        actorName: user?.name,
      });

      setTerminals(ts => ts.filter(t => t.id !== id));

      // Drop any queued driver changes for riders of this terminal
      setPendingChanges(prev => {
        const next = { ...prev };
        for (const u of users) {
          if (riderTerminalId(u) === id) delete next[u.id];
        }
        return next;
      });

      await loadRiderAdmins();
      setToast({ message: 'Terminal deleted', variant: 'success' });
    } catch (error) {
      console.error('[AdminTerminals] delete failed:', error);
      setToast({ message: 'Network error while deleting the terminal', variant: 'error' });
    }
  }

  // Queue a rider assignment change (not applied until Save Changes is clicked)
  function queueAssignRider(riderId: string, terminalId: string, terminalName: string) {
    openModal({
      title: "Assign Driver",
      message: `Assign this driver to ${terminalName}? This will be queued until you click Save Changes.`,
      variant: "success",
      confirmLabel: "Queue Assignment",
      onConfirm: () => {
        closeModal();
        setPendingChanges(prev => ({
          ...prev,
          [riderId]: { action: 'assign', terminalId, terminalName },
        }));
        setToast({ message: 'Assignment queued — click Save Changes to apply', variant: 'warning' });
      },
    });
  }

  // Queue a rider unassignment change
  function queueUnassignRider(riderId: string, terminalId: string, terminalName: string) {
    openModal({
      title: "Unassign Driver",
      message: `Remove this driver from ${terminalName}? This will be queued until you click Save Changes.`,
      variant: "warning",
      confirmLabel: "Queue Unassignment",
      onConfirm: () => {
        closeModal();
        setPendingChanges(prev => ({
          ...prev,
          [riderId]: { action: 'unassign', terminalId, terminalName },
        }));
        setToast({ message: 'Unassignment queued — click Save Changes to apply', variant: 'warning' });
      },
    });
  }

  function cancelPendingChange(riderId: string) {
    setPendingChanges(prev => {
      const next = { ...prev };
      delete next[riderId];
      return next;
    });
  }

  function savePendingChanges() {
    const count = Object.keys(pendingChanges).length;
    if (count === 0 || !isRiderAdmin) return;

    openModal({
      title: "Submit for Approval",
      message: `Submit ${count} driver assignment change${count > 1 ? 's' : ''} to the Super Admin? Nothing is applied until they approve it.`,
      variant: "success",
      confirmLabel: "Submit",
      onConfirm: async () => {
        closeModal();
        const changes = { ...pendingChanges };
        setPendingChanges({});

        let failures = 0;
        for (const [riderId, change] of Object.entries(changes)) {
          const rider = users.find(u => u.id === riderId);
          const previousTerminalId = rider ? riderTerminalId(rider) : undefined;

          const result = await submitApprovalRequest({
            requestType: change.action === 'assign' ? 'driver_assign' : 'driver_unassign',
            payload: {
              driver_id: riderId,
              driver_name: rider ? riderName(rider) : riderId,
              terminal_id: change.action === 'assign' ? change.terminalId : (previousTerminalId || change.terminalId),
              terminal_name: change.terminalName,
              previous_terminal_id: previousTerminalId,
            },
            requestedByEmail: user?.email,
            requestedByName: user?.name,
          });

          if (!result.success) {
            console.error('[AdminTerminals] approval submit failed:', result.error);
            failures++;
          }
        }

        await loadMyRequests();

        if (failures > 0) {
          setToast({ message: `${failures} request${failures > 1 ? 's' : ''} failed to submit`, variant: 'error' });
        } else {
          setToast({ message: `${count} change${count > 1 ? 's' : ''} submitted for Super Admin approval`, variant: 'warning' });
        }
      },
    });
  }

  return (
    <AdminShell
      title="Terminal Management"
      subtitle="Terminals, drivers, fares and coverage areas"
      /* The one way to reach the create form.
         `openCreate` was written and wired to nothing, so there was no way to add a
         terminal at all from this page -- the form existed, fully built, with no
         button that opened it.

         Super Admin only: a Rider Admin's terminal edits are staged and need Super
         Admin approval, so giving them the same button would create a second, faster
         route to the same outcome and bypass that review. */
      actions={
        isSuperAdmin ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add Terminal
          </button>
        ) : null
      }
    >

        {/* Content */}
        <div className="space-y-6">
          {/* Pending Changes Banner */}
          {isRiderAdmin && hasPendingChanges && (
            <div className="mb-4 p-4 bg-[var(--amber-soft)] border-2 border-[var(--amber-soft)] rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-[var(--amber-ink)] text-sm">
                    ⚠️ {Object.keys(pendingChanges).length} pending change{Object.keys(pendingChanges).length > 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-[var(--amber-ink)] mt-0.5">
                    Changes are not applied until you click "Save Changes"
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPendingChanges({})}
                    className="text-xs font-semibold text-[var(--amber-ink)] hover:text-[var(--amber-ink)] underline"
                  >
                    Discard All
                  </button>
                  <button
                    onClick={savePendingChanges}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[var(--success)] text-white text-xs font-bold rounded-lg hover:bg-[var(--success)] transition-all"
                  >
                    <Save size={12} /> Save Now
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Super Admin: assign each Rider Admin to a terminal */}
          {isSuperAdmin && (
            <div className="mb-6">
              <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--muted-foreground)] mb-2 flex items-center gap-2">
                <ShieldCheck size={16} /> Rider Admin Assignments
              </h2>
              <div className="bg-surface border border-line rounded-2xl p-4">
                {riderAdmins.length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)] italic">No Rider Admin accounts found</p>
                ) : (
                  <div className="space-y-3">
                    {riderAdmins.map(admin => (
                      <div key={admin.id} className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--ink)] truncate">
                            {admin.name || 'Rider Admin'}
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)] truncate">{admin.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <select
                              value={admin.terminal_id || ''}
                              disabled={savingAssignmentId === admin.id}
                              onChange={(e) => confirmAssignRiderAdmin(admin, e.target.value)}
                              className="appearance-none pl-3 pr-9 py-2 border border-line rounded-xl font-semibold text-sm bg-surface text-[var(--ink)] disabled:opacity-50"
                            >
                              <option value="">No terminal</option>
                              {terminals.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            <ChevronDown
                              className="pointer-events-none absolute right-3 top-1/2 w-4 h-4 -translate-y-1/2 text-[var(--muted-foreground)]"
                              aria-hidden="true"
                            />
                          </div>
                          {savingAssignmentId === admin.id && (
                            <Loader2 size={16} className="text-[var(--muted-foreground)] animate-spin" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rider Admin: scope notice */}
          {isRiderAdmin && (
            <div className={`mb-4 p-4 rounded-xl border-2 ${assignedTerminalId ? 'bg-[var(--info-soft)] border-[var(--info-soft)]' : 'bg-[var(--amber-soft)] border-[var(--amber-soft)]'}`}>
              <p className={`font-bold text-sm ${assignedTerminalId ? 'text-[var(--info)]' : 'text-[var(--amber-ink)]'}`}>
                {assignedTerminalId
                  ? `Assigned to ${assignedTerminalName || 'your terminal'}`
                  : 'No terminal assigned'}
              </p>
              <p className={`text-xs mt-0.5 ${assignedTerminalId ? 'text-[var(--info)]/80' : 'text-[var(--amber-ink)]'}`}>
                {assignedTerminalId
                  ? 'You can only edit this terminal and manage its drivers. Changes are sent to the Super Admin for approval.'
                  : 'Ask the Super Admin to assign you to a terminal before you can manage drivers.'}
              </p>
            </div>
          )}

          {/* A Rider Admin's submitted requests have their own screen now
              (Submitted Requests), which lists all of them with search and status
              filters rather than the eight most recent here. */}
          {isRiderAdmin && myRequests.some(req => req.status === 'pending') && (
            <div className="mb-6">
              <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--muted-foreground)] mb-2 flex items-center gap-2">
                <ClipboardCheck size={16} /> Awaiting Approval
              </h2>
              <div className="space-y-2">
                {myRequests.filter(req => req.status === 'pending').map(req => {
                  const p = req.payload || {};
                  const summary = req.request_type.startsWith('terminal')
                    ? `${p.name || p.id || 'Terminal'}`
                    : `${p.driver_name || 'Driver'} → ${p.terminal_name || p.terminal_id || ''}`;
                  return (
                    <div
                      key={req.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border-2 bg-[var(--amber-soft)] border-[var(--amber-soft)]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Clock size={15} className="text-[var(--amber-ink)] flex-shrink-0" />
                        <p className="text-sm font-semibold text-[var(--ink)] truncate">
                          {APPROVAL_REQUEST_LABELS[req.request_type]} — {summary}
                        </p>
                      </div>
                      <span className="text-xs font-bold flex-shrink-0 text-[var(--amber-ink)]">
                        Awaiting approval
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {loading ? (
            <StatSkeleton count={4} />
          ) : isRiderAdmin && visibleTerminals.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No terminal assigned to you yet"
              description="The Super Admin must assign you to a terminal before you can manage it."
              filipino="Wala pang terminal na nakatalaga sa iyo. Itinalaga ito ng Super Admin."
            />
          ) : (
          <div className="grid gap-4">
            {visibleTerminals.map(t => {
              const termRiders = getRidersForTerminal(t.id);
              const unassigned = getUnassignedRiders();
              const isExpanded = expandedId === t.id;
              return (
                <div key={t.id} className="bg-surface rounded-2xl border border-line overflow-hidden">
                  <div className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      {/* The whole summary is the tap target for revealing the
                          assigned drivers. It used to need a precise hit on the
                          small "Drivers" pill, which on a phone meant aiming.
                          This is a real <button> rather than a div with an
                          onClick so it is reachable by keyboard and announced
                          as expandable; the edit and delete controls sit
                          outside it, so neither can toggle the list by
                          accident. */}
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : t.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`terminal-drivers-${t.id}`}
                        className="flex items-start gap-3 min-w-0 flex-1 text-left rounded-xl -m-2 p-2 hover:bg-[var(--muted)] transition-colors active:scale-[0.99]"
                      >
                        <div className="w-11 h-11 bg-[var(--info-soft)] rounded-xl flex items-center justify-center flex-shrink-0">
                          <MapPin size={20} className="text-[var(--info)]" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-[var(--ink)] text-lg">🚏 {t.name}</h3>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${t.is_active ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}>
                              {t.is_active ? "● Active" : "○ Inactive"}
                            </span>
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                (t.boundary_polygon && t.boundary_polygon.length >= 2) ||
                                (t.boundary_area && t.boundary_area.length >= 3)
                                  ? t.boundary_enabled
                                    ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                                    : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                                  : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                              }`}
                            >
                              {(() => {
                                const hasRoad = !!t.boundary_polygon && t.boundary_polygon.length >= 2;
                                const hasArea = !!t.boundary_area && t.boundary_area.length >= 3;
                                if (!hasRoad && !hasArea) return "No boundary";
                                const shape = hasRoad && hasArea ? 'Road + area' : hasRoad ? 'Road' : 'Area';
                                return t.boundary_enabled
                                  ? `${shape}: ${normalizeRoadWidth(t.road_width_m)} m`
                                  : `${shape} not enforced`;
                              })()}
                            </span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--success-soft)] text-[var(--success)]">
                              {`Fare: ₱${t.base_fare ?? 20} + ₱${t.per_km ?? 10}/km`}
                            </span>
                          </div>
                          <p className="text-[var(--muted-foreground)] text-sm mt-0.5">📍 {t.boundary}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-[var(--muted-foreground)]">
                            <span className="flex items-center gap-1"><Users size={12} />{termRiders.length} drivers</span>
                            {/* Rotating chevron: the card now expands on tap, so
                                it needs to say so. Without it the whole card
                                just looks tappable and does nothing visible
                                until you notice. */}
                            <span className="flex items-center gap-1 ml-auto font-semibold text-[var(--info)]">
                              {isExpanded ? "Hide drivers" : "Show drivers"}
                              <ChevronDown
                                size={14}
                                aria-hidden="true"
                                className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              />
                            </span>
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : t.id)}
                          className="min-h-11 px-3 text-xs font-semibold text-[var(--info)] bg-[var(--info-soft)] rounded-lg hover:bg-[var(--info-soft)] transition-all"
                        >
                          {isExpanded ? "Hide" : "Drivers"}
                        </button>
                        {/* Boundary check on/off. Only meaningful once something is
                            plotted, so it stays hidden until then rather than offering a
                            toggle for a boundary that doesn't exist. */}
                        {(isSuperAdmin || (isRiderAdmin && t.id === assignedTerminalId)) &&
                          ((t.boundary_polygon && t.boundary_polygon.length >= 2) ||
                            (t.boundary_area && t.boundary_area.length >= 3)) && (
                            <button
                              onClick={() => toggleBoundaryEnabled(t)}
                              aria-pressed={t.boundary_enabled}
                              aria-label={`${t.boundary_enabled ? 'Disable' : 'Enable'} boundary check for ${t.name}`}
                              className={`h-11 px-3 rounded-xl border-2 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-90 ${
                                t.boundary_enabled
                                  ? "bg-[var(--success-soft)] border-[var(--success)] text-[var(--success)]"
                                  : "bg-[var(--muted)] border-line text-[var(--muted-foreground)]"
                              }`}
                            >
                              <Shield size={14} />
                              Boundary {t.boundary_enabled ? "On" : "Off"}
                            </button>
                          )}
                        {(isSuperAdmin || (isRiderAdmin && t.id === assignedTerminalId)) && (
                          <button
                            onClick={() => openEdit(t)}
                            aria-label={`Edit ${t.name}`}
                            className="w-11 h-11 bg-[var(--muted)] border border-line rounded-xl flex items-center justify-center hover:border-[var(--info)] transition-all active:scale-90"
                          >
                            <Edit2 size={14} className="text-[var(--muted-foreground)]" />
                          </button>
                        )}
                        {isSuperAdmin && (
                          <button
                            onClick={() => confirmDeleteTerminal(t.id)}
                            aria-label={`Delete ${t.name}`}
                            className="w-11 h-11 bg-[var(--error-soft)] border-2 border-[var(--error-soft)] rounded-xl flex items-center justify-center hover:border-[var(--error)] transition-all active:scale-90"
                          >
                            <Trash2 size={14} className="text-[var(--error)]" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div
                      id={`terminal-drivers-${t.id}`}
                      className="border-t-2 border-[var(--border)] p-5 bg-[var(--muted)]"
                    >
                      <h4 className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] mb-3">
                        Assigned Drivers ({termRiders.length})
                      </h4>
                      <div className="space-y-2 mb-4">
                        {termRiders.length === 0 && (
                          <p className="text-sm text-[var(--muted-foreground)] italic">No drivers assigned yet</p>
                        )}
                        {termRiders.map(r => {
                          const isPending = !!pendingChanges[r.id];
                          const pendingAction = pendingChanges[r.id];
                          return (
                            <div key={r.id} className={`flex items-center justify-between rounded-xl border-2 px-4 py-2.5 ${
                              isPending ? 'bg-[var(--amber-soft)] border-[var(--amber-soft)]' : 'bg-surface border-[var(--border)]'
                            }`}>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-[var(--info-soft)] rounded-lg flex items-center justify-center text-[var(--info)] font-bold text-xs">
                                  {riderName(r)[0]?.toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-[var(--ink)]">{riderName(r)}</p>
                                  <p className="text-xs text-[var(--muted-foreground)]">{riderPlate(r) || "No plate"}</p>
                                </div>
                                {isPending && pendingAction?.action === 'unassign' && (
                                  <span className="text-xs font-bold text-[var(--amber-ink)] bg-[var(--amber-soft)] px-2 py-0.5 rounded-full">
                                    ⏳ Pending removal
                                  </span>
                                )}
                              </div>
                              {isRiderAdmin && (isPending ? (
                                <button
                                  onClick={() => cancelPendingChange(r.id)}
                                  className="text-xs font-semibold text-[var(--amber-ink)] hover:text-[var(--amber-ink)] underline"
                                >
                                  Cancel
                                </button>
                              ) : (
                                <button
                                  onClick={() => queueUnassignRider(r.id, t.id, t.name)}
                                  className="flex items-center gap-1 text-xs font-semibold text-[var(--error)] bg-[var(--error-soft)] border border-[var(--error-soft)] px-2.5 py-1.5 rounded-lg hover:bg-[var(--error-soft)] transition-all active:scale-95"
                                >
                                  <UserMinus size={12} /> Unassign
                                </button>
                              ))}
                            </div>
                          );
                        })}
                      </div>

                      {isRiderAdmin && unassigned.length > 0 && (
                        <>
                          <h4 className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] mb-2">Assign Driver</h4>
                          <div className="flex flex-wrap gap-2">
                            {unassigned.map(r => {
                              const isPending = !!pendingChanges[r.id];
                              const pendingAction = pendingChanges[r.id];
                              return (
                                <div key={r.id} className="flex items-center gap-1">
                                  {isPending && pendingAction?.action === 'assign' ? (
                                    <>
                                      <button
                                        disabled
                                        className="flex items-center gap-2 px-3 py-2 bg-[var(--amber-soft)] border-2 border-[var(--amber-soft)] rounded-xl text-sm font-medium text-[var(--amber-ink)]"
                                      >
                                        <UserPlus size={13} className="text-[var(--amber)]" />
                                        {riderName(r)}
                                        <span className="text-xs text-[var(--amber)]">⏳ Queued</span>
                                      </button>
                                      <button
                                        onClick={() => cancelPendingChange(r.id)}
                                        className="text-xs font-semibold text-[var(--amber-ink)] hover:text-[var(--amber-ink)] underline"
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => queueAssignRider(r.id, t.id, t.name)}
                                      className="flex items-center gap-2 px-3 py-2 bg-surface border border-line hover:border-[var(--success)] rounded-xl transition-all active:scale-95 text-sm font-medium"
                                    >
                                      <UserPlus size={13} className="text-[var(--success)]" />
                                      {riderName(r)}
                                      {riderPlate(r) && <span className="text-xs text-[var(--muted-foreground)]">{riderPlate(r)}</span>}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </div>

      {/* Form modal
          Admin chrome (the nav drawer) is z-[1001], so every overlay on this page has to
          clear it — otherwise the sidebar paints over a "full-screen" modal and hides its
          close button. This matches the z-[2000] scale the other admin pages use. */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b-2 border-[var(--border)] sticky top-0 bg-surface z-10">
              <h3 className="font-extrabold text-lg text-[var(--ink)]">
                {editTerminal ? "Edit Terminal" : "New Terminal"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center"
              >
                <X size={16} className="text-[var(--muted-foreground)]" />
              </button>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              {([
                ["name", "Terminal Name", "e.g. Valenzuela Terminal"],
                ["boundary", "Boundary / Area", "e.g. Main Road, Valenzuela City"],
              ] as const).map(([k, label, placeholder]) => (
                <div key={k}>
                  <label className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] block mb-1">
                    {label}
                  </label>
                  <input
                    value={form[k]}
                    onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full h-11 px-4 border border-line focus:border-[var(--primary)] rounded-xl text-sm outline-none"
                  />
                </div>
              ))}

              {/* Terminal Location on Map */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] block mb-1">
                  Terminal Location
                </label>
                <div
                  className="w-full h-44 sm:h-52 bg-[var(--muted)] border border-line rounded-xl overflow-hidden cursor-pointer relative"
                  onClick={openMapPicker}
                >
                  {isMapsLoaded ? (
                    <GoogleMap
                      mapContainerStyle={{ width: '100%', height: '100%' }}
                      center={{ lat: form.center_lat, lng: form.center_lng }}
                      zoom={15}
                      options={{
                        zoomControl: false,
                        fullscreenControl: false,
                        streetViewControl: false,
                        mapTypeControl: false,
                        scrollwheel: false,
                        draggable: false,
                      }}
                    >
                      {form.boundary_area.length >= 3 && (
                        <Polygon
                          path={form.boundary_area}
                          options={{
                            fillColor: 'var(--primary)',
                            fillOpacity: 0.12,
                            strokeColor: 'var(--primary)',
                            strokeWeight: 2,
                            strokeOpacity: 0.6,
                            clickable: false,
                          }}
                        />
                      )}
                      {form.boundary_polygon.length >= 2 && (
                        <Polyline
                          path={form.boundary_polygon}
                          options={{
                            strokeColor: 'var(--primary)',
                            strokeWeight: 5,
                            strokeOpacity: 0.9,
                            clickable: false,
                            geodesic: true,
                          }}
                        />
                      )}
                      <MarkerF position={{ lat: form.center_lat, lng: form.center_lng }} />
                    </GoogleMap>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <p className="text-xs text-[var(--muted-foreground)]">Loading map...</p>
                    </div>
                  )}
                  {/* Hint only — pointer-events-none so it never swallows a tap meant for the map,
                      and it stays clear of the map edges once the text wraps on narrow screens. */}
                  <div className="absolute inset-0 flex items-center justify-center p-2.5 pointer-events-none">
                    <span className="max-w-full bg-white/90 px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold leading-snug text-center text-[var(--ink)] shadow">
                      📍 Tap to set the location, road & border
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[var(--muted-foreground)] mt-1.5 mb-3">
                  Lat: {form.center_lat.toFixed(4)}, Lng: {form.center_lng.toFixed(4)}
                </p>

                {/* The boundary controls belong together, so they carry their own
                    consistent rhythm instead of one-off margins that drift apart
                    as the section grows. */}
                <div className="space-y-2">
                {/* Road status */}
                <div className="flex items-start justify-between gap-2 p-3 bg-[var(--muted)] rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--ink)]">Road Boundary</p>
                    <p className="text-xs leading-snug text-[var(--muted-foreground)] break-words">
                      {form.boundary_polygon.length >= 2
                        ? `${form.boundary_polygon.length} points along the road — accepts drop-offs within ${Math.round(normalizeRoadWidth(form.road_width_m) / 2)} m of it`
                        : form.boundary_polygon.length > 0
                          ? `${form.boundary_polygon.length} point${form.boundary_polygon.length === 1 ? '' : 's'} — add at least 2`
                          : 'Not set — tap the map to plot the road'}
                    </p>
                  </div>
                  {form.boundary_polygon.length > 0 && (
                    <button
                      onClick={confirmClearBoundary}
                      className="flex-shrink-0 self-center min-h-11 px-3 -mr-1.5 rounded-lg text-xs font-bold text-[var(--primary)] hover:bg-[var(--primary-soft)] transition-colors active:scale-95"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* The enclosing area the road runs through. */}
                <div className="flex items-start justify-between gap-2 p-3 bg-[var(--muted)] rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--ink)]">Border Area</p>
                    <p className="text-xs leading-snug text-[var(--muted-foreground)] break-words">
                      {form.boundary_area.length >= 3
                        ? `${form.boundary_area.length} points enclosing the road — drivers and drop-offs outside every terminal's border are rejected`
                        : form.boundary_area.length > 0
                          ? `${form.boundary_area.length} point${form.boundary_area.length === 1 ? '' : 's'} — add at least ${3 - form.boundary_area.length} more`
                          : 'Not set — tap the map to plot the border area'}
                    </p>
                  </div>
                  {form.boundary_area.length > 0 && (
                    <button
                      onClick={confirmClearBoundary}
                      className="flex-shrink-0 self-center min-h-11 px-3 -mr-1.5 rounded-lg text-xs font-bold text-[var(--primary)] hover:bg-[var(--primary-soft)] transition-colors active:scale-95"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Enforce the boundary or keep it without using it. Neither shape is
                    lost either way, so this can be flipped back at any time. */}
                {(form.boundary_polygon.length >= 2 || form.boundary_area.length >= 3) && (
                  <div className="flex items-center justify-between gap-3 p-3 bg-[var(--muted)] rounded-xl">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--ink)]">Enforce Boundary</p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {form.boundary_enabled
                          ? 'Drop-offs and driver queues are checked against this boundary'
                          : 'Kept as drawn, but not checked against'}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={form.boundary_enabled}
                      aria-label="Enforce boundary"
                      onClick={() =>
                        setForm(f => ({ ...f, boundary_enabled: !f.boundary_enabled }))
                      }
                      className={`relative w-12 h-7 rounded-full flex-shrink-0 transition-colors ${
                        form.boundary_enabled ? "bg-[var(--success)]" : "bg-[var(--border)]"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-6 h-6 bg-surface rounded-full shadow transition-transform ${
                          form.boundary_enabled ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                  </div>
                )}

                {/* How far off the road a drop-off may be and still be accepted. */}
                <div className="p-3 bg-[var(--muted)] rounded-xl">
                  <label className="text-xs font-semibold text-[var(--ink)] block mb-1.5">
                    Road corridor width
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={20}
                      max={2000}
                      step={10}
                      inputMode="numeric"
                      value={form.road_width_m}
                      onChange={e =>
                        setForm(f => ({
                          ...f,
                          road_width_m: e.target.value === '' ? DEFAULT_ROAD_WIDTH_M : Number(e.target.value),
                        }))
                      }
                      className="w-24 h-10 px-3 border border-line focus:border-[var(--primary)] rounded-xl text-sm outline-none flex-shrink-0"
                    />
                    <span className="text-xs leading-snug text-[var(--muted-foreground)]">
                      Accepts drop-offs within {Math.round(normalizeRoadWidth(form.road_width_m) / 2)} m of the road
                    </span>
                  </div>
                </div>
                </div>
              </div>

              {/* Active/Inactive Toggle */}
              <div className="flex items-center justify-between p-3 bg-[var(--muted)] rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">Active Terminal</p>
                  <p className="text-xs text-[var(--muted-foreground)]">Visible to customers for pickup</p>
                </div>
                <button
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`relative w-12 h-7 rounded-full transition-colors ${form.is_active ? 'bg-[var(--success)]' : 'bg-[var(--border)]'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-surface rounded-full shadow transition-transform ${form.is_active ? 'translate-x-5' : ''}`} />
                </button>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 h-11 border border-line text-[var(--muted-foreground)] font-bold text-sm rounded-xl active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSaveTerminal}
                  className="flex-1 h-11 bg-[var(--primary)] text-white font-bold text-sm rounded-xl active:scale-95 hover:bg-[var(--primary)] transition-all"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen Map Picker — opens on top of the still-open form modal beneath it */}
      {showMapPicker && (
        <div className="fixed inset-0 z-[2010] bg-surface flex flex-col">
          {/* Stacks on narrow screens so the search bar keeps a usable width. */}
          <div className="bg-surface border-b border-[var(--border)] px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            {/* Search Bar */}
            <div className="flex-1 relative min-w-0">
              <div className="flex items-center gap-2 px-3 py-2 bg-[var(--muted)] border border-line rounded-xl">
                <Search className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" />
                <input
                  type="text"
                  value={mapSearchQuery}
                  onChange={(e) => {
                    setMapSearchQuery(e.target.value);
                    if (e.target.value.length > 0) setShowMapSearchDropdown(true);
                    else setShowMapSearchDropdown(false);
                  }}
                  onFocus={() => { if (mapSearchQuery.trim()) setShowMapSearchDropdown(true); }}
                  placeholder="Search location..."
                  className="flex-1 text-sm font-semibold text-[var(--ink)] placeholder:text-[var(--muted-foreground)] placeholder:font-normal outline-none bg-transparent"
                />
                {isMapSearching ? (
                  <Loader2 className="w-4 h-4 text-[var(--muted-foreground)] animate-spin flex-shrink-0" />
                ) : (
                  mapSearchQuery && (
                    <button onClick={() => { setMapSearchQuery(""); setMapSearchResults([]); setShowMapSearchDropdown(false); }} className="flex-shrink-0">
                      <X className="w-4 h-4 text-[var(--muted-foreground)]" />
                    </button>
                  )
                )}
              </div>
              {/* Search Results Dropdown */}
              {showMapSearchDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-line rounded-xl shadow-xl max-h-60 overflow-y-auto z-[2020]">
                  {mapSearchResults.length > 0 ? (
                    mapSearchResults.map((result: any, index: number) => (
                      <button
                        key={result.place_id || index}
                        onClick={() => handleMapSearchPick(result)}
                        className="w-full p-3 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)] active:bg-[var(--muted)] transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-[var(--muted)] rounded-full flex items-center justify-center flex-shrink-0">
                            <MapPin className="w-4 h-4 text-[var(--muted-foreground)]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-[var(--ink)] truncate">{result.displayName}</p>
                            {result.secondaryText && (
                              <p className="text-xs text-[var(--muted-foreground)] truncate">{result.secondaryText}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-3">
                      <p className="text-sm text-[var(--muted-foreground)] text-center">
                        {isMapSearching ? "Searching..." : !GOOGLE_MAPS_API_KEY ? "Search unavailable" : "No results found"}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 sm:flex-none">
              <button
                type="button"
                onClick={saveChangesFromPicker}
                className="flex-1 sm:flex-none h-10 px-4 bg-[var(--primary)] text-white text-sm font-bold rounded-xl active:scale-95 whitespace-nowrap"
              >
                Save Changes
              </button>
              {/* Close sits last, top-right, and warns before discarding unsaved work. */}
              <button
                type="button"
                onClick={requestCloseMapPicker}
                aria-label="Close map picker"
                className="h-10 w-10 flex items-center justify-center rounded-xl bg-[var(--muted)] active:scale-90 flex-shrink-0"
              >
                <X className="w-6 h-6 text-[var(--ink)]" />
              </button>
            </div>
          </div>

          {/* Move the pin, draw the road, or enclose it in an area */}
          <div className="flex gap-2 px-4 py-2 bg-surface border-b border-[var(--border)]">
            {([
              ['location', 'Location'],
              ['boundary', 'Road'],
              ['area', 'Border Area'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setMapPickerMode(mode)}
                className={`flex-1 h-9 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
                  mapPickerMode === mode ? 'bg-[var(--primary)] text-white' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 relative">
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={adminLocation ?? { lat: form.center_lat, lng: form.center_lng }}
              zoom={15}
              onClick={handleFormMapClick}
              onLoad={handleFormMapLoad}
              options={{
                zoomControl: true,
                fullscreenControl: false,
                streetViewControl: false,
                mapTypeControl: false,
              }}
            >
              <MarkerF position={{ lat: form.center_lat, lng: form.center_lng }} />
              {/* The enclosing area, drawn under the road it contains. */}
              {form.boundary_area.length >= 3 && (
                <Polygon
                  path={form.boundary_area}
                  options={{
                    fillColor: 'var(--primary)',
                    fillOpacity: 0.12,
                    strokeColor: 'var(--primary)',
                    strokeWeight: 2,
                    strokeOpacity: 0.6,
                    clickable: false,
                  }}
                />
              )}
              {/* Plotted road. A thick translucent casing under a solid line reads as a
                  corridor, which is what the drop-off check actually allows. */}
              {form.boundary_polygon.length >= 2 && (
                <Polyline
                  path={form.boundary_polygon}
                  options={{
                    strokeColor: 'var(--primary)',
                    strokeWeight: 5,
                    strokeOpacity: 0.9,
                    clickable: false,
                    geodesic: true,
                  }}
                />
              )}
              {mapPickerMode === 'boundary' &&
                form.boundary_polygon.map((point, index) => (
                  <MarkerF
                    key={`${point.lat}_${point.lng}_${index}`}
                    position={point}
                    label={`${index + 1}`}
                  />
                ))}
              {mapPickerMode === 'area' &&
                form.boundary_area.map((point, index) => (
                  <MarkerF
                    key={`${point.lat}_${point.lng}_${index}`}
                    position={point}
                    label={`${index + 1}`}
                  />
                ))}
            </GoogleMap>
            <div className="absolute bottom-4 left-4 right-4">
              <div className="bg-white/95 backdrop-blur rounded-xl shadow-lg p-3">
                {mapPickerMode === 'boundary' ? (
                  <>
                    <p className="text-sm font-semibold text-[#122724] text-center">
                      Tap along the road to plot it
                    </p>
                    <p className="text-xs text-[#5c6b68] text-center mt-0.5">
                      {isSnappingRoad
                        ? 'Snapping to the nearest road...'
                        : form.boundary_polygon.length < 2
                          ? `Add at least 2 points — ${Math.round(normalizeRoadWidth(form.road_width_m) / 2)} m either side of the road is accepted`
                          : `${form.boundary_polygon.length} points — accepts drop-offs within ${Math.round(normalizeRoadWidth(form.road_width_m) / 2)} m of the road`}
                    </p>
                    {roadSnapUnavailable && (
                      <p className="text-[11px] text-center mt-1 text-[var(--amber-dark)]">
                        Snapping to roads is unavailable, so points are placed exactly where
                        you tap. Allow the Roads API on the Maps key (Credentials → your key
                        → API restrictions) for lines that follow the road network.
                      </p>
                    )}
                    {/* Undo/Redo stay visible whenever there's anything to step through — including
                        after every point has been undone, where the road is empty but
                        Redo still has work to do. Clear Road only applies to a plotted road. */}
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <button
                        type="button"
                        onClick={undoBoundary}
                        disabled={boundaryPast.length === 0}
                        className="h-9 border border-line text-[#5c6b68] text-xs font-bold rounded-lg active:scale-95 disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed"
                      >
                        Undo Point
                      </button>
                      <button
                        type="button"
                        onClick={redoBoundary}
                        disabled={boundaryFuture.length === 0}
                        className="h-9 border border-line text-[#5c6b68] text-xs font-bold rounded-lg active:scale-95 disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed"
                      >
                        Redo Point
                      </button>
                    </div>
                    {form.boundary_polygon.length > 0 && (
                      <button
                        type="button"
                        onClick={confirmClearBoundary}
                        className="w-full h-9 mt-2 border-2 border-[#bc4b1f] text-[#bc4b1f] text-xs font-bold rounded-lg active:scale-95"
                      >
                        Clear Road
                      </button>
                    )}
                  </>
                ) : mapPickerMode === 'area' ? (
                  <>
                    <p className="text-sm font-semibold text-[#122724] text-center">
                      Tap the corners of the border area
                    </p>
                    <p className="text-xs text-[#5c6b68] text-center mt-0.5">
                      {form.boundary_area.length < 3
                        ? `Add at least 3 points — ${form.boundary_area.length} so far`
                        : `${form.boundary_area.length} points — area closed`}
                    </p>
                    <p className="text-[11px] text-center mt-1 text-[#5c6b68]">
                      Draw this around the road. Drivers and drop-offs outside every
                      terminal's border are rejected.
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <button
                        type="button"
                        onClick={undoBoundary}
                        disabled={boundaryPast.length === 0}
                        className="h-9 border border-line text-[#5c6b68] text-xs font-bold rounded-lg active:scale-95 disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed"
                      >
                        Undo Point
                      </button>
                      <button
                        type="button"
                        onClick={redoBoundary}
                        disabled={boundaryFuture.length === 0}
                        className="h-9 border border-line text-[#5c6b68] text-xs font-bold rounded-lg active:scale-95 disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed"
                      >
                        Redo Point
                      </button>
                    </div>
                    {form.boundary_area.length > 0 && (
                      <button
                        type="button"
                        onClick={confirmClearBoundary}
                        className="w-full h-9 mt-2 border-2 border-[#bc4b1f] text-[#bc4b1f] text-xs font-bold rounded-lg active:scale-95"
                      >
                        Clear Border Area
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-[#122724] text-center">
                      Tap anywhere to set terminal location
                    </p>
                    <p className="text-xs text-[#5c6b68] text-center mt-0.5">
                      Current: {form.center_lat.toFixed(4)}, {form.center_lng.toFixed(4)}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal
          The component's own default of z-[400] would sit under this page's z-[2000] form
          modal, so every dialog raised here names a z-index above it. */}
      <ConfirmationModal
        isOpen={modalOpen}
        onCancel={closeModal}
        onConfirm={modalConfig?.onConfirm || (() => {})}
        title={modalConfig?.title || ''}
        message={modalConfig?.message || ''}
        variant={modalConfig?.variant || 'danger'}
        confirmLabel={modalConfig?.confirmLabel || 'Confirm'}
        zIndexClassName={modalConfig?.zIndexClassName ?? 'z-[2030]'}
      />

      {/* Toast */}
      <Toast
        message={toast?.message || ''}
        variant={toast?.variant || 'success'}
        onClose={() => setToast(null)}
      />
    </AdminShell>
  );
}
