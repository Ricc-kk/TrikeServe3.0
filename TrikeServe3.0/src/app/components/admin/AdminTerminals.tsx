import { useState, useEffect, useRef, useCallback, Fragment as ReactFragment, type ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  Plus, Edit2, Trash2, UserPlus, UserMinus, MapPin, Users, Menu, X, Navigation, Search, Loader2, Save, Shield,
  ClipboardCheck, Clock, ShieldCheck, ChevronDown, ArrowLeft,
  ChevronLeft, ChevronRight, Pentagon, Milestone, SlidersHorizontal, Banknote,
  Settings, Eye, EyeOff, Car, Truck
} from "lucide-react";
import { GoogleMap, Marker, InfoWindow, Polygon, Polyline } from "@react-google-maps/api";
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
import TerminalIcon, {
  terminalMarkerIcon,
  numberedPinIcon,
  shapePinIcon,
  normalizeTerminalColor,
  normalizeRouteColor,
  normalizeBorderColor,
  DEFAULT_TERMINAL_COLOR,
  DEFAULT_ROUTE_COLOR,
  DEFAULT_BORDER_COLOR,
} from "../ui/TerminalIcon";
import ColorPicker from "../ui/ColorPicker";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// Default centre for a new terminal's location / boundary picker — Gen T Deleon,
// Valenzuela City (same point the customer/business map selectors default to).
const DEFAULT_TERMINAL_CENTER = { lat: 14.7244, lng: 120.9668 };

// Bounds the road corridor input accepts. Mirrored by the validator so a value
// typed, pasted or nudged into the field can't slip past the checks.
const MIN_ROAD_WIDTH_M = 20;
const MAX_ROAD_WIDTH_M = 2000;

// Named in save errors, because a missing column fails the whole upsert and would
// otherwise look like the admin's edits simply weren't sticking.
const MIGRATION_HINT = 'ADD_TERMINAL_ROAD_BOUNDARY.sql / ADD_TERMINAL_BORDER_AREA.sql / ADD_TERMINAL_MARKER_COLOR.sql / ADD_TERMINAL_SHAPE_COLORS.sql / ADD_TERMINAL_PRIVATE_RIDE_FEE.sql / ADD_TERMINAL_DELIVERY_AND_CAPACITY.sql';

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
  // Hex colour for this terminal's icon on the Terminal Location map
  // (ADD_TERMINAL_MARKER_COLOR.sql). Per terminal, so neighbouring TODAs can be
  // told apart. Presentation only — no boundary check reads it.
  marker_color: string;
  // Hex colours for the two plotted shapes (ADD_TERMINAL_SHAPE_COLORS.sql).
  // Separate from each other so a road can read differently from the area around
  // it, and from marker_color so the icon stays distinct from its own boundary.
  route_color: string;
  border_color: string;
  // Private ride and delivery pricing. These arrived in two separate migrations,
  // so they are optional here: a terminal row created before either has no value
  // at all. null means "not set on this terminal", which the resolver reads as
  // "charge the share ride rate" / "use the platform default" -- never as zero.
  private_ride_fee?: number | null;
  private_ride_fee_per_km?: number | null;
  delivery_fee?: number | null;
  delivery_fee_per_km?: number | null;
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
  const navigate = useNavigate();
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
    // This terminal's icon colour. Always a valid hex: the form holds what the
    // admin last chose, and only valid values are ever written.
    marker_color: DEFAULT_TERMINAL_COLOR,
    // Colours for the two plotted shapes.
    route_color: DEFAULT_ROUTE_COLOR,
    border_color: DEFAULT_BORDER_COLOR,
    // Private ride and delivery. null is the empty box -- "fall back to the share
    // ride rate / the platform default" -- which is why these are nullable rather
    // than 0: writing 0 would quietly start charging nothing for the whole vehicle
    // or the delivery.
    private_ride_fee: null as number | null,
    private_ride_fee_per_km: null as number | null,
    delivery_fee: null as number | null,
    delivery_fee_per_km: null as number | null,
  });
  const [showMapPicker, setShowMapPicker] = useState(false);
  /*
   * Which part of the terminal the editor is on, as one value rather than a
   * "page" plus a "map mode" — they were the same choice split in two, and the
   * two could disagree. 'configuration' is the only section with no map.
   */
  const [editorSection, setEditorSection] = useState<
    'terminal' | 'border' | 'route' | 'configuration' | 'fares'
  >('terminal');
  /**
   * Which sections are the map, and therefore the only ones that plot points.
   *
   * Read in three places -- the top bar (search only makes sense over a map),
   * the map itself, and the sections that replace it -- so it is derived once
   * here rather than re-tested as a three-way comparison at each.
   */
  const editorSectionIsMap =
    editorSection === 'terminal' || editorSection === 'border' || editorSection === 'route';
  // Collapses the editor's sidebar to icons alone, handing the width back to the
  // map without losing the way out of a section.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  /**
   * How the map should treat a tap, derived from the selected section.
   *
   * Configuration has no map, so it falls back to moving the pin: harmless, and
   * it keeps this a total function rather than something every caller has to
   * guard.
   */
  const mapPickerMode: 'location' | 'road' | 'area' =
    editorSection === 'route' ? 'road' :
    editorSection === 'border' ? 'area' :
    'location';
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
   * What the terminal looked like when the editor opened, across every field it
   * can change. The floating Save button keys off this, and so does the warning
   * before closing — a plotted road is the obvious thing to lose, but a typed
   * name or a changed colour is just as easy to walk away from.
   */
  const [editorSnapshot, setEditorSnapshot] = useState<EditorSnapshot | null>(null);
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

  /** The fields the editor tracks as "changed since it opened". */
  type EditorSnapshot = {
    center_lat: number;
    center_lng: number;
    polygon: LatLngPoint[];
    area: LatLngPoint[];
    name: string;
    boundary: string;
    road_width_m: number;
    is_active: boolean;
    marker_color: string;
    route_color: string;
    border_color: string;
    base_fare: number;
    per_km: number;
    private_ride_fee: number | null;
    private_ride_fee_per_km: number | null;
    delivery_fee: number | null;
    delivery_fee_per_km: number | null;
  };

  /**
   * Everything the editor tracks as "changed since it opened".
   *
   * Read from the form object the editor is about to be given, not from the form
   * state as it currently stands: `openEdit` seeds that state and opens the
   * editor in the same tick, so snapshotting the live `form` would capture the
   * *previous* terminal and leave the editor looking dirty the moment it opens.
   */
  function snapshotFrom(f: typeof form): EditorSnapshot {
    return {
      center_lat: f.center_lat,
      center_lng: f.center_lng,
      polygon: [...f.boundary_polygon],
      area: [...f.boundary_area],
      name: f.name,
      boundary: f.boundary,
      road_width_m: f.road_width_m,
      is_active: f.is_active,
      marker_color: normalizeTerminalColor(f.marker_color),
      route_color: normalizeRouteColor(f.route_color),
      border_color: normalizeBorderColor(f.border_color),
      base_fare: f.base_fare,
      per_km: f.per_km,
      private_ride_fee: f.private_ride_fee,
      private_ride_fee_per_km: f.private_ride_fee_per_km,
      delivery_fee: f.delivery_fee,
      delivery_fee_per_km: f.delivery_fee_per_km,
    };
  }

  /** Seeds the form and opens the editor on it, with a snapshot taken at the same value. */
  function openEditorWith(next: typeof form) {
    setForm(next);
    setEditorSnapshot(snapshotFrom(next));
    setEditorSection('terminal');
    setShowMapPicker(true);
    refreshAdminLocation();
  }

  const samePoints = (a: LatLngPoint[], b: LatLngPoint[]) =>
    a.length === b.length && a.every((p, i) => p.lat === b[i].lat && p.lng === b[i].lng);

  /** True when anything in the editor differs from how it was when it opened. */
  const hasUnsavedEditorChanges =
    !!editorSnapshot &&
    (form.center_lat !== editorSnapshot.center_lat ||
      form.center_lng !== editorSnapshot.center_lng ||
      !samePoints(form.boundary_polygon, editorSnapshot.polygon) ||
      !samePoints(form.boundary_area, editorSnapshot.area) ||
      form.name !== editorSnapshot.name ||
      form.boundary !== editorSnapshot.boundary ||
      form.road_width_m !== editorSnapshot.road_width_m ||
      form.is_active !== editorSnapshot.is_active ||
      normalizeTerminalColor(form.marker_color) !== editorSnapshot.marker_color ||
      normalizeRouteColor(form.route_color) !== editorSnapshot.route_color ||
      normalizeBorderColor(form.border_color) !== editorSnapshot.border_color ||
      Number(form.base_fare) !== editorSnapshot.base_fare ||
      Number(form.per_km) !== editorSnapshot.per_km ||
      form.private_ride_fee !== editorSnapshot.private_ride_fee ||
      form.private_ride_fee_per_km !== editorSnapshot.private_ride_fee_per_km ||
      form.delivery_fee !== editorSnapshot.delivery_fee ||
      form.delivery_fee_per_km !== editorSnapshot.delivery_fee_per_km);

  /** Closes the editor outright. Going through requestCloseMapPicker is the user-facing path. */
  function closeMapPicker() {
    setShowMapPicker(false);
    setShowMapSearchDropdown(false);
    setMapSearchQuery("");
    setEditorSnapshot(null);
    setEditorSection('terminal');
  }

  // Closing without saving is the easy way to lose a plotted boundary, so ask
  // first — but only when there is genuinely something to lose.
  function requestCloseMapPicker() {
    if (!hasUnsavedEditorChanges) {
      closeMapPicker();
      return;
    }

    const plotted = form.boundary_polygon.length + form.boundary_area.length;
    openModal({
      title: 'Discard Changes?',
      message:
        plotted > 0
          ? `You have ${plotted} plotted point${plotted === 1 ? '' : 's'} and other unsaved changes to this terminal. Closing now discards them.`
          : 'You have unsaved changes to this terminal. Closing now discards them.',
      variant: 'warning',
      confirmLabel: 'Discard Changes',
      zIndexClassName: 'z-[2030]',
      onConfirm: () => {
        closeModal();
        closeMapPicker();
      },
    });
  }

  // Saving from the editor runs the same checks as the boundary confirm — the
  // editor can be opened before the terminal has a name or a valid shape.
  function saveChangesFromPicker() {
    const { errors, firstField } = validateEditor();

    if (firstField) {
      setToast({ message: errors[firstField]!, variant: 'error' });
      // Send them to the section that owns the offending field, so the fix is one
      // tap away instead of a hunt through the editor.
      if (firstField === 'road') setEditorSection('route');
      else if (firstField === 'area') setEditorSection('border');
      else if (firstField === 'location') setEditorSection('terminal');
      else if (
        firstField === 'base_fare' || firstField === 'per_km' ||
        firstField === 'private_ride_fee' || firstField === 'private_ride_fee_per_km' ||
        firstField === 'delivery_fee' || firstField === 'delivery_fee_per_km'
      ) setEditorSection('fares');
      else setEditorSection('configuration');
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

  // Super Admin's two views of this page; a Rider Admin stays on the assignment view.
  const [terminalView, setTerminalView] = useState<'assignment' | 'map'>('assignment');
  // The Terminal Location map, so the legend beside it can pan to one terminal.
  const overviewMapRef = useRef<google.maps.Map | null>(null);

  /**
   * Terminals whose route, marker and border the Super Admin has switched off.
   *
   * Per-session and not a saved setting, on purpose. Hiding is a way to read one
   * TODA without a neighbour's four-kilometre border drawn straight through the
   * middle of it -- a temporary act of looking, not a decision about the terminal.
   * Persisting it would mean opening the page to find a terminal silently missing.
   */
  const [hiddenTerminalIds, setHiddenTerminalIds] = useState<string[]>([]);
  const toggleTerminalHidden = useCallback((id: string) => {
    setHiddenTerminalIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));
  }, []);

  /**
   * Which optional fare columns this database actually has.
   *
   * Two flags, not one: the private ride columns and the delivery/capacity
   * columns came from separate migrations and a project is routinely between
   * them. PostgREST rejects the *whole* upsert over one absent column, so sending
   * them blind would turn a partially-migrated database into a terminal editor
   * that cannot save anything at all.
   */
  const [fareColumns, setFareColumns] = useState({ delivery: true, privateRide: true });

  // Load from Supabase when available; fall back to localStorage data otherwise.
  useEffect(() => {
    loadData();
    loadMyRequests();
    loadMyAssignment();
    loadRiderAdmins();
    probeFareColumns();
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
      closeMapPicker();
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
        // Rows from before ADD_TERMINAL_MARKER_COLOR.sql have no value; resolving
        // here means every consumer below can treat it as a usable colour.
        marker_color: normalizeTerminalColor(t.marker_color),
        route_color: normalizeRouteColor(t.route_color),
        border_color: normalizeBorderColor(t.border_color),
        // `select *` returns whatever exists; the columns that did not arrive are
        // simply absent, and `?? null` turns both "no column" and "NULL" into the
        // same empty box rather than showing a 0 the admin would have to undo.
        private_ride_fee: t.private_ride_fee ?? null,
        private_ride_fee_per_km: t.private_ride_fee_per_km ?? null,
        delivery_fee: t.delivery_fee ?? null,
        delivery_fee_per_km: t.delivery_fee_per_km ?? null,
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

  /**
   * Find out which optional fare columns exist, by asking for them.
   *
   * Stepping down a query at a time is the only way to tell "this database never
   * ran the private ride migration" from "the query failed for some other
   * reason": a select naming one missing column fails outright, and the error
   * names the column. Starts optimistic -- the flags only ever turn columns *off*,
   * so a database that answers nothing at all (offline, or no table yet) still
   * behaves as it did before this existed rather than silently dropping fares
   * from every save.
   */
  async function probeFareColumns() {
    const attempts = [
      {
        columns: 'id, delivery_fee, delivery_fee_per_km, private_ride_fee, private_ride_fee_per_km',
        delivery: true,
        privateRide: true,
      },
      { columns: 'id, delivery_fee, delivery_fee_per_km', delivery: true, privateRide: false },
      { columns: 'id, delivery_fee, delivery_fee_per_km, private_ride_fee, private_ride_fee_per_km', delivery: false, privateRide: true },
      { columns: 'id', delivery: false, privateRide: false },
    ];

    for (const attempt of attempts) {
      const { error } = await supabase.from('terminals').select(attempt.columns).limit(1);
      if (!error) {
        setFareColumns({ delivery: attempt.delivery, privateRide: attempt.privateRide });
        return;
      }
    }
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
      // `adminId`, not `admin`: this function never had an `admin` in scope, so
      // naming one threw a ReferenceError *after* the row was already written --
      // which meant the write stuck, the list never refreshed and no toast ever
      // appeared, so the select looked like it had silently refused to change.
      summary: terminal
        ? `Assigned ${adminId} to ${terminal.name}`
        : `Unassigned ${adminId}`,
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

  /** Pan the Terminal Location map to one terminal, from the legend. */
  function focusTerminal(t: Terminal) {
    overviewMapRef.current?.panTo({ lat: t.center_lat, lng: t.center_lng });
  }

  /**
   * Frame every terminal on the Terminal Location map.
   *
   * A fixed centre only ever showed whichever terminal happened to sit under it;
   * the point of this view is that all of them, and their borders, are visible at
   * once. Falls back to the Gen T Deleon default when there is nothing to fit.
   */
  function fitTerminalsOnMap(map: google.maps.Map) {
    const points = visibleTerminals.map(t => ({ lat: t.center_lat, lng: t.center_lng }));
    if (points.length === 0) {
      map.setCenter({ lat: 14.6867, lng: 120.9950 });
      map.setZoom(13);
      return;
    }
    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(14);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    points.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, 80);
  }

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

  /*
   * Frame the terminals once they have actually loaded.
   *
   * The map's onLoad fires well before the terminal query resolves, so fitting
   * there alone framed an empty list and left every marker off-screen. Keyed on
   * the terminal count and the visible tab rather than the whole list, so editing
   * a terminal's name doesn't yank the map out from under the admin.
   */
  useEffect(() => {
    if (!isSuperAdmin || terminalView !== 'map') return;
    const map = overviewMapRef.current;
    if (!map || visibleTerminals.length === 0) return;
    fitTerminalsOnMap(map);
  }, [terminalView, visibleTerminals.length]);


  function openCreate() {
    setEditTerminal(null);
    setEditorSection('terminal');
    resetBoundaryHistory();
    openEditorWith({
      name: "", boundary: "",
      center_lat: DEFAULT_TERMINAL_CENTER.lat, center_lng: DEFAULT_TERMINAL_CENTER.lng,
      is_active: true,
      boundary_polygon: [], boundary_area: [],
      road_width_m: DEFAULT_ROAD_WIDTH_M, boundary_enabled: true,
      base_fare: 20, per_km: 10,
      marker_color: DEFAULT_TERMINAL_COLOR,
      route_color: DEFAULT_ROUTE_COLOR,
      border_color: DEFAULT_BORDER_COLOR,
      // Left unset on purpose: a new terminal inherits the share ride rate for a
      // private ride and the platform default for delivery until an admin says
      // otherwise.
      private_ride_fee: null,
      private_ride_fee_per_km: null,
      delivery_fee: null,
      delivery_fee_per_km: null,
    });
  }

  function openEdit(t: Terminal) {
    setEditTerminal(t);
    setEditorSection('terminal');
    resetBoundaryHistory();
    openEditorWith({
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
      marker_color: normalizeTerminalColor(t.marker_color),
      route_color: normalizeRouteColor(t.route_color),
      border_color: normalizeBorderColor(t.border_color),
      // A column that does not exist and a column that is NULL both come back as
      // nothing to show; either way the box stays empty, which means "fall back".
      private_ride_fee: t.private_ride_fee ?? null,
      private_ride_fee_per_km: t.private_ride_fee_per_km ?? null,
      delivery_fee: t.delivery_fee ?? null,
      delivery_fee_per_km: t.delivery_fee_per_km ?? null,
    });
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

  /** Which page or tab a validation message belongs to, so Save can route to it. */
  type EditorField =
    | 'name' | 'location' | 'road' | 'area' | 'road_width_m'
    | 'marker_color' | 'route_color' | 'border_color'
    | 'base_fare' | 'per_km'
    | 'private_ride_fee' | 'private_ride_fee_per_km'
    | 'delivery_fee' | 'delivery_fee_per_km';
  type EditorErrors = Partial<Record<EditorField, string>>;

  /**
   * Everything that would make this terminal unsaveable or wrong once written.
   *
   * Road and area are checked as "none or enough", not "enough": a terminal with
   * no boundary is legitimate (nothing enforces a boundary that was never
   * plotted), but a half-drawn one silently becomes no boundary at all, so a
   * single stray tap has to be an error rather than a quiet discard.
   */
  function validateEditor(): { errors: EditorErrors; firstField: EditorField | null } {
    const errors: EditorErrors = {};

    const name = form.name.trim();
    if (!name) errors.name = 'Give the terminal a name before saving.';
    else if (name.length < 2) errors.name = 'Terminal name must be at least 2 characters.';

    // A dropped pin leaves the default, which is a valid place — so this only
    // catches coordinates that are out of range or not numbers at all.
    if (
      !Number.isFinite(form.center_lat) || !Number.isFinite(form.center_lng) ||
      Math.abs(form.center_lat) > 90 || Math.abs(form.center_lng) > 180
    ) {
      errors.location = 'That location is not a valid point on the map. Tap the map to set it again.';
    }

    if (form.boundary_polygon.length > 0 && form.boundary_polygon.length < 2) {
      errors.road = 'A road needs at least 2 points. Add another, or clear the road.';
    }

    if (form.boundary_area.length > 0 && form.boundary_area.length < 3) {
      errors.area = `A border area needs at least 3 points (${form.boundary_area.length} so far). Add another, or clear it.`;
    }

    const width = Number(form.road_width_m);
    if (!Number.isFinite(width) || width < MIN_ROAD_WIDTH_M || width > MAX_ROAD_WIDTH_M) {
      errors.road_width_m = `Road corridor width must be between ${MIN_ROAD_WIDTH_M} and ${MAX_ROAD_WIDTH_M} metres.`;
    }

    if (!/^#[0-9a-fA-F]{6}$/.test(form.marker_color.trim())) {
      errors.marker_color = 'Map icon color must be a hex value like #2E75B6.';
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(form.route_color.trim())) {
      errors.route_color = 'Route color must be a hex value like #22C55E.';
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(form.border_color.trim())) {
      errors.border_color = 'Border color must be a hex value like #22C55E.';
    }

    // Fares must be a real, non-negative amount. The save path already falls back
    // to a default for junk, but silently writing 20 when an admin typed "abc"
    // reads as "my change was ignored".
    const fare = (value: unknown): number | null => {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    if (fare(form.base_fare) === null) {
      errors.base_fare = 'Base fare must be a number of 0 or more.';
    }
    if (fare(form.per_km) === null) {
      errors.per_km = 'Fare per km must be a number of 0 or more.';
    }

    /*
     * The private ride and delivery boxes have a third state beyond "a number":
     * empty. Empty is not zero -- it is "charge the share ride rate" or "use the
     * platform default" -- so the validator has to accept null as well as a
     * non-negative amount, and only rejects the junk in between (a half-typed
     * "2." typed then cleared can leave NaN behind).
     */
    const optionalFare = (value: number | null): boolean =>
      value === null || (Number.isFinite(value) && value >= 0);
    if (!optionalFare(form.private_ride_fee)) {
      errors.private_ride_fee = 'Private ride price must be a number of 0 or more, or left empty.';
    }
    if (!optionalFare(form.private_ride_fee_per_km)) {
      errors.private_ride_fee_per_km = 'Private ride price per km must be a number of 0 or more, or left empty.';
    }
    if (!optionalFare(form.delivery_fee)) {
      errors.delivery_fee = 'Delivery price must be a number of 0 or more, or left empty.';
    }
    if (!optionalFare(form.delivery_fee_per_km)) {
      errors.delivery_fee_per_km = 'Delivery price per km must be a number of 0 or more, or left empty.';
    }

    // Order matters only in that the first entry is the one reported; it follows
    // the order the admin meets the fields, with the shapes before the settings.
    const order: EditorField[] = [
      'name', 'location', 'road', 'area', 'road_width_m',
      'marker_color', 'route_color', 'border_color',
      'base_fare', 'per_km',
      'private_ride_fee', 'private_ride_fee_per_km',
      'delivery_fee', 'delivery_fee_per_km',
    ];
    const firstField = order.find(f => errors[f]) ?? null;
    return { errors, firstField };
  }

  /** Error message when a plotted shape can't be saved as-is, else null. */
  function boundaryValidationError(): string | null {
    const { errors, firstField } = validateEditor();
    if (!firstField) return null;
    // Only the shape problems belong in this narrower check; a missing name is
    // reported by the editor's own validation with a route to the right page.
    return firstField === 'road' || firstField === 'area' ? errors[firstField]! : null;
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

    /*
     * Private ride and delivery keep their empty state all the way to the row.
     * Collapsing null to 0 here would be the one mistake that costs a driver
     * money rather than making a form look wrong: a private ride that silently
     * becomes free, or a delivery nobody is paid for.
     */
    const optionalFareValue = (value: number | null): number | null =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    const private_ride_fee = optionalFareValue(form.private_ride_fee);
    const private_ride_fee_per_km = optionalFareValue(form.private_ride_fee_per_km);
    const delivery_fee = optionalFareValue(form.delivery_fee);
    const delivery_fee_per_km = optionalFareValue(form.delivery_fee_per_km);

    // Normalised on the way out too, so a value that somehow slipped past the
    // picker (a restored draft, a pasted form state) can't write a bad colour.
    const markerColor = normalizeTerminalColor(form.marker_color);
    const routeColor = normalizeRouteColor(form.route_color);
    const borderColor = normalizeBorderColor(form.border_color);

    const target: Terminal = editTerminal
      ? { ...editTerminal, name: form.name, boundary: form.boundary, center_lat: form.center_lat, center_lng: form.center_lng, is_active: form.is_active, boundary_polygon: boundaryPolygon, boundary_area: boundaryArea, road_width_m: roadWidthM, boundary_enabled: form.boundary_enabled, base_fare, per_km, marker_color: markerColor, route_color: routeColor, border_color: borderColor, private_ride_fee, private_ride_fee_per_km, delivery_fee, delivery_fee_per_km }
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
          // Taken from the form, not hard-coded: the Enforce Boundary switch is
          // only shown once something is plotted, so a new terminal with a drawn
          // route can legitimately start with enforcement off.
          boundary_enabled: form.boundary_enabled,
          base_fare,
          per_km,
          marker_color: markerColor,
          route_color: routeColor,
          border_color: borderColor,
          private_ride_fee,
          private_ride_fee_per_km,
          delivery_fee,
          delivery_fee_per_km,
        };

    // Super Admin changes apply immediately.
    if (isSuperAdmin) {
      /*
       * Only the fare columns this database was found to have go in the upsert.
       * PostgREST fails the whole statement over one unknown column, so sending
       * them blind would cost a partially-migrated project every terminal edit,
       * not just the delivery ones.
       */
      const farePatch: Record<string, number | null> = {};
      if (fareColumns.privateRide) {
        farePatch.private_ride_fee = target.private_ride_fee ?? null;
        farePatch.private_ride_fee_per_km = target.private_ride_fee_per_km ?? null;
      }
      if (fareColumns.delivery) {
        farePatch.delivery_fee = target.delivery_fee ?? null;
        farePatch.delivery_fee_per_km = target.delivery_fee_per_km ?? null;
      }

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
          marker_color: target.marker_color,
          route_color: target.route_color,
          border_color: target.border_color,
          ...farePatch,
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
          marker_color: target.marker_color,
          route_color: target.route_color,
          border_color: target.border_color,
          private_ride_fee: target.private_ride_fee,
          private_ride_fee_per_km: target.private_ride_fee_per_km,
          delivery_fee: target.delivery_fee,
          delivery_fee_per_km: target.delivery_fee_per_km,
          is_active: target.is_active,
        },
        actorEmail: user?.email,
        actorName: user?.name,
      });

      setTerminals(ts =>
        editTerminal ? ts.map(t => (t.id === editTerminal.id ? target : t)) : [...ts, target]
      );
      closeMapPicker();
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

    closeMapPicker();
    closeMapPicker();
    resetBoundaryHistory();
    await loadMyRequests();
    setToast({ message: 'Terminal change submitted for Super Admin approval', variant: 'warning' });
  }

  /**
   * Write a terminal's boundary-enforcement flag straight to the row.
   *
   * Both the card's toggle and the editor's Enforce Boundary switch come through
   * here. That is the whole point of splitting it out: enforcement is a live
   * operational decision — "stop checking drop-offs against this road right now"
   * — not a field on the terminal's settings, so it must never sit in the editor's
   * unsaved-changes set waiting for someone to press Save Changes. Applying it
   * on tap is what makes it safe to flip in the middle of plotting.
   *
   * Returns whether it stuck, so the caller can put its own optimistic state back.
   */
  async function persistBoundaryEnabled(terminalId: string, next: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('terminals')
      .update({ boundary_enabled: next })
      .eq('id', terminalId);

    if (error) return false;

    logAudit({
      action: next ? 'enable_terminal_boundary' : 'disable_terminal_boundary',
      actorRole: 'admin',
      entityType: 'terminal',
      entityId: terminalId,
      summary: `${next ? 'Enabled' : 'Disabled'} the road boundary check for: ${terminals.find(t => t.id === terminalId)?.name ?? terminalId}`,
      details: { boundary_enabled: next },
      actorEmail: user?.email,
      actorName: user?.name,
    });

    return true;
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

    if (!(await persistBoundaryEnabled(terminal.id, next))) {
      setTerminals(ts =>
        ts.map(t => (t.id === terminal.id ? { ...t, boundary_enabled: !next } : t))
      );
      if (editTerminal?.id === terminal.id) {
        setEditTerminal({ ...editTerminal, boundary_enabled: !next });
      }
      setToast({ message: 'Could not update the boundary', variant: 'error' });
      return;
    }

    setToast({
      message: next
        ? `Boundary check enabled — drop-offs and driver queues are checked against ${terminal.name}`
        : `Boundary check disabled — ${terminal.name}'s boundary is kept but not enforced`,
      variant: next ? 'success' : 'warning',
    });
  }

  /**
   * The Enforce Boundary switch inside the editor.
   *
   * Deliberately does not touch the unsaved-changes snapshot: flipping it must
   * not light up Save Changes, and must not be lost by walking away from the
   * editor. For a terminal that already exists the write goes out immediately;
   * for one being created there is no row to write to, so it stays a plain form
   * value and is saved with the rest of the terminal.
   */
  async function setEditorBoundaryEnabled(next: boolean) {
    setForm(f => ({ ...f, boundary_enabled: next }));

    const id = editTerminal?.id;
    if (!id) return;

    const ok = await persistBoundaryEnabled(id, next);
    if (!ok) {
      // Put the switch back where it was; a toggle that silently didn't take is
      // worse than one that visibly failed.
      setForm(f => ({ ...f, boundary_enabled: !next }));
      setToast({ message: 'Could not update the boundary', variant: 'error' });
      return;
    }

    setTerminals(ts => ts.map(t => (t.id === id ? { ...t, boundary_enabled: next } : t)));
    setToast({
      message: next
        ? 'Boundary check enabled — applied now'
        : 'Boundary check disabled — the shape is kept, the check is not',
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

  /*
   * Super Admin's driver assignment, applied at once.
   *
   * A Rider Admin's changes are queued and submitted for approval, which is what
   * the pending-changes banner and savePendingChanges above are for. A Super Admin
   * is the approver, so routing their own taps through a queue they would then
   * have to approve would be a second, slower path to the same row — the two are
   * deliberately separate rather than one function with a flag.
   */

  /** Move a driver onto a terminal now. Optimistic, and rolls back on failure. */
  async function applyAssignDriver(rider: StoredRider, terminal: Terminal) {
    const previousId = riderTerminalId(rider);
    const previousName = riderTerminalName(rider);

    setUsers(list =>
      list.map(u =>
        u.id === rider.id
          ? {
              ...u,
              terminalId: terminal.id,
              terminal_id: terminal.id,
              terminalName: terminal.name,
              terminal_name: terminal.name,
            }
          : u
      )
    );

    const { error } = await supabase
      .from('users')
      .update({ terminal_id: terminal.id, terminal_name: terminal.name })
      .eq('id', rider.id);

    if (error) {
      setUsers(list =>
        list.map(u =>
          u.id === rider.id
            ? { ...u, terminalId: previousId, terminal_id: previousId, terminalName: previousName, terminal_name: previousName }
            : u
        )
      );
      setToast({ message: `Could not assign ${riderName(rider)}: ${error.message}`, variant: 'error' });
      return;
    }

    logAudit({
      action: 'assign_terminal_driver',
      actorRole: 'admin',
      entityType: 'terminal',
      entityId: terminal.id,
      summary: `Assigned ${riderName(rider)} to ${terminal.name}`,
      details: { driver_id: rider.id, terminal_id: terminal.id, previous_terminal_id: previousId ?? null },
      actorEmail: user?.email,
      actorName: user?.name,
    });

    setTerminals(ts =>
      ts.map(t => (t.id === terminal.id ? { ...t, rider_count: (t.rider_count ?? 0) + 1 } : t))
    );
    setToast({ message: `${riderName(rider)} assigned to ${terminal.name}`, variant: 'success' });
  }

  /** Take a driver off their terminal now. Optimistic, and rolls back on failure. */
  async function applyUnassignDriver(rider: StoredRider, terminal: Terminal) {
    const previousId = riderTerminalId(rider);
    const previousName = riderTerminalName(rider);

    setUsers(list =>
      list.map(u =>
        u.id === rider.id
          ? { ...u, terminalId: undefined, terminal_id: undefined, terminalName: undefined, terminal_name: undefined }
          : u
      )
    );

    const { error } = await supabase
      .from('users')
      .update({ terminal_id: null, terminal_name: null })
      .eq('id', rider.id);

    if (error) {
      setUsers(list =>
        list.map(u =>
          u.id === rider.id
            ? { ...u, terminalId: previousId, terminal_id: previousId, terminalName: previousName, terminal_name: previousName }
            : u
        )
      );
      setToast({ message: `Could not remove ${riderName(rider)}: ${error.message}`, variant: 'error' });
      return;
    }

    logAudit({
      action: 'unassign_terminal_driver',
      actorRole: 'admin',
      entityType: 'terminal',
      entityId: terminal.id,
      summary: `Removed ${riderName(rider)} from ${terminal.name}`,
      details: { driver_id: rider.id, terminal_id: terminal.id, previous_terminal_id: previousId ?? null },
      actorEmail: user?.email,
      actorName: user?.name,
    });

    setTerminals(ts =>
      ts.map(t => (t.id === terminal.id ? { ...t, rider_count: Math.max(0, (t.rider_count ?? 0) - 1) } : t))
    );
    setToast({ message: `${riderName(rider)} removed from ${terminal.name}`, variant: 'success' });
  }

  function confirmAssignDriver(rider: StoredRider, terminal: Terminal) {
    openModal({
      title: 'Assign Driver',
      message: `Assign ${riderName(rider)} to ${terminal.name}? They will start picking up rides from this terminal.`,
      variant: 'success',
      confirmLabel: 'Assign',
      onConfirm: async () => {
        closeModal();
        await applyAssignDriver(rider, terminal);
      },
    });
  }

  function confirmUnassignDriver(rider: StoredRider, terminal: Terminal) {
    openModal({
      title: 'Remove Driver',
      message: `Remove ${riderName(rider)} from ${terminal.name}? They will have no terminal to pick up rides from until one is assigned.`,
      variant: 'warning',
      confirmLabel: 'Remove',
      onConfirm: async () => {
        closeModal();
        await applyUnassignDriver(rider, terminal);
      },
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
          /* The label drops below sm, where the header only has whatever the title
             leaves over. The icon carries the meaning and the aria-label keeps the
             button identifiable once the words are gone.

             The "+" stays at every width. Below sm the label is gone, and a lone
             terminal icon reads as "this terminal" rather than "add one" -- the
             glyph is what carries the verb on its own. */
          <button
            type="button"
            onClick={openCreate}
            aria-label="Add Terminal"
            title="Add Terminal"
            className="inline-flex min-h-11 items-center gap-1.5 sm:gap-2 rounded-xl bg-[var(--primary)] px-3 sm:px-4 py-2 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            <TerminalIcon size={22} color="#FFFFFF" />
            <span aria-hidden="true" className="text-xl font-bold leading-none -ml-0.5">+</span>
            <span className="hidden sm:inline">Add Terminal</span>
          </button>
        ) : null
      }
    >

        {/* Content */}
        <div className="space-y-6">
          {/* Super Admin sees this page as two jobs: scoping who runs which
              terminal, and seeing the whole network at once. Splitting them keeps
              a long assignment form from pushing the map out of reach. A Rider
              Admin only ever does the first, so they get no tabs. */}
          {isSuperAdmin && (
            <div
              className="flex flex-1 min-w-[260px] gap-2 p-1 bg-[var(--muted)] rounded-xl"
              role="tablist"
              aria-label="Terminal views"
            >
              {([
                ['assignment', 'Toda Assignment'],
                ['map', 'Terminal Location'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={terminalView === value}
                  onClick={() => setTerminalView(value)}
                  className={`flex-1 h-11 rounded-lg text-sm font-bold transition-colors ${
                    terminalView === value
                      ? "bg-surface text-[var(--ink)] shadow-sm"
                      : "text-[var(--muted-foreground)] hover:text-[var(--ink)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

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

          {/*
            Which Rider Admin runs which terminal.

            It leads the tab because it is the widest-reaching decision on it: this
            decides who can edit a terminal and who can queue drivers on it, and
            the driver cards below only exist because of the answer. Reading it
            first means the rest of the page is already explained — a Rider Admin
            listed here is the reason the matching terminal card says anything
            about approvals at all.

            Only on this tab, never Terminal Location: that one is about where the
            terminals are, and this is about who works them.
          */}
          {isSuperAdmin && terminalView !== 'map' && (
            <div>
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

          {/* Super Admin: every terminal on one map, with the tricycle marker and
              the border each admin plotted — the thing you cannot see from a list. */}
          {isSuperAdmin && terminalView === 'map' && (
            <div className="space-y-4">
              <div className="relative w-full h-[420px] lg:h-[500px] bg-[var(--muted)] border border-line rounded-2xl overflow-hidden">
                {isMapsLoaded ? (
                  <GoogleMap
                    mapContainerStyle={{ width: '100%', height: '100%' }}
                    center={{ lat: 14.6867, lng: 120.9950 }}
                    zoom={13}
                    options={{
                      zoomControl: true,
                      fullscreenControl: false,
                      streetViewControl: false,
                      mapTypeControl: false,
                      gestureHandling: 'greedy',
                    }}
                    onLoad={m => {
                      overviewMapRef.current = m;
                      fitTerminalsOnMap(m);
                    }}
                  >
                    {/* Everything a hidden terminal draws — marker, route and border
                        together. Leaving any one of them behind would defeat the
                        point: a terminal with its pin gone but its border still
                        painted over a neighbour reads as a mapping bug, not as
                        something the admin switched off. */}
                    {visibleTerminals.filter(t => !hiddenTerminalIds.includes(t.id)).map(t => {
                      const area = t.boundary_area && t.boundary_area.length >= 3 ? t.boundary_area : null;
                      const road = t.boundary_polygon && t.boundary_polygon.length >= 2 ? t.boundary_polygon : null;
                      // An inactive terminal keeps its own colour and is dimmed
                      // instead. Overriding the hue would throw away the one cue
                      // that tells two nearby TODAs apart, which is the reason
                      // these are per-terminal in the first place.
                      const dim = t.is_active === false;
                      return (
                        <ReactFragment key={t.id}>
                          {area && (
                            <Polygon
                              path={area}
                              options={{
                                fillColor: t.border_color,
                                fillOpacity: dim ? 0.05 : 0.12,
                                strokeColor: t.border_color,
                                strokeOpacity: dim ? 0.4 : 1,
                                strokeWeight: 2,
                                clickable: false,
                              }}
                            />
                          )}
                          {road && (
                            <Polyline
                              path={road}
                              options={{
                                strokeColor: t.route_color,
                                strokeWeight: 4,
                                strokeOpacity: dim ? 0.35 : 0.9,
                                clickable: false,
                                geodesic: true,
                              }}
                            />
                          )}
                          {/* The classic `Marker`, not `MarkerF`. MarkerF is backed by
                              AdvancedMarkerElement, which ignores an `icon` URL and
                              needs a Google Cloud map ID before it renders anything
                              at all — so switching to it silently empties the map.
                              The deprecation warning it logs is the lesser problem. */}
                          <Marker
                            position={{ lat: t.center_lat, lng: t.center_lng }}
                            title={t.name}
                            icon={terminalMarkerIcon(t.marker_color, 76)}
                            zIndex={area || road ? 20 : 30}
                          />
                        </ReactFragment>
                      );
                    })}
                  </GoogleMap>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <p className="text-xs text-[var(--muted-foreground)]">Loading map...</p>
                  </div>
                )}
              </div>

              {/* The icon list, below the map and doubling as the way to jump to
                  one. Full width under the map means it spreads into columns
                  rather than stacking six tall rows in a narrow strip. */}
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {visibleTerminals.length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)] italic">No terminals yet</p>
                ) : (
                  visibleTerminals.map(t => {
                    const roadPts = t.boundary_polygon?.length ?? 0;
                    const areaPts = t.boundary_area?.length ?? 0;
                    const enforced = t.boundary_enabled !== false;
                    const hidden = hiddenTerminalIds.includes(t.id);
                    return (
                      /* A div rather than a button: the row pans the map and the
                         two controls have to sit inside it, and a button cannot
                         contain one. The pan target is the icon-and-text region
                         only, so tapping either control never also zooms the map. */
                      <div
                        key={t.id}
                        className={`w-full flex items-start gap-2 p-3 bg-surface border rounded-xl transition-colors ${
                          hidden
                            ? 'border-line opacity-60'
                            : 'border-line hover:border-[var(--primary)]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => focusTerminal(t)}
                          className="flex items-start gap-3 text-left flex-1 min-w-0"
                        >
                          <TerminalIcon size={56} color={t.marker_color} className="flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm text-[var(--ink)] truncate">
                              {t.name}
                            </p>
                            <p className="text-xs text-[var(--muted-foreground)] truncate">
                              {hidden
                                ? 'Hidden from the map'
                                : areaPts >= 3
                                  ? `Border ${areaPts} pts`
                                  : roadPts >= 2
                                    ? `Road ${roadPts} pts · ${normalizeRoadWidth(t.road_width_m)} m`
                                    : 'No border plotted'}
                              {!hidden && areaPts >= 3 && roadPts >= 2 ? ` · road ${roadPts} pts` : ''}
                            </p>
                          </div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                            enforced
                              ? 'bg-[var(--success-soft)] text-[var(--success)]'
                              : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                          }`}>
                            {enforced ? 'On' : 'Off'}
                          </span>
                        </button>
                        {/* Hide / show this terminal's route, marker and border.
                            Beside the settings cog because it is the other half of
                            looking at a terminal on this map, and next to it rather
                            than tucked into the row for the same reason. */}
                        <button
                          type="button"
                          onClick={() => toggleTerminalHidden(t.id)}
                          aria-pressed={!hidden}
                          aria-label={`${hidden ? 'Show' : 'Hide'} ${t.name} on the map`}
                          title={hidden ? 'Show on map' : 'Hide route, terminal and border'}
                          className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg bg-[var(--muted)] active:scale-90"
                        >
                          {hidden
                            ? <EyeOff className="w-4 h-4 text-[var(--muted-foreground)]" />
                            : <Eye className="w-4 h-4 text-[var(--ink)]" />}
                        </button>
                        {/* A cog, not a pencil. What this opens is the terminal's
                            whole configuration -- name, corridor width, visibility,
                            colours, fares -- not a text field, and the pencil on a
                            row that already shows the terminal's name said "rename
                            this" when what it actually did was open a form. */}
                        <button
                          type="button"
                          onClick={() => openEdit(t)}
                          aria-label={`Settings for ${t.name}`}
                          title="Terminal settings"
                          className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg bg-[var(--muted)] active:scale-90"
                        >
                          <Settings className="w-4 h-4 text-[var(--ink)]" />
                        </button>
                      </div>
                    );
                  })
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

          {/*
            Two different cards, because the two tabs answer two different
            questions.

            Toda Assignment asks one question — which drivers sit at which
            terminal — so the Super Admin's card there is the terminal's own icon,
            its name and its drivers, with assign and remove. Everything else about
            a terminal (boundary pills, corridor width, fares, colours) belongs to
            Terminal Location, which is where it is all configured and all of it
            is on screen at once.

            A Rider Admin has no tabs: they get one terminal and need the whole
            card, so they keep the existing expandable one below.
          */}
          {terminalView === 'map' ? null : loading ? (
            <StatSkeleton count={4} />
          ) : isRiderAdmin && visibleTerminals.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No terminal assigned to you yet"
              description="The Super Admin must assign you to a terminal before you can manage it."
              filipino="Wala pang terminal na nakatalaga sa iyo. Itinalaga ito ng Super Admin."
            />
          ) : isSuperAdmin ? (
            visibleTerminals.length === 0 ? (
              <EmptyState
                icon={MapPin}
                title="No terminals yet"
                description="Add a terminal first, then put drivers on it."
              />
            ) : (
              <div className="grid gap-4">
                {visibleTerminals.map(t => {
                  const termRiders = getRidersForTerminal(t.id);
                  const unassigned = getUnassignedRiders();
                  return (
                    <div key={t.id} className="bg-surface rounded-2xl border border-line overflow-hidden">
                      <div className="flex items-center gap-3 p-4">
                        {/* The terminal's own icon, in its own colour — not a generic
                            pin. This row is identified by that artwork everywhere else
                            in the app, and a row of identical pins gives an admin no
                            way to tell two TODAs apart at a glance. */}
                        <TerminalIcon
                          size={48}
                          color={normalizeTerminalColor(t.marker_color)}
                          className="flex-shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-[var(--ink)] text-lg truncate">{t.name}</h3>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {termRiders.length} driver{termRiders.length === 1 ? '' : 's'}
                            {unassigned.length > 0 ? ` · ${unassigned.length} waiting to be assigned` : ''}
                          </p>
                        </div>
                        {/* Deletion stays reachable from here even though the rest of
                            the terminal's controls moved to Terminal Location: it is
                            the only place a Super Admin can remove one, and a tab
                            that cannot delete is a dead end. */}
                        <button
                          type="button"
                          onClick={() => confirmDeleteTerminal(t.id)}
                          aria-label={`Delete ${t.name}`}
                          className="w-11 h-11 flex-shrink-0 bg-[var(--error-soft)] border-2 border-[var(--error-soft)] rounded-xl flex items-center justify-center hover:border-[var(--error)] transition-all active:scale-90"
                        >
                          <Trash2 size={14} className="text-[var(--error)]" />
                        </button>
                      </div>

                      <div className="border-t-2 border-[var(--border)] p-4 bg-[var(--muted)] space-y-4">
                        <div className="space-y-2">
                          {termRiders.length === 0 ? (
                            <p className="text-sm text-[var(--muted-foreground)] italic">
                              No drivers assigned yet
                            </p>
                          ) : (
                            termRiders.map(r => (
                              <div
                                key={r.id}
                                className="flex items-center justify-between gap-3 rounded-xl border-2 border-[var(--border)] bg-surface px-4 py-2.5"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-8 h-8 flex-shrink-0 bg-[var(--info-soft)] rounded-lg flex items-center justify-center text-[var(--info)] font-bold text-xs">
                                    {riderName(r)[0]?.toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-[var(--ink)] truncate">
                                      {riderName(r)}
                                    </p>
                                    <p className="text-xs text-[var(--muted-foreground)] truncate">
                                      {riderPlate(r) || 'No plate'}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => confirmUnassignDriver(r, t)}
                                  aria-label={`Remove ${riderName(r)} from ${t.name}`}
                                  className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-[var(--error)] bg-[var(--error-soft)] border border-[var(--error-soft)] px-2.5 py-1.5 rounded-lg hover:border-[var(--error)] transition-all active:scale-95"
                                >
                                  <UserMinus size={12} /> Remove
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        {unassigned.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] mb-2">
                              Assign a driver
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {unassigned.map(r => (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => confirmAssignDriver(r, t)}
                                  className="flex items-center gap-2 px-3 py-2 bg-surface border border-line hover:border-[var(--success)] rounded-xl transition-all active:scale-95 text-sm font-medium"
                                >
                                  <UserPlus size={13} className="text-[var(--success)]" />
                                  {riderName(r)}
                                  {riderPlate(r) && (
                                    <span className="text-xs text-[var(--muted-foreground)]">{riderPlate(r)}</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
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
                        <div className="w-11 h-11 flex-shrink-0">
                          <TerminalIcon
                            size={44}
                            color={normalizeTerminalColor(t.marker_color)}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-[var(--ink)] text-lg">{t.name}</h3>
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


      {/* Terminal editor.
          Admin chrome (the nav drawer) is z-[1001], so every overlay on this page has to
          clear it — otherwise the sidebar paints over a "full-screen" modal and hides its
          close button. This matches the z-[2000] scale the other admin pages use. */}
      {showMapPicker && (
        <div className="fixed inset-0 z-[2010] bg-surface flex flex-col">
          {/*
            One top bar for every section, spanning the full width of the editor —
            over the sidebar rail as well as the content.

            Configuration and Fares & Delivery used to carry their own sticky
            header *inside* the content pane while the map sections carried this
            one above it, so the rail started level with the top of the screen on
            two tabs and level with the back button on the other three. The same
            place for the way out, on every tab, is what makes the editor read as
            one screen.

            The back button does the same thing on all five: it leaves the editor
            and goes back to the terminal list. It used to step back to the map
            section from Configuration and Fares, which meant the same arrow did
            two different things depending on which tab it was on — and on those
            two it read as "back to the previous step" while three tabs over it
            read as "back to the list", which is the only thing it can mean when
            the editor is a full-screen overlay over the list. Leaving from
            Fares & Delivery mid-edit now goes through the same discard prompt
            the map sections always did, rather than quietly parking the edits.
          */}
          <div className="flex-shrink-0 bg-surface border-b border-[var(--border)] px-3 py-3 flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={requestCloseMapPicker}
              aria-label="Back to terminals"
              className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-[var(--muted)] active:scale-90"
            >
              <ArrowLeft className="w-5 h-5 text-[var(--ink)]" />
            </button>

            {/* The map sections search for a place to put the terminal; the other
                two have no map to search, so they name themselves instead. */}
            {editorSectionIsMap ? (
              /* Search Bar */
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
            ) : (
              <h3 className="min-w-0 font-extrabold text-base text-[var(--ink)] truncate">
                {/* A plain "&" in a JS string, not "&amp;": entities are only decoded
                    in JSX text, so writing the entity here would put the literal
                    characters "&amp;" in the title. */}
                {editorSection === 'fares' ? 'Fares & Delivery' : editTerminal ? 'Edit Terminal' : 'New Terminal'}
              </h3>
            )}
          </div>

          {/* Sidebar navigation. Collapsed, it shows icons alone so the map keeps
              the width; expanded, each section names itself. */}
          <div className="flex-1 flex min-h-0">
            <aside
              className={`relative flex flex-col gap-1 p-2 bg-surface border-r border-[var(--border)] shrink-0 transition-[width] duration-200 ${sidebarCollapsed ? 'w-16' : 'w-44'}`}
            >
              {([
                ['terminal', 'Terminal', MapPin],
                ['border', 'Border', Pentagon],
                ['route', 'Route', Milestone],
                ['fares', 'Fares & Delivery', Banknote],
                // Last, always. Configuration is what you go to once the shape of
                // the terminal is settled — name, corridor width, colours — so it
                // sits below the three that draw the terminal rather than between
                // the route and the things read alongside it.
                ['configuration', 'Configuration', SlidersHorizontal],
              ] as const).map(([id, label, Icon]) => {
                const active = editorSection === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setEditorSection(id)}
                    aria-current={active ? 'page' : undefined}
                    title={sidebarCollapsed ? label : undefined}
                    className={`flex items-center gap-3 h-12 px-3 rounded-xl transition-colors ${
                      active
                        ? 'bg-[var(--primary)] text-white'
                        : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {/* Collapsed shows the icon only; the tooltip keeps the name reachable. */}
                    {!sidebarCollapsed && (
                      <span className="text-sm font-bold truncate">{label}</span>
                    )}
                  </button>
                );
              })}

              {/* Halfway down the rail, on the edge facing the panel. */}
              <button
                type="button"
                onClick={() => setSidebarCollapsed(c => !c)}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!sidebarCollapsed}
                className="absolute top-1/2 -translate-y-1/2 right-[-14px] z-[2016] w-7 h-14 flex items-center justify-center rounded-full bg-surface border border-line shadow-lg active:scale-95"
              >
                {sidebarCollapsed
                  ? <ChevronRight className="w-4 h-4 text-[var(--ink)]" />
                  : <ChevronLeft className="w-4 h-4 text-[var(--ink)]" />}
              </button>
            </aside>

            <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {editorSection !== 'configuration' && editorSection !== 'fares' && (
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
                // One finger pans. The default is two-finger on touch, which makes the
                // map feel stuck on a phone when the admin is trying to place a pin.
                gestureHandling: 'greedy',
                // Shops, landmarks, churches, every point of interest the base map
                // draws: none of them can be tapped, so a tap on a POI label falls
                // through to the map and plots a point where the admin was aiming at
                // the road behind it. Plotting a route is a long series of these, and
                // every one that landed on a bakery icon instead of the street was a
                // point to go back and undo. Nothing on this map is selectable by
                // design — the admin is drawing a shape, not picking a place.
                clickableIcons: false,
              }}
            >
              {/* The pin changes with the tab, so what is under the finger is
                  never ambiguous: the terminal's own icon on Terminal, and the
                  shape's colour on the two plotting tabs. */}
              {mapPickerMode === 'location' ? (
                <Marker
                  position={{ lat: form.center_lat, lng: form.center_lng }}
                  title={form.name}
                  icon={terminalMarkerIcon(normalizeTerminalColor(form.marker_color), 54)}
                />
              ) : (
                <Marker
                  position={{ lat: form.center_lat, lng: form.center_lng }}
                  title={form.name}
                  icon={shapePinIcon(
                    mapPickerMode === 'road'
                      ? normalizeRouteColor(form.route_color)
                      : normalizeBorderColor(form.border_color),
                  )}
                />
              )}
              {/* The enclosing area, drawn under the road it contains. */}
              {form.boundary_area.length >= 3 && (
                <Polygon
                  path={form.boundary_area}
                  options={{
                    fillColor: normalizeBorderColor(form.border_color),
                    fillOpacity: 0.12,
                    strokeColor: normalizeBorderColor(form.border_color),
                    strokeWeight: 2,
                    strokeOpacity: 0.9,
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
                    strokeColor: normalizeRouteColor(form.route_color),
                    strokeWeight: 5,
                    strokeOpacity: 0.9,
                    clickable: false,
                    geodesic: true,
                  }}
                />
              )}
              {/*
                The route's two ends, numbered in the route's own colour so a
                route point never reads as a border point on the same map.

                Only the ends are marked, though every tap is still stored. The
                intermediate pins were the single loudest thing on this map: a
                thirty-point route was thirty overlapping teardrops sitting on the
                road being plotted, hiding the very thing being judged — where the
                line actually falls — and making it impossible to see which of two
                nearby taps was which. What an admin needs from the shape is "where
                does it start and stop"; the bends are read off the line itself.

                The polyline is untouched and still passes through every stored
                point, so nothing is lost about the route -- only the waypoints
                that were crowding it are gone.

                The two ends are numbered 1 and 2, not 1 and N. Once the
                intermediate pins are gone the last point's real index is
                meaningless to anyone reading the map: a route of 110 plotted
                points ending in a "110" pin implies there were 109 others still
                standing, which is the opposite of what the map now shows. 1 and 2
                is the whole story the markers need to tell -- first tap, last tap
                -- and it stays true no matter how long the route is.
              */}
              {mapPickerMode === 'road' &&
                form.boundary_polygon
                  .map((point, index) => ({ point, index }))
                  .filter(
                    ({ index }) =>
                      index === 0 || index === form.boundary_polygon.length - 1
                  )
                  .map(({ point, index }) => (
                    <Marker
                      key={`${point.lat}_${point.lng}_${index}`}
                      position={point}
                      title={index === 0 ? 'Route start' : 'Route end'}
                      icon={numberedPinIcon(index === 0 ? 1 : 2, normalizeRouteColor(form.route_color))}
                    />
                  ))}
              {mapPickerMode === 'area' &&
                form.boundary_area.map((point, index) => (
                  <Marker
                    key={`${point.lat}_${point.lng}_${index}`}
                    position={point}
                    title={`Border point ${index + 1}`}
                    icon={numberedPinIcon(index + 1, normalizeBorderColor(form.border_color))}
                  />
                ))}
            </GoogleMap>

            {/* Floating save, bottom-right. Only appears once something has actually
                changed — a permanent button would invite saving an untouched form. */}
            {hasUnsavedEditorChanges && (
              <button
                type="button"
                onClick={saveChangesFromPicker}
                className="absolute bottom-4 right-4 h-12 px-5 flex items-center gap-2 bg-[var(--primary)] text-white text-sm font-bold rounded-xl shadow-xl active:scale-[0.98] z-[2015]"
              >
                <Save className="w-4 h-4" />
                Save Changes
              </button>
            )}

            {/* Hint panel sits along the top, clear of both the gear and the
                floating save. pointer-events-none so it never swallows a tap meant
                for the map; its buttons opt back in. */}
            <div className="absolute top-3 left-3 right-16 pointer-events-none">
              <div className="bg-white/95 backdrop-blur rounded-xl shadow-lg p-3">
                {mapPickerMode === 'road' ? (
                  <>
                    <p className="text-sm font-semibold text-[#122724] text-center">
                      Tap along the route to plot it
                    </p>
                    <p className="text-xs text-[#5c6b68] text-center mt-0.5">
                      {isSnappingRoad
                        ? 'Snapping to the nearest road...'
                        : form.boundary_polygon.length < 2
                          ? `Add at least 2 points — drop-offs and food orders are accepted within ${Math.round(normalizeRoadWidth(form.road_width_m) / 2)} m of the route`
                          : `${form.boundary_polygon.length} points — accepts drop-offs / food orders within ${Math.round(normalizeRoadWidth(form.road_width_m) / 2)} m of the road`}
                    </p>
                    <p className="text-[11px] text-center mt-1 text-[#5c6b68]">
                      The route tricycle drivers can use to drop off a customer or
                      pick up a food order.
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
                        className="pointer-events-auto h-9 border border-line text-[#5c6b68] text-xs font-bold rounded-lg active:scale-95 disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed"
                      >
                        Undo Point
                      </button>
                      <button
                        type="button"
                        onClick={redoBoundary}
                        disabled={boundaryFuture.length === 0}
                        className="pointer-events-auto h-9 border border-line text-[#5c6b68] text-xs font-bold rounded-lg active:scale-95 disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed"
                      >
                        Redo Point
                      </button>
                    </div>
                    {form.boundary_polygon.length > 0 && (
                      <button
                        type="button"
                        onClick={confirmClearBoundary}
                        className="pointer-events-auto w-full h-9 mt-2 border-2 border-[#bc4b1f] text-[#bc4b1f] text-xs font-bold rounded-lg active:scale-95"
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
                      The radius where a tricycle driver can join the queue to pick
                      up a customer — share ride or private ride.
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <button
                        type="button"
                        onClick={undoBoundary}
                        disabled={boundaryPast.length === 0}
                        className="pointer-events-auto h-9 border border-line text-[#5c6b68] text-xs font-bold rounded-lg active:scale-95 disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed"
                      >
                        Undo Point
                      </button>
                      <button
                        type="button"
                        onClick={redoBoundary}
                        disabled={boundaryFuture.length === 0}
                        className="pointer-events-auto h-9 border border-line text-[#5c6b68] text-xs font-bold rounded-lg active:scale-95 disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed"
                      >
                        Redo Point
                      </button>
                    </div>
                    {form.boundary_area.length > 0 && (
                      <button
                        type="button"
                        onClick={confirmClearBoundary}
                        className="pointer-events-auto w-full h-9 mt-2 border-2 border-[#bc4b1f] text-[#bc4b1f] text-xs font-bold rounded-lg active:scale-95"
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
          )}

          {/* Configuration: everything with no natural place on the map — name,
              corridor width, visibility, colour. The back button and title live in
              the editor's top bar now, so nothing needs to stick to the top of this
              scroller to survive a long form on a phone. */}
          {editorSection === 'configuration' && (
            <div className="flex-1 overflow-y-auto">
              {/* Full width on a phone, capped on a desktop: the colour rows each
                  hold a preview, a label and a button, and at max-w-lg on a narrow
                  screen the label was the thing that got squeezed out. */}
              <div className="mx-auto w-full max-w-2xl p-4 space-y-4">
                {(() => {
                  const { errors } = validateEditor();
                  // No width in the shared class: the text fields want w-full and the
                  // road-width number wants a narrow box, and whichever declared a
                  // width last would win and squash the hint beside it.
                  const field =
                    'border border-line h-11 px-4 rounded-xl text-sm outline-none focus:border-[var(--primary)]';
                  const invalid = 'border-[var(--error)]';

                  return (
                    <>
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] block mb-1">
                          Terminal Name
                        </label>
                        <input
                          value={form.name}
                          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="e.g. Valenzuela Terminal"
                          aria-invalid={!!errors.name}
                          className={`w-full ${field} ${errors.name ? invalid : ''}`}
                        />
                        {errors.name && (
                          <p className="text-xs text-[var(--error)] mt-1">{errors.name}</p>
                        )}
                      </div>

                      {/* Descriptive address. Optional — the shapes that actually
                          restrict drop-offs and queues are the plotted route and
                          border area on the map. */}
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] block mb-1">
                          Location Area
                        </label>
                        <input
                          value={form.boundary}
                          onChange={e => setForm(f => ({ ...f, boundary: e.target.value }))}
                          placeholder="e.g. Main Road, Valenzuela City"
                          className={`w-full ${field}`}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] block mb-1">
                          Road Distance
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min={MIN_ROAD_WIDTH_M}
                            max={MAX_ROAD_WIDTH_M}
                            step={10}
                            inputMode="numeric"
                            value={form.road_width_m}
                            onChange={e =>
                              setForm(f => ({
                                ...f,
                                // NaN rather than 0 or '' so the validator can tell
                                // "cleared the field" from "typed 20"; normalizeRoadWidth
                                // already falls back to the default for a non-number.
                                road_width_m: e.target.value === '' ? NaN : Number(e.target.value),
                              }))
                            }
                            aria-invalid={!!errors.road_width_m}
                            className={`w-28 px-3 rounded-xl flex-shrink-0 ${field} ${errors.road_width_m ? invalid : ''}`}
                          />
                          <span className="text-xs leading-snug text-[var(--muted-foreground)]">
                            Accepts drop offs / food order within{' '}
                            {Math.round(normalizeRoadWidth(form.road_width_m) / 2)} m of the road
                          </span>
                        </div>
                        {errors.road_width_m && (
                          <p className="text-xs text-[var(--error)] mt-1">{errors.road_width_m}</p>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-[var(--muted)] rounded-xl">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--ink)]">Active Terminal</p>
                          <p className="text-xs text-[var(--muted-foreground)]">Visible to customers for pickup</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={form.is_active}
                          aria-label="Active terminal"
                          onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                          className={`relative w-12 h-7 rounded-full flex-shrink-0 transition-colors ${
                            form.is_active ? 'bg-[var(--success)]' : 'bg-[var(--border)]'
                          }`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-surface rounded-full shadow transition-transform ${
                            form.is_active ? 'translate-x-5' : ''
                          }`} />
                        </button>
                      </div>

                      {/* Whether the plotted road is enforced. It sits with the width
                          because both decide how far from the road a drop-off lands,
                          and flipping it must not discard the road either way. */}
                      {(form.boundary_polygon.length >= 2 || form.boundary_area.length >= 3) && (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-[var(--muted)] rounded-xl">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--ink)]">Enforce Boundary</p>
                            <p className="text-xs text-[var(--muted-foreground)]">
                              {form.boundary_enabled
                                ? 'Drop-offs, food orders and driver queues are checked against the route and border'
                                : 'Kept as drawn, but not checked against'}
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={form.boundary_enabled}
                            aria-label="Enforce boundary"
                            onClick={() => setEditorBoundaryEnabled(!form.boundary_enabled)}
                            className={`relative w-12 h-7 rounded-full flex-shrink-0 transition-colors ${
                              form.boundary_enabled ? 'bg-[var(--success)]' : 'bg-[var(--border)]'
                            }`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-surface rounded-full shadow transition-transform ${
                              form.boundary_enabled ? 'translate-x-5' : ''
                            }`} />
                          </button>
                          {/* Says out loud what the switch does, because "Save
                              Changes" sitting right below it invites the reading
                              that this is one more setting to save. It is not: it
                              goes to the row on tap. */}
                          <p className="text-[11px] text-[var(--muted-foreground)] mt-1 sm:mt-0 sm:ml-1">
                            Applied straight away — saving the terminal does not change it.
                          </p>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-[var(--muted)] rounded-xl">
                        <div className="flex min-w-0 items-center gap-3">
                          <TerminalIcon size={44} color={form.marker_color} className="flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--ink)]">Map Icon Color</p>
                            <p className="text-xs text-[var(--muted-foreground)]">
                              How this terminal appears on the location map
                            </p>
                          </div>
                        </div>
                        <ColorPicker
                          value={normalizeTerminalColor(form.marker_color)}
                          onChange={marker_color => setForm(f => ({ ...f, marker_color }))}
                          resetTo={DEFAULT_TERMINAL_COLOR}
                          label="Edit Color"
                        />
                      </div>

                      {/* The two plotted shapes. Each preview is drawn the way it
                          appears on the map — a stroke for the route, a fill with a
                          stroke for the border — so the choice is made against
                          something that looks like the result. */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-[var(--muted)] rounded-xl">
                        <div className="flex min-w-0 items-center gap-3">
                          <svg
                            viewBox="0 0 48 24"
                            width="48"
                            height="24"
                            aria-hidden="true"
                            className="flex-shrink-0"
                          >
                            <polyline
                              points="2,18 12,8 24,14 38,4 46,10"
                              fill="none"
                              stroke={normalizeRouteColor(form.route_color)}
                              strokeWidth="5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--ink)]">Route Color</p>
                            <p className="text-xs text-[var(--muted-foreground)]">
                              The road this terminal runs along
                            </p>
                          </div>
                        </div>
                        <ColorPicker
                          value={normalizeRouteColor(form.route_color)}
                          onChange={route_color => setForm(f => ({ ...f, route_color }))}
                          resetTo={DEFAULT_ROUTE_COLOR}
                          label="Edit Color"
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-[var(--muted)] rounded-xl">
                        <div className="flex min-w-0 items-center gap-3">
                          <svg
                            viewBox="0 0 48 24"
                            width="48"
                            height="24"
                            aria-hidden="true"
                            className="flex-shrink-0"
                          >
                            <polygon
                              points="4,19 14,5 36,3 45,15 22,21"
                              fill={normalizeBorderColor(form.border_color)}
                              fillOpacity="0.12"
                              stroke={normalizeBorderColor(form.border_color)}
                              strokeWidth="2.5"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--ink)]">Border Color</p>
                            <p className="text-xs text-[var(--muted-foreground)]">
                              The area enclosing that road
                            </p>
                          </div>
                        </div>
                        <ColorPicker
                          value={normalizeBorderColor(form.border_color)}
                          onChange={border_color => setForm(f => ({ ...f, border_color }))}
                          resetTo={DEFAULT_BORDER_COLOR}
                          label="Edit Color"
                        />
                      </div>

                      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-surface border-t border-[var(--border)]">
                        <button
                          type="button"
                          onClick={saveChangesFromPicker}
                          disabled={!hasUnsavedEditorChanges}
                          className="w-full h-12 bg-[var(--primary)] text-white text-sm font-bold rounded-xl active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
                        >
                          Save Changes
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Fares & Delivery. Everything a customer can buy at this terminal — the shared
              seat, the whole vehicle, and the delivery — in one place, because the
              dedicated Fares & Delivery page is a list of every terminal and the
              admin is usually already standing in this one. No header of its own:
              the editor's top bar carries the back button and the title. */}
          {editorSection === 'fares' && (
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-2xl p-4 space-y-4">
                {(() => {
                  const { errors } = validateEditor();
                  const field =
                    'border border-line h-11 px-4 rounded-xl text-sm outline-none focus:border-[var(--primary)]';
                  const invalid = 'border-[var(--error)]';

                  const money = (
                    key: 'base_fare' | 'per_km',
                    label: string,
                    hint: string,
                    placeholder: string,
                  ) => (
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] block mb-1">
                        {label}
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[var(--muted-foreground)] flex-shrink-0">₱</span>
                        <input
                          type="number"
                          min={0}
                          step="0.5"
                          inputMode="decimal"
                          value={form[key]}
                          placeholder={placeholder}
                          aria-invalid={!!errors[key]}
                          aria-label={label}
                          onChange={e =>
                            setForm(f => ({
                              ...f,
                              [key]: e.target.value === '' ? NaN : Number(e.target.value),
                            }))
                          }
                          className={`flex-1 min-w-0 px-3 rounded-xl ${field} ${errors[key] ? invalid : ''}`}
                        />
                      </div>
                      <p className="text-xs text-[var(--muted-foreground)] mt-1">{hint}</p>
                      {errors[key] && (
                        <p className="text-xs text-[var(--error)] mt-1">{errors[key]}</p>
                      )}
                    </div>
                  );

                  /*
                   * The optional fares, which have an empty state as well as a
                   * number. Blank is null, not 0, all the way to the database — so
                   * the box renders null as an empty string and parses "" straight
                   * back to null rather than through Number(), which would make the
                   * empty box look like an error and block the save.
                   */
                  type OptionalFareField =
                    | 'private_ride_fee' | 'private_ride_fee_per_km'
                    | 'delivery_fee' | 'delivery_fee_per_km';

                  const optionalMoney = (
                    key: OptionalFareField,
                    label: string,
                    hint: string,
                    placeholder: string,
                    disabled = false,
                  ) => (
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] block mb-1">
                        {label}
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[var(--muted-foreground)] flex-shrink-0">₱</span>
                        <input
                          type="number"
                          min={0}
                          step="0.5"
                          inputMode="decimal"
                          value={form[key] ?? ''}
                          placeholder={placeholder}
                          disabled={disabled}
                          aria-invalid={!!errors[key]}
                          aria-label={label}
                          onChange={e =>
                            setForm(f => ({
                              ...f,
                              [key]: e.target.value === '' ? null : Number(e.target.value),
                            }))
                          }
                          className={`flex-1 min-w-0 px-3 rounded-xl ${field} ${errors[key] ? invalid : ''} disabled:opacity-50`}
                        />
                      </div>
                      <p className="text-xs text-[var(--muted-foreground)] mt-1">{hint}</p>
                      {errors[key] && (
                        <p className="text-xs text-[var(--error)] mt-1">{errors[key]}</p>
                      )}
                    </div>
                  );

                  const fareGroup = (
                    title: string,
                    blurb: string,
                    Icon: typeof Car,
                    children: ReactNode,
                  ) => (
                    <div className="p-3 bg-[var(--muted)] rounded-xl">
                      <div className="flex items-start gap-2.5 mb-3">
                        <Icon className="mt-0.5 w-4 h-4 flex-shrink-0 text-[var(--primary)]" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
                          <p className="text-xs text-[var(--muted-foreground)]">{blurb}</p>
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
                    </div>
                  );

                  return (
                    <>
                      <p className="text-sm text-[var(--muted-foreground)]">
                        Pricing for {form.name || 'this terminal'}.
                      </p>

                      {fareGroup(
                        'Share Ride',
                        'One seat, split with whoever else is going your way.',
                        Users,
                        <>
                          {money(
                            'base_fare',
                            'Base Fare',
                            'Charged once when a ride starts, before distance.',
                            '20',
                          )}
                          {money(
                            'per_km',
                            'Fare per km',
                            'Added on top of the base fare for each kilometre travelled.',
                            '10',
                          )}
                        </>,
                      )}

                      {/* Neither of these has a column on every database yet, and
                          PostgREST rejects the whole upsert over one missing column.
                          Rather than let that silently cost every other edit on this
                          screen, the ones we could not find are disabled and named —
                          the same treatment the Fares & Delivery page gives them. */}
                      {fareGroup(
                        'Private Ride',
                        'The whole vehicle, booked by one person.',
                        Car,
                        <>
                          {optionalMoney(
                            'private_ride_fee',
                            'Price',
                            'Leave empty to charge the share ride base fare.',
                            'Same as share',
                            !fareColumns.privateRide,
                          )}
                          {optionalMoney(
                            'private_ride_fee_per_km',
                            'Price per km',
                            'Leave empty to charge the share ride per-km rate.',
                            'Same as share',
                            !fareColumns.privateRide,
                          )}
                        </>,
                      )}

                      {fareGroup(
                        'Delivery',
                        'Riding a rider to a shop’s customer with their order.',
                        Truck,
                        <>
                          {optionalMoney(
                            'delivery_fee',
                            'Price',
                            'Leave empty to use the platform default.',
                            'Platform default',
                            !fareColumns.delivery,
                          )}
                          {optionalMoney(
                            'delivery_fee_per_km',
                            'Price per km',
                            'Leave empty to charge a flat delivery fee.',
                            'Flat fee',
                            !fareColumns.delivery,
                          )}
                        </>,
                      )}

                      {(!fareColumns.privateRide || !fareColumns.delivery) && (
                        <p className="text-xs text-[var(--amber-ink)] bg-[var(--amber-soft)] rounded-xl p-3">
                          {[
                            !fareColumns.privateRide ? 'ADD_TERMINAL_PRIVATE_RIDE_FEE.sql' : null,
                            !fareColumns.delivery ? 'ADD_TERMINAL_DELIVERY_AND_CAPACITY.sql' : null,
                          ]
                            .filter(Boolean)
                            .join(' and ')}{' '}
                          has not been run, so the boxes above cannot be saved. Every
                          other field on this terminal still saves.
                        </p>
                      )}

                      {/* Seats and capacity are per terminal too, but they belong to
                          the platform's own limits rather than to a fare, and they
                          are edited alongside every other terminal there. */}
                      <button
                        type="button"
                        onClick={() => { closeMapPicker(); navigate('/admin/fares'); }}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-bold text-[var(--ink)]"
                      >
                        Seats and every terminal’s pricing on the Fares &amp; Delivery page
                      </button>

                      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-surface border-t border-[var(--border)]">
                        <button
                          type="button"
                          onClick={saveChangesFromPicker}
                          disabled={!hasUnsavedEditorChanges}
                          className="w-full h-12 bg-[var(--primary)] text-white text-sm font-bold rounded-xl active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
                        >
                          Save Changes
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
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
