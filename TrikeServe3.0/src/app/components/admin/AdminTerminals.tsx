import { useState, useEffect, useMemo, useRef, useCallback, Fragment as ReactFragment, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import {
  Plus, Edit2, Trash2, UserPlus, UserMinus, MapPin, MapPinned, Users, Menu, X, Navigation, Search, Loader2, Save, Shield,
  ClipboardCheck, Clock, ShieldCheck, ChevronDown, ArrowLeft,
  ChevronLeft, ChevronRight, Pentagon, Milestone, SlidersHorizontal, Banknote,
  Undo2, Redo2, Eraser, RefreshCw, Filter,
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
  setDriverTerminalAdmin,
  getAdminTerminalAssignment,
  normalizeBoundaryRoad,
  normalizeBoundaryArea,
  normalizeRoadWidth,
  DEFAULT_ROAD_WIDTH_M,
  logAudit,
  APPROVAL_REQUEST_LABELS,
  type ApprovalRequest,
  type LatLngPoint,
} from "../../../lib/supabase";
import ConfirmationModal from "../ui/confirmation-modal";
import Toast from "../ui/Toast";
import AdminShell from "./AdminShell";
import { AdminMetricCards } from "./AdminPageIntro";
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
import {
  DEFAULT_ROUTE_BUFFER_M,
  formatRouteDistance,
  legacyRouteFromBoundary,
  mirrorFirstRoute,
  newRouteId,
  normalizeTerminalRoutes,
  routeDistanceMeters,
  routesEqual,
  type TerminalRoute,
} from "../../../lib/terminalRoutes";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// Default centre for a new terminal's location / boundary picker — Gen T Deleon,
// Valenzuela City (same point the customer/business map selectors default to).
const DEFAULT_TERMINAL_CENTER = { lat: 14.7244, lng: 120.9668 };

// The Map Editor's opening view. A module constant rather than an inline literal
// for the same reason as the editor's map centre: a new object on every render
// makes the library re-centre, which yanked the camera back whenever the admin
// toggled a terminal's visibility.
const OVERVIEW_CENTER = { lat: 14.6867, lng: 120.9950 };

// Bounds the road corridor input accepts. Mirrored by the validator so a value
// typed, pasted or nudged into the field can't slip past the checks.
const MIN_ROAD_WIDTH_M = 20;
const MAX_ROAD_WIDTH_M = 2000;

// Named in save errors, because a missing column fails the whole upsert and would
// otherwise look like the admin's edits simply weren't sticking.
const MIGRATION_HINT = 'ADD_TERMINAL_ROAD_BOUNDARY.sql / ADD_TERMINAL_BORDER_AREA.sql / ADD_TERMINAL_MARKER_COLOR.sql / ADD_TERMINAL_SHAPE_COLORS.sql / ADD_TERMINAL_PRIVATE_RIDE_FEE.sql / ADD_TERMINAL_DELIVERY_AND_CAPACITY.sql / ADD_TERMINAL_BASE_DISTANCE.sql';

// How often a Rider Admin re-reads their terminal scope, so a Super Admin's
// unassignment takes effect on a screen that is already open.
const ASSIGNMENT_POLL_MS = 15000;

/**
 * How long the tab guide stays up before it gets out of the way.
 *
 * Long enough to read the two short lines it actually shows, short enough that
 * a panel sliding in over the map is never in the way while plotting a road.
 */
const GUIDE_AUTO_HIDE_MS = 3000;

/**
 * The one section this page is split into.
 *
 * It used to be three: Assignments, Terminals and a Map Editor overview. The
 * Assignments directory already lists every terminal with its drivers, its
 * admin and its shape, and tapping one opens that terminal's editor — so the
 * other two became a second route to the same thing, reached by a tab that had
 * to be kept in step with a directory that said all of it already.
 *
 * The work did not go away, it moved: the per-terminal cards and their cogs are
 * now rows in the directory, and the network map is the editor's Toda tab.
 */
type TerminalView = 'assignments';

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
  /*
   * Every road this terminal runs, each with its own corridor width.
   * boundary_polygon above is the mirror of the first of these — the drop-off
   * and delivery checks read that column, so the app keeps it in step on every
   * save (ADD_TERMINAL_ROUTES.sql).
   */
  routes: TerminalRoute[];
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
  base_fare_included_km?: number | null;
  per_km: number;
  // Hex colour for this terminal's icon on the Map Editor map
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
  private_ride_fee_included_km?: number | null;
  private_ride_fee_per_km?: number | null;
  delivery_fee?: number | null;
  delivery_fee_included_km?: number | null;
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
  /** The Super Admin made this driver the admin of the terminal above. */
  isTerminalAdmin?: boolean;
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

/**
 * A driver's name, whichever shape the row carries.
 *
 * At module scope because the Assignments directory and the per-terminal driver
 * picker both need it, and a second copy of "name, else first+last, else
 * 'Driver'" is a second place for the fallback to drift.
 */
function riderDisplayName(r: StoredRider): string {
  if (r.name) return r.name;
  const first = (r.first_name as string) || "";
  const last = (r.last_name as string) || "";
  if (first || last) return `${first} ${last}`.trim();
  return "Driver";
}

/**
 * Two letters for a driver's avatar.
 *
 * From the name where there is one, taking the first letter of the first two
 * words ("Juan Dela Cruz" -> JD), so the initials say who it is rather than
 * repeating the first name twice. Falls back to the email's own initials for
 * the accounts that never filled in a name.
 */
function driverInitials(r: StoredRider): string {
  const words = (r.name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (r.email || '?').slice(0, 2).toUpperCase();
}

/** Everything about a driver that a search should be able to match on. */
function driverSearchText(r: StoredRider): string {
  return [r.name, r.email, r.todaPlate || r.toda_plate]
    .filter(v => typeof v === 'string' && v)
    .join(' ')
    .toLowerCase();
}

/**
 * Whether a users row is one of this platform's drivers.
 *
 * Keyed off the driver's own fields, deliberately *not* off `role`.
 *
 * `users.role` is not a stable statement about what somebody is — it is the app
 * they are currently in. `switchUiRole` rewrites it: a driver inside the admin
 * app is role = 'admin', and one who has opened the customer app is
 * role = 'customer'. So any roster filtered on `role = 'rider'` quietly loses
 * exactly the drivers who are using another app, and a driver-admin loses them
 * twice over, because the flag that held them in was the very thing taking them
 * off a terminal clears.
 *
 * The plate and the licence number are what do not change: nobody switches app
 * and loses their TODA plate. Both spellings are read because the mock and
 * localStorage rows predate the snake_case columns.
 */
function isDriverRow(u: StoredRider): boolean {
  if (u.role === 'rider') return true;
  return !!(u.todaPlate || u.toda_plate || u.licenseNumber || u.license_number);
}

type DriverPickerProps = {
  /** The TODA this picker adds to, named in the field's own label. */
  terminalName: string;
  /** Drivers without a terminal assignment. */
  candidates: StoredRider[];
  onPick: (rider: StoredRider) => void;
};

/**
 * Add or move a driver to one TODA.
 *
 * A custom list rather than a native <select>, because the reason this exists
 * is that a terminal can have more drivers than a dropdown can usefully show:
 * a native select offers no way to narrow fifty names down to one, and the
 * Super Admin ends up scrolling to spot a spelling. The search field is the
 * point of the control, so it takes focus as the list opens.
 *
 * Drivers already assigned to a terminal are omitted from the candidates.
 */
function DriverPicker({ terminalName, candidates, onPick }: DriverPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Closed by a tap anywhere else, and by Escape. `pointerdown` rather than
  // `click`, so a tap that began outside never gets delivered to an option it
  // was not aimed at — which would add the wrong driver to a terminal.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  // The query is cleared on close rather than kept, so the next open starts
  // from the whole list instead of the previous terminal's narrowed-down one.
  useEffect(() => {
    if (isOpen) searchRef.current?.focus();
    else setQuery('');
  }, [isOpen]);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? candidates.filter(r => driverSearchText(r).includes(needle))
    : candidates;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(open => !open)}
        className="w-full min-h-11 flex items-center gap-2 px-3.5 py-2.5 border border-line rounded-xl bg-card text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--teal)]"
      >
        <Plus size={16} className="flex-shrink-0 text-[var(--teal)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-left break-words">Add a driver to {terminalName}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`flex-shrink-0 text-[var(--muted-foreground)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-30 left-0 right-0 mt-1.5 rounded-xl border border-line bg-surface shadow-lg overflow-hidden">
          <div className="p-2 border-b border-line">
            <div className="relative">
              <Search
                size={15}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search name, email or plate"
                aria-label={`Search drivers to add to ${terminalName}`}
                className="w-full pl-9 pr-3 py-2 border border-line rounded-lg bg-[var(--muted)] text-sm text-[var(--ink)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--teal)] focus:outline-none"
              />
            </div>
          </div>

          <ul role="listbox" aria-label={`Drivers available for ${terminalName}`} className="max-h-64 overflow-y-auto">
            {matches.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-[var(--muted-foreground)] italic">
                {candidates.length === 0
                  ? 'No unassigned drivers available'
                  : `No driver matches “${query.trim()}”`}
              </li>
            ) : (
              matches.map(rider => (
                <li key={rider.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    onClick={() => {
                      setIsOpen(false);
                      onPick(rider);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--soft)]"
                  >
                    <span className="w-8 h-8 flex-shrink-0 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)] flex items-center justify-center text-[11px] font-bold">
                      {driverInitials(rider)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[var(--ink)] truncate">
                        {riderDisplayName(rider)}
                      </span>
                      <span className="block text-xs text-[var(--muted-foreground)] truncate">
                        {rider.todaPlate || rider.toda_plate || rider.email}
                      </span>
                    </span>
                    {rider.isTerminalAdmin ? (
                      <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-[var(--teal-soft)] text-[var(--teal)] text-[10px] font-bold">
                        Admin
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
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
  // Which driver's admin flag is mid-write, so only that row shows the spinner.
  const [savingAdminFlagId, setSavingAdminFlagId] = useState<string | null>(null);

  const [terminals, setTerminals] = useState<Terminal[]>(getStoredTerminals());
  // true until the first Supabase round-trip resolves, so the page can show a
  // skeleton instead of a half-populated list.
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [terminalQuery, setTerminalQuery] = useState('');
  const [directoryFilter, setDirectoryFilter] = useState<'all' | 'needs-admin' | 'active' | 'inactive'>('all');
  const [users, setUsers] = useState<StoredRider[]>(getAllUsers());
  const [editTerminal, setEditTerminal] = useState<Terminal | null>(null);
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
    // Every road this terminal runs, in plot order. The Route section is where
    // these are drawn; `boundary_polygon` above is the mirror of the first one,
    // kept in step on save because the drop-off and delivery checks read it.
    routes: [] as TerminalRoute[],
    // Which of those roads the map is drawing into.
    activeRouteId: null as string | null,
    road_width_m: DEFAULT_ROAD_WIDTH_M,
    boundary_enabled: true,
    // This terminal's own ride fare, editable by the terminal admin.
    base_fare: 20,
    base_fare_included_km: 1,
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
    private_ride_fee_included_km: null as number | null,
    private_ride_fee_per_km: null as number | null,
    delivery_fee: null as number | null,
    delivery_fee_included_km: 1,
    delivery_fee_per_km: null as number | null,
  });
  const [showMapPicker, setShowMapPicker] = useState(false);
  /*
   * Which part of the terminal the editor is on, as one value rather than a
   * "page" plus a "map mode" — they were the same choice split in two, and the
   * two could disagree. 'configuration' is the only section with no map.
   */
  const [editorSection, setEditorSection] = useState<
    'terminal' | 'border' | 'route' | 'toda' | 'configuration' | 'fares'
  >('terminal');
  /**
   * Which sections are the map, and therefore the only ones that plot points.
   *
   * Read in three places -- the top bar (search only makes sense over a map),
   * the map itself, and the sections that replace it -- so it is derived once
   * here rather than re-tested as a three-way comparison at each.
   *
   * 'toda' is deliberately not one of them. It is an index of the terminals
   * rather than a way of drawing one, so the editor map must not be on screen
   * there: a tap on it would fall through to the location picker and quietly
   * move whichever terminal the editor happened to be open on.
   */
  const editorSectionIsMap =
    editorSection === 'terminal' || editorSection === 'border' || editorSection === 'route';

  /**
   * Which sections put a map on screen — a wider set than the three that draw.
   *
   * 'toda' shows one too, because an index you can only read as text is an
   * index of a map: it is the whole point of seeing where six terminals sit
   * relative to each other.
   *
   * Kept separate from `editorSectionIsMap` precisely so the two cannot be
   * confused. Showing a map is not permission to plot on it — `toda` is not in
   * the flag above, so its taps go to selecting a terminal rather than dropping
   * a point into whichever terminal the editor happens to be open on.
   */
  const editorSectionShowsMap = editorSectionIsMap || editorSection === 'toda';
  // Collapses the editor's sidebar to icons alone, handing the width back to the
  // map without losing the way out of a section.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  /*
   * Roads hidden from the editor's map with the eye button.
   *
   * Per editor session and never saved: hiding one is a way of plotting a second
   * road without the first drawn straight through the middle of it. Persisting it
   * would mean reopening the editor to find a road silently missing.
   */
  const [editorHiddenRouteIds, setEditorHiddenRouteIds] = useState<string[]>([]);

  // Which route has its name open for editing.
  const [renamingRouteId, setRenamingRouteId] = useState<string | null>(null);
  /*
   * The how-to guide, folded behind the "?" on the map.
   *
   * It used to be the panel itself — a card of instruction text parked over the
   * top of the map for the whole visit, saying what to tap after the admin had
   * already been tapping it. The steps are read once and then never again, so the
   * guide is a reference to open, not a step to take: closed by default.
   */
  const [guideOpen, setGuideOpen] = useState(false);
  // The pending auto-hide. Held in a ref rather than state because nothing
  // renders from it — it only has to be cancellable, and a re-render should not
  // be able to resurrect a timer that has already fired.
  const guideTimerRef = useRef<number | null>(null);

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
  const [boundaryPast, setBoundaryPast] = useState<{ routes: TerminalRoute[]; area: LatLngPoint[] }[]>([]);
  const [boundaryFuture, setBoundaryFuture] = useState<{ routes: TerminalRoute[]; area: LatLngPoint[] }[]>([]);
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
    routes: TerminalRoute[];
    area: LatLngPoint[];
    name: string;
    boundary: string;
    road_width_m: number;
    is_active: boolean;
    marker_color: string;
    route_color: string;
    border_color: string;
    base_fare: number;
    base_fare_included_km: number;
    per_km: number;
    private_ride_fee: number | null;
    private_ride_fee_included_km: number | null;
    private_ride_fee_per_km: number | null;
    delivery_fee: number | null;
    delivery_fee_included_km: number;
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
      routes: f.routes.map(r => ({ ...r, points: [...r.points] })),
      area: [...f.boundary_area],
      name: f.name,
      boundary: f.boundary,
      road_width_m: f.road_width_m,
      is_active: f.is_active,
      marker_color: normalizeTerminalColor(f.marker_color),
      route_color: normalizeRouteColor(f.route_color),
      border_color: normalizeBorderColor(f.border_color),
      base_fare: f.base_fare,
      base_fare_included_km: f.base_fare_included_km,
      per_km: f.per_km,
      private_ride_fee: f.private_ride_fee,
      private_ride_fee_included_km: f.private_ride_fee_included_km,
      private_ride_fee_per_km: f.private_ride_fee_per_km,
      delivery_fee: f.delivery_fee,
      delivery_fee_included_km: f.delivery_fee_included_km,
      delivery_fee_per_km: f.delivery_fee_per_km,
    };
  }

  /** Seeds the form and opens the editor on it, with a snapshot taken at the same value. */
  function openEditorWith(next: typeof form) {
    setForm(next);
    setEditorSnapshot(snapshotFrom(next));
    setEditorSection('terminal');
    setSidebarCollapsed(window.matchMedia('(max-width: 767px)').matches);
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
      !routesEqual(form.routes, editorSnapshot.routes) ||
      !samePoints(form.boundary_area, editorSnapshot.area) ||
      form.name !== editorSnapshot.name ||
      form.boundary !== editorSnapshot.boundary ||
      form.road_width_m !== editorSnapshot.road_width_m ||
      form.is_active !== editorSnapshot.is_active ||
      normalizeTerminalColor(form.marker_color) !== editorSnapshot.marker_color ||
      normalizeRouteColor(form.route_color) !== editorSnapshot.route_color ||
      normalizeBorderColor(form.border_color) !== editorSnapshot.border_color ||
      Number(form.base_fare) !== editorSnapshot.base_fare ||
      Number(form.base_fare_included_km) !== editorSnapshot.base_fare_included_km ||
      Number(form.per_km) !== editorSnapshot.per_km ||
      form.private_ride_fee !== editorSnapshot.private_ride_fee ||
      form.private_ride_fee_included_km !== editorSnapshot.private_ride_fee_included_km ||
      form.private_ride_fee_per_km !== editorSnapshot.private_ride_fee_per_km ||
      form.delivery_fee !== editorSnapshot.delivery_fee ||
      Number(form.delivery_fee_included_km) !== editorSnapshot.delivery_fee_included_km ||
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
    routes: form.routes,
    area: form.boundary_area,
  });

  // Every edit to either shape goes through commitBoundary, so undo/redo can't
  // miss one. It records both shapes as they stand and applies `next`, and drops
  // any redo branch — editing after an undo starts a new one.
  function commitBoundary(next: Partial<{ routes: TerminalRoute[]; area: LatLngPoint[] }>) {
    setBoundaryPast(p => [...p, boundaryNow()].slice(-BOUNDARY_HISTORY_MAX));
    setBoundaryFuture([]);
    setForm(f => ({
      ...f,
      ...(next.routes ? { routes: next.routes } : {}),
      ...(next.area ? { boundary_area: next.area } : {}),
    }));
  }

  /**
   * Keep the selection pointing at a route that exists.
   *
   * Undoing an "Add route" — or stepping back over a deletion — can restore a
   * list the selected id is no longer in. Left alone, the editor would sit with
   * no route selected: the map would draw every road at the same weight, taps
   * would have nothing to join, and the panel would say nothing at all.
   */
  function keepActiveRoute(currentId: string | null, routes: TerminalRoute[]): string | null {
    return routes.some(r => r.id === currentId) ? currentId : routes[0]?.id ?? null;
  }

  function undoBoundary() {
    if (boundaryPast.length === 0) return;
    const previous = boundaryPast[boundaryPast.length - 1];
    setBoundaryPast(p => p.slice(0, -1));
    setBoundaryFuture(future => [boundaryNow(), ...future].slice(0, BOUNDARY_HISTORY_MAX));
    setForm(f => ({
      ...f,
      routes: previous.routes,
      activeRouteId: keepActiveRoute(f.activeRouteId, previous.routes),
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
      routes: next.routes,
      activeRouteId: keepActiveRoute(f.activeRouteId, next.routes),
      boundary_area: next.area,
    }));
  }

  // Opening a different terminal starts fresh shapes, so it also starts a
  // fresh history — otherwise Redo could walk back into another terminal's area.
  function resetBoundaryHistory() {
    setBoundaryPast([]);
    setBoundaryFuture([]);
    setEditorHiddenRouteIds([]);
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

  // The one view this page has, kept as state rather than inlined so the section
// guard reads the same way it did when there were three.
  const [terminalView] = useState<TerminalView>('assignments');

  /**
   * Which optional fare columns this database actually has.
   *
   * Two flags, not one: the private ride columns and the delivery/capacity
   * columns came from separate migrations and a project is routinely between
   * them. PostgREST rejects the *whole* upsert over one absent column, so sending
   * them blind would turn a partially-migrated database into a terminal editor
   * that cannot save anything at all.
   */
  const [fareColumns, setFareColumns] = useState({ delivery: true, privateRide: true, baseDistance: true });

  /**
   * Whether this database has `users.is_terminal_admin` yet
   * (ADD_TERMINAL_ADMIN_FLAG.sql). Same two-states-one-flag problem as the fare
   * columns, and the same failure if it is guessed wrong: the flag is written
   * alongside a driver unassignment, so an absent column would take that down
   * with it.
   */
  const [terminalAdminColumn, setTerminalAdminColumn] = useState(true);

  // Load from Supabase when available; fall back to localStorage data otherwise.
  useEffect(() => {
    loadData();
    loadMyRequests();
    loadMyAssignment();
    probeFareColumns();
    probeTerminalAdminColumn();
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
    setLoadError(null);
    try {
      const [dbTerminals, dbRiders] = await Promise.all([
        loadTerminalsFromSupabase(),
        loadRidersFromSupabase(),
      ]);
      if (dbTerminals) setTerminals(dbTerminals);
      if (dbRiders) setUsers(dbRiders);
      if (dbTerminals === null || dbRiders === null) {
        setLoadError('Some terminal or driver data could not be refreshed. Previously available data is still shown.');
      } else {
        setLastUpdated(new Date());
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadTerminalsFromSupabase(): Promise<Terminal[] | null> {
    try {
      const { data, error } = await supabase.from("terminals").select("*");
      if (error || !data) return null;
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
        // Every road this terminal runs. Stored as read; a row whose only road is
        // in the legacy column is filled in when the editor opens it.
        routes: normalizeTerminalRoutes(t.routes),
        boundary_area: normalizeBoundaryArea(t.boundary_area),
        road_width_m: normalizeRoadWidth(t.road_width_m),
        boundary_enabled: t.boundary_enabled !== false,
        base_fare: t.base_fare ?? 20,
        base_fare_included_km: t.base_fare_included_km ?? 1,
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
        private_ride_fee_included_km: t.private_ride_fee_included_km ?? null,
        private_ride_fee_per_km: t.private_ride_fee_per_km ?? null,
        delivery_fee: t.delivery_fee ?? null,
        delivery_fee_included_km: t.delivery_fee_included_km ?? 1,
        delivery_fee_per_km: t.delivery_fee_per_km ?? null,
      }));
    } catch {
      return null;
    }
  }

  async function loadRidersFromSupabase(): Promise<StoredRider[] | null> {
    try {
      // Every user, narrowed in the client rather than in the query. A role
      // filter here would drop any driver currently inside another app — the
      // admin app, or the customer one — and a driver who is not sitting in the
      // driver app is still a driver who needs a terminal. The table is a
      // fleet list, not a log, so reading it whole is cheap.
      const { data, error } = await supabase
        .from("users")
        .select("*");
      if (error || !data) return null;
      return data
        .filter(isDriverRow)
        .map((u: any) => ({
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
          // `select *` returns whatever exists, so a database that has not run
          // ADD_TERMINAL_ADMIN_FLAG.sql simply has no value here -- and nobody
          // is an admin, which is the right reading of "the column isn't there".
          isTerminalAdmin: u.is_terminal_admin ?? false,
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

    if (terminal_id) {
      setAssignedTerminalId(terminal_id);
      setAssignedTerminalName(terminal_name);
      return;
    }

    // A driver who was made admin of a terminal has no row in `admins` at all --
    // their scope lives on their own profile, and that is the one that decides
    // what they can reach. Falling through to "no terminal assigned" here would
    // show them an empty admin app despite the Super Admin having named them.
    if (user.isTerminalAdmin && user.terminalId) {
      setAssignedTerminalId(user.terminalId);
      setAssignedTerminalName(user.terminalName ?? null);
      return;
    }

    setAssignedTerminalId(null);
    setAssignedTerminalName(null);
  }

  /**
   * Whether this database has the terminal-admin flag yet.
   *
   * Probed, not assumed, and for the same reason the fare columns are: PostgREST
   * rejects the *whole* statement over one absent column, so an un-migrated
   * database would refuse to unassign a driver from a terminal at all -- the
   * feature would break something that already worked in order to add something
   * that does not. Starts optimistic and is only ever turned off.
   */
  async function probeTerminalAdminColumn() {
    const { error } = await supabase.from('users').select('id, is_terminal_admin').limit(1);
    if (error) setTerminalAdminColumn(false);
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
        setFareColumns(previous => ({ ...previous, delivery: attempt.delivery, privateRide: attempt.privateRide }));
        break;
      }
    }

    const { error: distanceError } = await supabase
      .from('terminals')
      .select('id, base_fare_included_km, private_ride_fee_included_km, delivery_fee_included_km')
      .limit(1);
    setFareColumns(previous => ({ ...previous, baseDistance: !distanceError }));
  }

  /**
   * Super Admin: make this driver the admin of their terminal, or take it back.
   *
   * Optimistic like the driver assignment below it, and rolled back the same
   * way — the toggle is the fastest thing on this page to tap, so a row that
   * quietly refused to change would read as the app ignoring them.
   */
  async function applyDriverTerminalAdmin(rider: StoredRider, makeAdmin: boolean) {
    const previous = !!rider.isTerminalAdmin;
    const terminal = terminals.find(t => t.id === riderTerminalId(rider)) || null;

    setUsers(list =>
      list.map(u => (u.id === rider.id ? { ...u, isTerminalAdmin: makeAdmin } : u))
    );

    setSavingAdminFlagId(rider.id);
    const result = await setDriverTerminalAdmin(
      rider.id,
      makeAdmin,
      riderTerminalId(rider) ?? null,
      riderTerminalName(rider) ?? null
    );
    setSavingAdminFlagId(null);

    if (!result.success) {
      setUsers(list =>
        list.map(u => (u.id === rider.id ? { ...u, isTerminalAdmin: previous } : u))
      );
      setToast({ message: `Could not update ${riderName(rider)}: ${result.error}`, variant: 'error' });
      return;
    }

    logAudit({
      action: 'assign_toda_admin',
      actorRole: 'admin',
      entityType: 'driver',
      entityId: rider.id,
      summary: makeAdmin
        ? `Made ${riderName(rider)} admin of ${terminal?.name ?? 'their terminal'}`
        : `Removed ${riderName(rider)} as admin of ${terminal?.name ?? 'their terminal'}`,
      details: {
        driver_id: rider.id,
        terminal_id: terminal?.id ?? null,
        terminal_name: terminal?.name ?? null,
        is_terminal_admin: makeAdmin,
      },
      actorEmail: user?.email,
      actorName: user?.name,
    });

    setToast({
      message: makeAdmin
        ? `${riderName(rider)} can now open the Admin app for ${terminal?.name ?? 'their terminal'}`
        : `${riderName(rider)} is no longer a TODA admin`,
      variant: makeAdmin ? 'success' : 'warning',
    });
  }

  // Confirm before changing someone's admin access — the toggle only moves
  // after the Super Admin actually accepts.
  function confirmDriverTerminalAdmin(rider: StoredRider, makeAdmin: boolean) {
    const terminal = terminals.find(t => t.id === riderTerminalId(rider)) || null;
    const label = riderName(rider);

    // Admin of nothing is not a state this app can act on: there would be no
    // terminal to scope them to, so the switch in their profile would either do
    // nothing or point somewhere they do not drive out of.
    if (makeAdmin && !terminal) {
      setToast({
        message: `Assign ${label} to a terminal first — admin access is scoped to one TODA`,
        variant: 'warning',
      });
      return;
    }

    openModal({
      title: makeAdmin ? 'Make TODA Admin' : 'Remove Admin Access',
      message: makeAdmin
        ? `Let ${label} open the Admin app for ${terminal?.name}? They will be able to edit that terminal and queue its drivers, and their changes still need your approval.`
        : `Take admin access to ${terminal?.name ?? 'their terminal'} away from ${label}? They will go back to being an ordinary driver on it.`,
      variant: makeAdmin ? 'success' : 'warning',
      confirmLabel: makeAdmin ? 'Make Admin' : 'Remove',
      onConfirm: async () => {
        closeModal();
        await applyDriverTerminalAdmin(rider, makeAdmin);
      },
    });
  }

  /*
   * Everyone who can be put on a terminal.
   *
   * `isDriverRow`, not `role === 'rider'` — see there for why the role cannot
   * answer this. Keeping the filter in one place also means a driver who is
   * currently in the admin or customer app is still offered on a terminal, so
   * nobody silently goes missing from the roster just for using another app.
   */
  const riders = users.filter(isDriverRow);

  const riderTerminalId = (r: StoredRider) => r.terminalId || r.terminal_id;
  const riderTerminalName = (r: StoredRider) => r.terminalName || r.terminal_name;
  /** A driver's TODA plate, whichever casing the row carries it in. */
  const riderPlate = (r: StoredRider) => r.todaPlate || r.toda_plate || "";
  // Users are stored with `name` in this app and `first_name`/`last_name` in
  // older/mock data — support both so existing localStorage isn't broken. The
  // fallback itself lives at module scope, next to the driver picker that needs
  // the same answer.
  const riderName = riderDisplayName;

  function getRidersForTerminal(tid: string) {
    return riders.filter(r => riderTerminalId(r) === tid);
  }

  function getUnassignedRiders() {
    return riders.filter(r => !riderTerminalId(r));
  }

  /**
   * Which terminals are open in the TODA directory, which is the whole page now.
   *
   * Its own list rather than a single id because the directory shows every
   * terminal at once, and comparing two of them means having both open.
   */
  const [openTerminalIds, setOpenTerminalIds] = useState<string[]>([]);
  const toggleTerminalOpen = (id: string) =>
    setOpenTerminalIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));

  // A Rider Admin only ever sees the terminal they are scoped to.
  const visibleTerminals = isRiderAdmin
    ? terminals.filter(t => t.id === assignedTerminalId)
    : terminals;

  /**
   * The drivers the Super Admin has made admin of a terminal.
   *
   * The people who run the network, which is what this section is about — not
   * the whole driver roster. Both halves have to hold for the switch in their
   * profile to do anything: the flag, and a terminal to be scoped to.
   */
  const todaAdmins = riders.filter(r => r.isTerminalAdmin);

  /** Keep admin assignment counts separate from terminal staffing coverage. */
  const assignedAdminCount = todaAdmins.filter(a => !!riderTerminalId(a)).length;
  const unassignedAdminCount = todaAdmins.length - assignedAdminCount;

  /**
   * Terminals with admins on them, busiest first.
   *
   * Terminals nobody administers are deliberately absent rather than shown at
   * zero: this list answers "where does the team already reach?", and a terminal
   * nobody is assigned to has not been reached yet. The gap is already reported
   * by the coverage ring, which counts it without naming it.
   */
  const terminalsWithAdmins = terminals
    .map(t => ({
      terminal: t,
      count: todaAdmins.filter(a => riderTerminalId(a) === t.id).length,
    }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count || a.terminal.name.localeCompare(b.terminal.name));

  // Terminal coverage answers how much of the network has an admin, not how
  // many already-designated admins have a terminal assignment.
  const terminalsWithoutAdmins = terminals.length - terminalsWithAdmins.length;
  const terminalCoverage = terminals.length === 0 ? 0 : Math.round(terminalsWithAdmins.length / terminals.length * 100);
  const directoryTerminals = terminals.filter(t => {
    const roster = getRidersForTerminal(t.id);
    const matchesQuery = [t.name, t.boundary, ...roster.map(driverSearchText)]
      .filter(Boolean).join(' ').toLowerCase().includes(terminalQuery.trim().toLowerCase());
    const matchesFilter = directoryFilter === 'all'
      || (directoryFilter === 'active' && t.is_active)
      || (directoryFilter === 'inactive' && !t.is_active)
      || (directoryFilter === 'needs-admin' && !todaAdmins.some(a => riderTerminalId(a) === t.id));
    return matchesQuery && matchesFilter;
  }).sort((a, b) => a.name.localeCompare(b.name));

  /** Drivers on the Rider Admin's own terminal — the one figure they can act on. */
  const assignedRiderCount = assignedTerminalId
    ? getRidersForTerminal(assignedTerminalId).length
    : 0;

  /**
   * Open another terminal but stay on the section that opened it.
   *
   * `openEdit` returns the editor to the Terminal section, which is right when
   * the Map Editor hands you a terminal and wrong from the Toda index: that
   * index is for looking at several terminals at once, so a tap that threw you
   * out of it meant the list could only ever be read one row at a time.
   */
  function openEditKeepingSection(t: Terminal, section: typeof editorSection) {
    openEdit(t);
    setEditorSection(section);
  }

  function openCreate() {
    setEditTerminal(null);
    setEditorSection('terminal');
    resetBoundaryHistory();
    openEditorWith({
      name: "", boundary: "",
      center_lat: DEFAULT_TERMINAL_CENTER.lat, center_lng: DEFAULT_TERMINAL_CENTER.lng,
      is_active: true,
      boundary_polygon: [], boundary_area: [],
      routes: [], activeRouteId: null,
      road_width_m: DEFAULT_ROAD_WIDTH_M, boundary_enabled: true,
      base_fare: 20, base_fare_included_km: 1, per_km: 10,
      marker_color: DEFAULT_TERMINAL_COLOR,
      route_color: DEFAULT_ROUTE_COLOR,
      border_color: DEFAULT_BORDER_COLOR,
      // Left unset on purpose: a new terminal inherits the share ride rate for a
      // private ride and the platform default for delivery until an admin says
      // otherwise.
      private_ride_fee: null,
      private_ride_fee_included_km: null,
      private_ride_fee_per_km: null,
      delivery_fee: null,
      delivery_fee_included_km: 1,
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
      // Read through readTerminalRoutes so a road that only exists in the legacy
      // column opens here as a route rather than as an editor that starts empty.
      routes: readTerminalRoutes(t),
      activeRouteId: readTerminalRoutes(t)[0]?.id ?? null,
      road_width_m: normalizeRoadWidth(t.road_width_m),
      boundary_enabled: t.boundary_enabled !== false,
      base_fare: t.base_fare ?? 20,
      base_fare_included_km: t.base_fare_included_km ?? 1,
      per_km: t.per_km ?? 10,
      marker_color: normalizeTerminalColor(t.marker_color),
      route_color: normalizeRouteColor(t.route_color),
      border_color: normalizeBorderColor(t.border_color),
      // A column that does not exist and a column that is NULL both come back as
      // nothing to show; either way the box stays empty, which means "fall back".
      private_ride_fee: t.private_ride_fee ?? null,
      private_ride_fee_included_km: t.private_ride_fee_included_km ?? null,
      private_ride_fee_per_km: t.private_ride_fee_per_km ?? null,
      delivery_fee: t.delivery_fee ?? null,
      delivery_fee_included_km: t.delivery_fee_included_km ?? 1,
      delivery_fee_per_km: t.delivery_fee_per_km ?? null,
    });
  }

  /**
   * The roads a terminal already has, read from its row.
   *
   * `routes` is the column, but a terminal whose road was plotted before that
   * column existed holds it only in `boundary_polygon` — so that is read as a
   * single "Main route" rather than showing the terminal as having no road.
   */
  function readTerminalRoutes(t: Terminal): TerminalRoute[] {
    const stored = normalizeTerminalRoutes(t.routes);
    if (stored.length > 0) return stored;
    return legacyRouteFromBoundary(t.boundary_polygon, t.road_width_m);
  }

  const activeRoute = form.routes.find(r => r.id === form.activeRouteId) ?? null;
  // Whether the shape on the map has anything to erase. Road and border each
  // gate their own Clear control on this, the way the old in-card button did.
  const hasPlottedPoints =
    mapPickerMode === 'road'
      ? (activeRoute?.points.length ?? 0) > 0
      : form.boundary_area.length > 0;
  const visibleEditorRoutes = form.routes.filter(r => !editorHiddenRouteIds.includes(r.id));

  /**
   * Whether the route list is on screen, and therefore whether the rail is wide.
   *
   * The list only exists under the Route tab, so the rail that has to make room
   * for it is only wide while Route is the open section — on Terminal or
   * Configuration it snaps back to the narrow rail rather than holding open a
   * column of nothing.
   */
  const routesListOpen =
    (editorSection === 'route' || editorSection === 'toda') && !sidebarCollapsed;

  /** Patch one route in place. Every route edit goes through here. */
  function updateRoute(id: string, patch: Partial<TerminalRoute>) {
    setForm(f => ({
      ...f,
      routes: f.routes.map(r => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }

  /**
   * Corridor width, written to the active route and to `road_width_m` together.
   *
   * They are the same number in two places — the first route's buffer is what
   * gets mirrored into the column the drop-off check reads — so they have to move
   * as one or the saved row disagrees with what the editor showed.
   */
  function setCorridorWidth(meters: number) {
    const width = Math.min(MAX_ROAD_WIDTH_M, Math.max(MIN_ROAD_WIDTH_M, Math.round(meters)));
    setForm(f => ({
      ...f,
      // NaN is passed straight through when the box has been emptied: the
      // validator has to be able to tell "cleared" from "typed 20", and
      // normalizeRoadWidth already falls back for a non-number on the way out.
      road_width_m: Number.isFinite(width) ? width : NaN,
      routes: f.routes.map((r, i) => (i === 0 ? { ...r, buffer_m: width } : r)),
    }));
  }

  function addRoute() {
    const route: TerminalRoute = {
      id: newRouteId(),
      // Numbered off the count so a second road is "Route 2" rather than a second
      // "Route 1".
      name: `Route ${form.routes.length + 1}`,
      points: [],
      buffer_m: form.routes[0]?.buffer_m ?? DEFAULT_ROUTE_BUFFER_M,
      enabled: true,
    };
    commitBoundary({ routes: [...form.routes, route] });
    setForm(f => ({ ...f, activeRouteId: route.id }));
    setEditorHiddenRouteIds([]);
    setRenamingRouteId(null);
  }

  /**
   * Rename from the list, in place.
   *
   * The pencil sits on the row rather than the name being editable on the panel
   * because a route's name is only ever changed one at a time: with an edit field
   * open permanently, every row's text looks like it is waiting to be typed into.
   * An empty name falls back to the old one rather than saving a nameless road —
   * the list, the map hint and the drop-off error all name this route.
   */
  function commitRename(routeId: string, next: string) {
    const name = next.trim();
    setRenamingRouteId(null);
    if (!name) return;
    const current = form.routes.find(r => r.id === routeId);
    if (!current || current.name === name) return;
    setForm(f => ({
      ...f,
      routes: f.routes.map(r => (r.id === routeId ? { ...r, name } : r)),
    }));
  }

  function deleteRoute(route: TerminalRoute) {
    openModal({
      title: 'Delete route',
      message: `Delete ${route.name}? Its ${route.points.length} plotted waypoint${route.points.length === 1 ? '' : 's'} go with it.`,
      variant: 'danger',
      confirmLabel: 'Delete',
      zIndexClassName: 'z-[2030]',
      onConfirm: () => {
        closeModal();
        const next = form.routes.filter(r => r.id !== route.id);
        commitBoundary({ routes: next });
        setForm(f => ({
          ...f,
          activeRouteId: f.activeRouteId === route.id ? next[0]?.id ?? null : f.activeRouteId,
        }));
      },
    });
  }

  function toggleEditorRouteHidden(routeId: string) {
    setEditorHiddenRouteIds(ids =>
      ids.includes(routeId) ? ids.filter(id => id !== routeId) : [...ids, routeId],
    );
  }

  /**
   * Add a plotted point to whichever road is being drawn.
   *
   * With no road chosen — a terminal that has never had one — the first tap
   * creates it, so plotting a single road is still just tapping, and Add route is
   * only needed for the second one onwards.
   */
  function addWaypointToRoute(point: LatLngPoint) {
    const target = activeRoute ?? form.routes[0] ?? null;
    if (!target) {
      const created: TerminalRoute = {
        id: newRouteId(),
        name: 'Main route',
        points: [point],
        buffer_m: form.road_width_m || DEFAULT_ROUTE_BUFFER_M,
        enabled: true,
      };
      commitBoundary({ routes: [created] });
      setForm(f => ({ ...f, activeRouteId: created.id }));
      return;
    }
    commitBoundary({
      routes: form.routes.map(r =>
        r.id === target.id ? { ...r, points: [...r.points, point] } : r,
      ),
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
      setBoundaryPast(p => [...p, { routes: form.routes, area: form.boundary_area }].slice(-BOUNDARY_HISTORY_MAX));
      setBoundaryFuture([]);
      setForm(f => ({ ...f, boundary_area: [...f.boundary_area, { lat, lng }] }));
      return;
    }

    const point = await snapToRoad({ lat, lng });
    addWaypointToRoute(point);
  }, [mapPickerMode, form.routes, form.activeRouteId, form.road_width_m, form.boundary_area, snapToRoad]);

  /**
   * Where the editor's map sits, as one stable object.
   *
   * `@react-google-maps/api` re-centres the map whenever the `center` prop
   * changes *by identity*, not by value — its effect depends on `[map, center]`.
   * Written inline as `adminLocation ?? { lat, lng }`, that fallback is a new
   * object on every render, so every plotted waypoint dragged the camera back to
   * the terminal pin mid-plot. Memoised, it only changes when the position
   * genuinely does.
   */
  const formMapCenter = useMemo(
    () => adminLocation ?? { lat: form.center_lat, lng: form.center_lng },
    [adminLocation, form.center_lat, form.center_lng],
  );

  const handleFormMapLoad = useCallback((map: google.maps.Map) => {
    formMapRef.current = map;
    // The network view frames every terminal, so it must not be dragged back to
    // whichever one is open — hence the branch, and hence fitting after the
    // handler rather than letting the two fight over the camera.
    if (editorSection === 'toda') {
      fitTerminalsOnEditorMap(map);
      return;
    }
    // Open on the admin's current position; fall back to the terminal's pin and
    // then the Gen T Deleon default when GPS isn't available.
    map.setCenter(adminLocation ?? { lat: form.center_lat, lng: form.center_lng });
    map.setZoom(15);
  }, [adminLocation, form.center_lat, form.center_lng, editorSection]);

  /**
   * Frame every terminal on the editor's map.
   *
   * Only used by the Toda section. Re-run whenever the section is opened and
   * whenever the terminal count changes, because the camera is otherwise left
   * wherever the admin last panned it and a network view that opens zoomed in
   * on one TODA answers none of the question it exists to answer.
   */
  const fitTerminalsOnEditorMap = useCallback((map: google.maps.Map) => {
    const points = visibleTerminals.map(t => ({ lat: t.center_lat, lng: t.center_lng }));
    if (points.length === 0) {
      map.setCenter(OVERVIEW_CENTER);
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
    map.fitBounds(bounds, 70);
  }, [visibleTerminals]);

  useEffect(() => {
    if (editorSection !== 'toda') return;
    const map = formMapRef.current;
    if (!map) return;
    fitTerminalsOnEditorMap(map);
  }, [editorSection, visibleTerminals.length, fitTerminalsOnEditorMap]);

  /**
   * What the guide says about the section you are looking at.
   *
   * One entry per tab rather than one guide for the map. Three of the tabs draw
   * on the map and three do not, and a guide that only ever explained plotting
   * left Fares and Configuration with nothing — which are exactly the two a new
   * admin is least sure about. Derived here so the tab, the guide and the "?"
   * button can never describe different sections.
   */
  const editorGuide = useMemo((): { title: string; detail: string; note: string } => {
    if (editorSection === 'toda') {
      const n = visibleTerminals.length;
      return {
        title: 'Every TODA on one map',
        detail: `${n} terminal${n === 1 ? '' : 's'} · tap a pin to open that terminal`,
        note:
          'The terminal you have open is drawn at full weight and the rest are dimmed, so you can find it again without reading the list.',
      };
    }
    if (editorSection === 'border') {
      return {
        title: 'Tap the corners of the border area',
        detail:
          form.boundary_area.length < 3
            ? `Add at least 3 points — ${form.boundary_area.length} so far`
            : `${form.boundary_area.length} points — area closed`,
        note: 'The radius where a tricycle driver can join the queue to pick up a customer — share ride or private ride.',
      };
    }
    if (editorSection === 'route') {
      return {
        title: activeRoute ? `Tap along ${activeRoute.name}` : 'Tap to start a route',
        detail: isSnappingRoad
          ? 'Snapping to the nearest road...'
          : !activeRoute
            ? 'A road is created for you — add more with Add route.'
            : activeRoute.points.length < 2
              ? `Add at least 2 points — drop-offs and food orders are accepted within ${Math.round(activeRoute.buffer_m / 2)} m of the route`
              : `${activeRoute.points.length} points — accepts drop-offs / food orders within ${Math.round(activeRoute.buffer_m / 2)} m of the road`,
        note: 'The route tricycle drivers can use to drop off a customer or pick up a food order.',
      };
    }
    if (editorSection === 'fares') {
      return {
        title: 'What customers can buy here',
        detail: `₱${form.base_fare} covers the first ${form.base_fare_included_km} km + ₱${form.per_km}/km after · private ride and delivery override it`,
        note: 'Leave a fare blank to fall back to the platform rate rather than charging nothing.',
      };
    }
    if (editorSection === 'configuration') {
      return {
        title: 'Name, corridor and colour',
        detail: 'Everything with no natural place on the map lives here.',
        note: 'Save Changes at the bottom applies every section you have edited, not just this one.',
      };
    }
    return {
      title: 'Tap anywhere to set terminal location',
      detail: `Current: ${form.center_lat.toFixed(4)}, ${form.center_lng.toFixed(4)}`,
      note: 'The pin this terminal is known by — the queue and drop-off checks are measured from it.',
    };
  }, [
    editorSection,
    visibleTerminals.length,
    form.boundary_area.length,
    activeRoute,
    isSnappingRoad,
    form.base_fare,
    form.per_km,
    form.center_lat,
    form.center_lng,
  ]);

  /**
   * The guide opens on its own when the section changes, then gets out of the way.
   *
   * Three seconds is long enough to read two short lines and short enough that a
   * panel sliding in over the map is never in the way while plotting. It is
   * keyed on `editorSection` alone, deliberately: keyed on the content it would
   * re-open every time a point was added, which is the one moment the admin is
   * watching the map and least wants a panel appearing over it.
   */
  useEffect(() => {
    setGuideOpen(true);
    if (guideTimerRef.current !== null) window.clearTimeout(guideTimerRef.current);
    guideTimerRef.current = window.setTimeout(() => setGuideOpen(false), GUIDE_AUTO_HIDE_MS);
    return () => {
      if (guideTimerRef.current !== null) window.clearTimeout(guideTimerRef.current);
    };
  }, [editorSection]);

  /** Open or close the guide by hand. Cancels the pending auto-hide. */
  function toggleGuide() {
    if (guideTimerRef.current !== null) {
      window.clearTimeout(guideTimerRef.current);
      guideTimerRef.current = null;
    }
    setGuideOpen(open => !open);
  }

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
    | 'base_fare' | 'base_fare_included_km' | 'per_km'
    | 'private_ride_fee' | 'private_ride_fee_included_km' | 'private_ride_fee_per_km'
    | 'delivery_fee' | 'delivery_fee_included_km' | 'delivery_fee_per_km';
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

    if (form.routes.length > 0 && form.routes[0].points.length === 1) {
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
    if (fare(form.base_fare_included_km) === null) {
      errors.base_fare_included_km = 'Included distance must be a number of 0 or more.';
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
    if (!optionalFare(form.private_ride_fee_included_km)) {
      errors.private_ride_fee_included_km = 'Private ride included distance must be a number of 0 or more, or left empty.';
    }
    if (!optionalFare(form.private_ride_fee_per_km)) {
      errors.private_ride_fee_per_km = 'Private ride price per km must be a number of 0 or more, or left empty.';
    }
    if (!optionalFare(form.delivery_fee)) {
      errors.delivery_fee = 'Delivery price must be a number of 0 or more, or left empty.';
    }
    if (fare(form.delivery_fee_included_km) === null) {
      errors.delivery_fee_included_km = 'Delivery included distance must be a number of 0 or more.';
    }
    if (!optionalFare(form.delivery_fee_per_km)) {
      errors.delivery_fee_per_km = 'Delivery price per km must be a number of 0 or more, or left empty.';
    }

    // Order matters only in that the first entry is the one reported; it follows
    // the order the admin meets the fields, with the shapes before the settings.
    const order: EditorField[] = [
      'name', 'location', 'road', 'area', 'road_width_m',
      'marker_color', 'route_color', 'border_color',
      'base_fare', 'base_fare_included_km', 'per_km',
      'private_ride_fee', 'private_ride_fee_included_km', 'private_ride_fee_per_km',
      'delivery_fee', 'delivery_fee_included_km', 'delivery_fee_per_km',
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
    // On the Route tab "clear the road" means the road being drawn, not every
    // road this terminal has — the others are usually there precisely so one of
    // them can be corrected without losing the rest.
    if (mapPickerMode === 'road') {
      const route = activeRoute;
      if (!route || route.points.length === 0) return;
      openModal({
        title: 'Clear route',
        message: `Remove all ${route.points.length} plotted point${route.points.length === 1 ? '' : 's'} from ${route.name}? The route stays in the list, empty, until you plot it again — or delete it from the list.`,
        variant: 'warning',
        confirmLabel: 'Clear',
        zIndexClassName: 'z-[2030]',
        onConfirm: () => {
          closeModal();
          updateRoute(route.id, { points: [] });
        },
      });
      return;
    }

    const areaPts = form.boundary_area.length;
    if (areaPts === 0) return;

    openModal({
      title: 'Clear Border Area',
      message: `Remove all ${areaPts} plotted point${areaPts === 1 ? '' : 's'}? This terminal will have no border area until you plot again, so its drivers can queue from anywhere.`,
      variant: 'warning',
      confirmLabel: 'Clear',
      // The map picker sits at z-[2010], so the dialog has to outrank it.
      zIndexClassName: 'z-[2030]',
      onConfirm: () => {
        closeModal();
        commitBoundary({ area: [] });
      },
    });
  }

  async function saveTerminal() {
    if (!form.name || !form.boundary) return;
    if (boundaryValidationError()) return;

    // Two points already describe a road; three enclose an area. Anything less
    // isn't worth saving.
    const boundaryArea = form.boundary_area.length >= 3 ? form.boundary_area : null;

    /*
     * Roads, stored as the network actually runs them rather than as the tapped
     * corners, then the first one mirrored into the single-road columns.
     *
     * The mirror is not tidiness: the drop-off and food-order checks read
     * `boundary_polygon` / `road_width_m` and not `routes`, so a road plotted
     * here would gate nothing until something else happened to rewrite them.
     * When the first route has nothing plotted the mirror is skipped rather than
     * blanked — a half-drawn road must not delete the one already there.
     */
    const densifiedRoutes = await Promise.all(
      form.routes.map(async r => ({
        ...r,
        points: r.points.length >= 2 ? await densifyRoad(r.points) : r.points,
      })),
    );
    const mirror = mirrorFirstRoute(densifiedRoutes);
    const boundaryPolygon = mirror.boundary_polygon ?? null;
    const roadWidthM = mirror.road_width_m ?? normalizeRoadWidth(form.road_width_m);

    // This terminal's own ride fare, kept non-negative with a safe default.
    const fareValue = (value: number, fallback: number) =>
      Number.isFinite(value) && value >= 0 ? value : fallback;
    const base_fare = fareValue(Number(form.base_fare), 20);
    const base_fare_included_km = fareValue(Number(form.base_fare_included_km), 1);
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
    const private_ride_fee_included_km = optionalFareValue(form.private_ride_fee_included_km);
    const private_ride_fee_per_km = optionalFareValue(form.private_ride_fee_per_km);
    const delivery_fee = optionalFareValue(form.delivery_fee);
    const delivery_fee_included_km = fareValue(Number(form.delivery_fee_included_km), 1);
    const delivery_fee_per_km = optionalFareValue(form.delivery_fee_per_km);

    // Normalised on the way out too, so a value that somehow slipped past the
    // picker (a restored draft, a pasted form state) can't write a bad colour.
    const markerColor = normalizeTerminalColor(form.marker_color);
    const routeColor = normalizeRouteColor(form.route_color);
    const borderColor = normalizeBorderColor(form.border_color);

    const target: Terminal = editTerminal
      ? { ...editTerminal, name: form.name, boundary: form.boundary, center_lat: form.center_lat, center_lng: form.center_lng, is_active: form.is_active, boundary_polygon: boundaryPolygon, boundary_area: boundaryArea, routes: densifiedRoutes, road_width_m: roadWidthM, boundary_enabled: form.boundary_enabled, base_fare, base_fare_included_km, per_km, marker_color: markerColor, route_color: routeColor, border_color: borderColor, private_ride_fee, private_ride_fee_included_km, private_ride_fee_per_km, delivery_fee, delivery_fee_included_km, delivery_fee_per_km }
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
          routes: densifiedRoutes,
          road_width_m: roadWidthM,
          // Taken from the form, not hard-coded: the Enforce Boundary switch is
          // only shown once something is plotted, so a new terminal with a drawn
          // route can legitimately start with enforcement off.
          boundary_enabled: form.boundary_enabled,
          base_fare,
          base_fare_included_km,
          per_km,
          marker_color: markerColor,
          route_color: routeColor,
          border_color: borderColor,
          private_ride_fee,
          private_ride_fee_included_km,
          private_ride_fee_per_km,
          delivery_fee,
          delivery_fee_included_km,
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
      if (fareColumns.baseDistance) {
        farePatch.base_fare_included_km = target.base_fare_included_km ?? 1;
        farePatch.private_ride_fee_included_km = target.private_ride_fee_included_km ?? null;
        farePatch.delivery_fee_included_km = target.delivery_fee_included_km ?? 1;
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
          // The terminal's roads. Written on every save so the mirror above and
          // the list in the editor can never drift apart.
          routes: target.routes,
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
          private_ride_fee_included_km: target.private_ride_fee_included_km,
          private_ride_fee_per_km: target.private_ride_fee_per_km,
          delivery_fee: target.delivery_fee,
          delivery_fee_included_km: target.delivery_fee_included_km,
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
    const target = terminals.find(t => t.id === id);
    const drivers = target ? getRidersForTerminal(target.id).length : 0;
    openModal({
      title: "Delete Terminal",
      // Named, and with the driver count, because this is now reached from the
      // directory rather than from a card about that one terminal — and because
      // unassigning drivers is the part of it that is not obvious.
      message: target
        ? `Delete ${target.name}? ${drivers} driver${drivers === 1 ? '' : 's'} will be unassigned from it, and anyone named as its TODA admin loses that access. This cannot be undone.`
        : 'Delete this terminal? Assigned drivers will be unassigned.',
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
      // Release drivers and unscope any admin pointed at this terminal.
      // `is_terminal_admin` goes with the assignment: a driver kept as admin of
      // a terminal that no longer exists would be offered an admin app scoped
      // to nothing. Guarded by the probe so an un-migrated database still
      // deletes the terminal instead of failing the whole release.
      await supabase
        .from("users")
        .update({
          terminal_id: null,
          terminal_name: null,
          ...(terminalAdminColumn ? { is_terminal_admin: false } : {}),
        })
        .eq("terminal_id", id);
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

      // Re-read the roster. The release above cleared each driver's terminal
      // and their admin flag in the database, and this list is the one place
      // both of those are read from — leaving it stale here would show drivers
      // still on a terminal that no longer exists, admin and all.
      const releasedDrivers = await loadRidersFromSupabase();
      if (releasedDrivers) setUsers(releasedDrivers);

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
    // Carried across, not dropped. This function is how a driver *moves* between
    // terminals, and a driver who was the admin of the TODA they are being moved
    // from is moving as that TODA's admin. Clearing the flag here is what made
    // "assign the admin to a different TODA" silently fail: they arrived at the
    // new terminal as an ordinary driver, with no way back short of opening the
    // new terminal's roster and flipping the switch by hand.
    const carriesAdminFlag = !!rider.isTerminalAdmin;

    setUsers(list =>
      list.map(u =>
        u.id === rider.id
          ? {
              ...u,
              terminalId: terminal.id,
              terminal_id: terminal.id,
              terminalName: terminal.name,
              terminal_name: terminal.name,
              isTerminalAdmin: carriesAdminFlag,
            }
          : u
      )
    );

    // The flag is only written when the column is actually there. Sending it
    // blind would have PostgREST reject the whole assignment on a database that
    // has not run ADD_TERMINAL_ADMIN_FLAG.sql — breaking something that already
    // worked in order to carry something new.
    const patch: Record<string, unknown> = {
      terminal_id: terminal.id,
      terminal_name: terminal.name,
    };
    if (terminalAdminColumn) patch.is_terminal_admin = carriesAdminFlag;

    const { error } = await supabase
      .from('users')
      .update(patch)
      .eq('id', rider.id);

    if (error) {
      setUsers(list =>
        list.map(u =>
          u.id === rider.id
            ? { ...u, terminalId: previousId, terminal_id: previousId, terminalName: previousName, terminal_name: previousName, isTerminalAdmin: !!rider.isTerminalAdmin }
            : u
        )
      );
      setToast({ message: `Could not assign ${riderName(rider)}: ${error.message}`, variant: 'error' });
      return;
    }

    const isMove = !!previousId && previousId !== terminal.id;

    logAudit({
      action: 'assign_terminal_driver',
      actorRole: 'admin',
      entityType: 'terminal',
      entityId: terminal.id,
      summary: isMove
        ? `Moved ${riderName(rider)} from ${previousName ?? previousId} to ${terminal.name}`
        : `Assigned ${riderName(rider)} to ${terminal.name}`,
      details: {
        driver_id: rider.id,
        terminal_id: terminal.id,
        previous_terminal_id: previousId ?? null,
        // A move that also carried admin across is two changes in one tap, and
        // this entry is the only record of who decided the second one.
        is_terminal_admin: terminalAdminColumn ? carriesAdminFlag : undefined,
      },
      actorEmail: user?.email,
      actorName: user?.name,
    });

    // A move takes the driver off the old terminal as well as adding them to the
    // new one, or the old terminal's count stays one too high for good.
    if (isMove) {
      setTerminals(ts =>
        ts.map(t =>
          t.id === previousId ? { ...t, rider_count: Math.max(0, (t.rider_count ?? 0) - 1) } : t
        )
      );
    }
    setTerminals(ts =>
      ts.map(t => (t.id === terminal.id ? { ...t, rider_count: (t.rider_count ?? 0) + 1 } : t))
    );
    setToast({
      message: isMove
        ? `${riderName(rider)} moved to ${terminal.name}${carriesAdminFlag ? ' — still a TODA admin' : ''}`
        : `${riderName(rider)} assigned to ${terminal.name}`,
      variant: 'success',
    });
  }

  /**
   * Confirm adding or moving a driver to a terminal.
   *
   * Moving gets its own sentence because it is a different thing to be agreeing
   * to: the driver leaves another TODA, and if they were that TODA's admin their
   * admin access moves with them. Both are said here rather than discovered
   * afterwards on a roster that no longer adds up.
   */
  function confirmAssignDriver(rider: StoredRider, terminal: Terminal) {
    const label = riderName(rider);
    const fromTerminal = terminals.find(t => t.id === riderTerminalId(rider)) || null;
    const isMove = !!fromTerminal && fromTerminal.id !== terminal.id;

    openModal({
      title: isMove ? 'Move Driver' : 'Assign Driver',
      message: isMove
        ? `Move ${label} from ${fromTerminal?.name} to ${terminal.name}?${
            rider.isTerminalAdmin
              ? ` They are the admin of ${fromTerminal?.name}, so they will be the admin of ${terminal.name} too.`
              : ''
          }`
        : `Assign ${label} to ${terminal.name}? They will start picking up rides from this terminal.${
            rider.isTerminalAdmin ? ' They are already a TODA admin.' : ''
          }`,
      variant: 'success',
      confirmLabel: isMove ? 'Move' : 'Assign',
      onConfirm: async () => {
        closeModal();
        await applyAssignDriver(rider, terminal);
      },
    });
  }

/**
   * Take a driver off their terminal now. Optimistic, and rolls back on failure.
   *
   * Clears the admin flag as well as the assignment. Admin of a terminal they are
   * no longer on is not a state this app can act on, and leaving the flag behind
   * is how a driver ends up holding admin access to somebody else's TODA.
   */
  async function applyUnassignDriver(rider: StoredRider, terminal: Terminal) {
    const previousId = riderTerminalId(rider);
    const previousName = riderTerminalName(rider);
    const previousAdminFlag = !!rider.isTerminalAdmin;

    setUsers(list =>
      list.map(u =>
        u.id === rider.id
          ? {
              ...u,
              terminalId: undefined,
              terminal_id: undefined,
              terminalName: undefined,
              terminal_name: undefined,
              isTerminalAdmin: false,
            }
          : u
      )
    );

    const { error } = await supabase
      .from('users')
      .update({
        terminal_id: null,
        terminal_name: null,
        // Only named when the column exists. PostgREST rejects the whole
        // statement over one absent column, so sending it blind would stop
        // drivers being unassigned at all on a database that has simply not run
        // ADD_TERMINAL_ADMIN_FLAG.sql yet.
        ...(terminalAdminColumn ? { is_terminal_admin: false } : {}),
      })
      .eq('id', rider.id);

    if (error) {
      setUsers(list =>
        list.map(u =>
          u.id === rider.id
            ? { ...u, terminalId: previousId, terminal_id: previousId, terminalName: previousName, terminal_name: previousName, isTerminalAdmin: previousAdminFlag }
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
      details: {
        driver_id: rider.id,
        terminal_id: terminal.id,
        previous_terminal_id: previousId ?? null,
        // Noted because it is a second, quieter change: someone who was admin
        // of this terminal stops being able to open the admin app at all.
        was_terminal_admin: previousAdminFlag,
      },
      actorEmail: user?.email,
      actorName: user?.name,
    });

    setTerminals(ts =>
      ts.map(t => (t.id === terminal.id ? { ...t, rider_count: Math.max(0, (t.rider_count ?? 0) - 1) } : t))
    );
    setToast({ message: `${riderName(rider)} removed from ${terminal.name}`, variant: 'success' });
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
      title={isRiderAdmin ? 'Your Terminal' : 'Terminal Management'}
      subtitle={isRiderAdmin ? 'Terminal operations · Pamamahala ng iyong TODA' : 'Terminals, drivers, fares and coverage areas'}
      /* No tab strip. The page had three sections and this was how they were
         switched; with one section left, a tablist of one is chrome that only
         takes up the header and implies somewhere else to go. Both roles keep
         the whole page — a Rider Admin is scoped to one terminal rather than
         shut out of the directory. */
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
            className="inline-flex min-h-11 items-center gap-1.5 sm:gap-2 rounded-xl bg-[var(--primary)] px-3 sm:px-4 py-2 text-sm font-bold text-[var(--primary-foreground)] shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            <Plus className="size-5" aria-hidden="true" />
            <span className="hidden sm:inline">Add Terminal</span>
          </button>
        ) : null
      }
    >

        {/* Content */}
        <div className="@container mx-auto w-full max-w-[100rem] space-y-6 sm:space-y-8">
{/* ------------------------------------------------------------------
              Assignments — who runs which terminal.

              Two audiences, so two shapes from one page. A Super Admin
              is holding the whole network in view: the directory is
              every driver, the terminal each one drives out of, and
              which of them runs it, and the rail says how much of the
              network that covers. A Rider Admin is scoped to one
              terminal already, so they get that answer plus the requests
              of theirs waiting on the Super Admin — never a directory
              they can read but not change.
          ------------------------------------------------------------------ */}
          {terminalView === 'assignments' && (
            <div className="space-y-6">

              {/* Page head. The three figures sit beside it rather than
                  above it because they are a reading of the same state the
                  title describes, not a fourth thing to look at. */}
              <section aria-labelledby="terminals-summary-title" className={`relative isolate overflow-hidden rounded-3xl p-5 sm:p-7 bg-[var(--ink-solid)] text-white`}>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
                <div className="min-w-0">
                  <p className={`text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] text-[var(--mint)]`}>
                    TrikeServe · Terminal operations
                  </p>
                  <h2 id="terminals-summary-title" className={`mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white`}>
                    {isSuperAdmin ? 'Your network, connected.' : 'Your TODA, in focus.'}
                  </h2>
                  <p className={`mt-2 max-w-xl text-sm leading-relaxed text-white/75`}>
                    {isSuperAdmin
                      ? 'Manage your TODA network, assign drivers, and keep every terminal supported.'
                      : 'Your terminal scope, and anything still waiting on the Super Admin.'}
                  </p>
                </div>

                {/*
                    Terminal management moved into the directory below, so the
                    cog that used to jump to the Map Editor is gone rather than
                    repointed: it would have been a shortcut to a tab that no
                    longer exists, and every terminal here now opens its own
                    settings from its own row.
                  */}
                {isSuperAdmin && (
                  <div className="shrink-0 space-y-2 sm:text-right">
                    <button type="button" disabled={loading} onClick={() => void loadData()} aria-label="Refresh terminals" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 text-sm font-bold transition-colors hover:bg-white/10 disabled:opacity-60">
                      <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> {loading ? 'Refreshing…' : 'Refresh data'}
                    </button>
                    <p role="status" className="flex items-center gap-1.5 text-xs text-white/70 sm:justify-end"><Clock className="size-3.5 shrink-0" aria-hidden="true" />{loading ? 'Loading network data…' : loadError ? 'Update unavailable' : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}` : 'Not yet updated'}</p>
                  </div>
                )}
              </div>
              </section>

              {loadError && <div role="alert" className="rounded-2xl border border-[var(--amber)]/40 bg-[var(--amber-soft)] p-4 text-sm text-[var(--amber-ink)]">{loadError}</div>}
              {isSuperAdmin && (
                <section aria-labelledby="terminal-network-title" aria-busy={loading}>
                  <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1"><h2 id="terminal-network-title" className="text-lg font-bold tracking-tight text-[var(--ink)] sm:text-xl">Network at a glance</h2><p className="text-xs text-[var(--muted-foreground)]">Terminals, drivers, and admin coverage</p></div>
                  {loading ? <StatSkeleton count={4} /> : <div className="grid grid-cols-2 gap-3 sm:gap-4 @min-[42rem]:grid-cols-4">
                    {[
                      { label: 'Terminals', value: terminals.length, detail: `${terminals.filter(t => t.is_active).length} active`, Icon: MapPin, tone: 'bg-[var(--teal-soft)] text-[var(--teal)]' },
                      { label: 'Drivers', value: riders.length, detail: `${getUnassignedRiders().length} unassigned`, Icon: Users, tone: 'bg-[var(--info-soft)] text-[var(--info)]' },
                      { label: 'TODA admins', value: todaAdmins.length, detail: `${assignedAdminCount} assigned to terminals`, Icon: ShieldCheck, tone: 'bg-[var(--success-soft)] text-[var(--success-ink)]' },
                      { label: 'Needs admin', value: terminalsWithoutAdmins, detail: 'Terminals without an admin', Icon: Shield, tone: 'bg-[var(--amber-soft)] text-[var(--amber-ink)]' },
                    ].map(({ label, value, detail, Icon, tone }) => <div key={label} className="min-w-0 rounded-2xl border border-line bg-card p-4 sm:p-5"><span className={`mb-4 grid size-9 place-items-center rounded-xl ${tone}`}><Icon className="size-[18px]" aria-hidden="true" /></span><p className="break-all text-3xl font-extrabold leading-none text-[var(--ink)] tabular-nums">{value.toLocaleString()}</p><h3 className="mt-2 text-sm font-bold text-[var(--ink)]">{label}</h3><p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">{detail}</p></div>)}
                  </div>}
                </section>
              )}

              {isRiderAdmin && <AdminMetricCards loading={loading} items={[
                { label: 'Terminal assignment', value: assignedTerminalId ? 1 : 0, detail: assignedTerminalName || 'Ask the Super Admin for an assignment', Icon: MapPin },
                { label: 'Your drivers', value: assignedRiderCount, detail: 'Drivers on your assigned terminal', Icon: Users, tone: 'info' },
                { label: 'Awaiting approval', value: myRequests.filter(request => request.status === 'pending').length, detail: 'Your submitted change requests', Icon: Clock, tone: 'amber' },
              ]} />}
              {/* Pending Changes Banner */}
              {isRiderAdmin && hasPendingChanges && (
                <div className="p-4 bg-[var(--amber-soft)] border-2 border-[var(--amber-soft)] rounded-2xl">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
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
                        type="button"
                        onClick={() => setPendingChanges({})}
                        className="min-h-11 rounded-xl px-3 text-xs font-semibold text-[var(--amber-ink)] hover:underline"
                      >
                        Discard All
                      </button>
                      <button
                        type="button"
                        onClick={savePendingChanges}
                        className="flex min-h-11 items-center gap-1 px-3 py-1.5 bg-[var(--success-ink)] text-[var(--background)] text-xs font-bold rounded-xl transition-all active:scale-95"
                      >
                        <Save size={12} /> Save Now
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {isSuperAdmin ? (
                <div className="grid gap-6 @min-[60rem]:grid-cols-[minmax(0,1fr)_18rem] items-start">
                  {/* --------------------------------------------------
                      TODA directory — the assignment itself.

                      Grouped by terminal rather than by driver, because
                      the question this page answers is "who runs this
                      TODA", and answering it per driver meant scrolling a
                      flat list of every driver to find the handful on any
                      one terminal.

                      One row per terminal, all of them — a terminal with
                      nobody on it is exactly the one that needs an admin,
                      so it cannot be hidden behind a filter. Opening one
                      reveals its drivers, with the admin switch beside
                      each, and a searchable picker for adding more.
                  -------------------------------------------------- */}
                  <section aria-labelledby="terminal-directory-title" className="min-w-0 rounded-3xl bg-card border border-line">
                    <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5 border-b border-line">
                      <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-[var(--teal-soft)] text-[var(--teal)] flex items-center justify-center">
                        <Users size={18} />
                      </div>
                      <div className="min-w-0">
                        <h2 id="terminal-directory-title" className="text-base font-bold text-[var(--ink)]">TODA directory</h2>
                        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                          Open a terminal to staff it and name who runs it
                        </p>
                      </div>
                      <span className="ml-auto flex-shrink-0 px-2.5 py-1 rounded-full bg-[var(--soft)] border border-line text-[11px] font-bold text-[var(--muted-foreground)]">
                        {terminals.length} terminal{terminals.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="space-y-3 border-b border-line p-4 sm:p-5">
                      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true" /><label htmlFor="terminal-directory-search" className="sr-only">Search terminals or drivers</label><input id="terminal-directory-search" type="search" value={terminalQuery} onChange={event => setTerminalQuery(event.target.value)} placeholder="Search terminal, area, or driver…" className="min-h-11 w-full rounded-xl border border-line bg-soft pl-10 pr-3 text-sm text-[var(--ink)]" /></div>
                      <div role="group" aria-label="Filter terminals" className="flex flex-wrap gap-2">
                        {([['all', 'All terminals'], ['needs-admin', 'Needs admin'], ['active', 'Active'], ['inactive', 'Inactive']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setDirectoryFilter(value)} aria-pressed={directoryFilter === value} className={`min-h-11 rounded-xl border px-3 text-xs font-bold transition-colors ${directoryFilter === value ? 'border-[var(--teal)]/30 bg-[var(--teal-soft)] text-[var(--teal)]' : 'border-line text-[var(--muted-foreground)] hover:bg-soft'}`}>{label}</button>)}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]"><p role="status">{loading ? 'Refreshing directory…' : `${directoryTerminals.length} of ${terminals.length} terminals · A–Z`}</p>{(terminalQuery || directoryFilter !== 'all') && <button type="button" onClick={() => { setTerminalQuery(''); setDirectoryFilter('all'); }} className="min-h-11 rounded-lg px-2 font-bold text-[var(--teal)] hover:bg-[var(--teal-soft)]">Clear filters</button>}</div>
                    </div>
                    {!terminalAdminColumn ? (
                      <div className="p-4 border-b border-line bg-[var(--amber-soft)]">
                        <p className="text-sm font-bold text-[var(--amber-ink)]">
                          Run ADD_TERMINAL_ADMIN_FLAG.sql to enable TODA admins
                        </p>
                        <p className="text-xs text-[var(--amber-ink)] mt-0.5">
                          Drivers can still be added to terminals. Naming who runs one needs the
                          column this database does not have yet.
                        </p>
                      </div>
                    ) : null}

                    {loading ? <div role="status" aria-label="Loading terminal directory" className="space-y-3 p-5">{[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-soft" />)}</div> : directoryTerminals.length === 0 ? (
                      <div className="px-5 py-10 text-center"><MapPin className="mx-auto mb-3 size-9 text-[var(--muted-foreground)]" aria-hidden="true" /><p className="text-sm font-bold text-[var(--ink)]">{terminals.length === 0 ? 'No terminals yet' : 'No matching terminals'}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{terminals.length === 0 ? 'Use Add Terminal to create your first TODA.' : 'Try another name, driver, or status filter.'}</p></div>
                    ) : (
                      directoryTerminals.map(t => {
                        const onThisTerminal = getRidersForTerminal(t.id);
                        const adminsHere = todaAdmins.filter(a => riderTerminalId(a) === t.id).length;
                        const isOpen = openTerminalIds.includes(t.id);
                        const candidates = riders.filter(rider => !riderTerminalId(rider));
                        return (
                          <div key={t.id} className={`border-b border-line last:border-b-0 ${isOpen ? 'bg-soft/50' : ''}`}>
                            {/*
                              The row and its controls, as siblings.

                              The row itself only expands the roster. Opening the
                              terminal's settings used to be a cog on the separate
                              Terminals and Map Editor tabs, and with those gone
                              there would be nothing on this page that opened it —
                              so it lives here, beside the name it belongs to.
                            */}
                            <div className="flex flex-wrap items-center gap-y-1 p-3 sm:p-4">
                              <button
                                type="button"
                                aria-expanded={isOpen}
                                aria-controls={`toda-roster-${t.id}`}
                                onClick={() => toggleTerminalOpen(t.id)}
                                className="basis-full @min-[36rem]:basis-0 flex-1 min-w-0 flex items-center gap-3 rounded-xl px-1 py-2 text-left hover:bg-[var(--soft)] transition-colors"
                              >
                                <span
                                  aria-hidden="true"
                                  className="w-3 h-3 flex-shrink-0 rounded-full ring-4 ring-[var(--muted)]"
                                  style={{ background: normalizeTerminalColor(t.marker_color) }}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-bold text-[var(--ink)] break-words">{t.name}</span>
                                  <span className="mt-1 block text-xs font-normal text-[var(--muted-foreground)]">
                                    {onThisTerminal.length} driver{onThisTerminal.length === 1 ? '' : 's'}
                                    {adminsHere > 0
                                      ? ` · ${adminsHere} admin${adminsHere === 1 ? '' : 's'}`
                                      : ' · no admin yet'}
                                  </span>
                                  {t.boundary && <span className="mt-1 block text-xs font-normal text-[var(--muted-foreground)] break-words">{t.boundary}</span>}
                                  <span className={`mt-2 inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${t.is_active ? 'bg-[var(--success-soft)] text-[var(--success-ink)]' : 'bg-soft text-[var(--muted-foreground)]'}`}>{t.is_active ? 'Active' : 'Inactive'}</span>
                                </span>
                                {/* A terminal nobody runs is the one case worth
                                    flagging on the row itself — the roster rail
                                    reports the count, but this is where the eye
                                    already is. */}
                                {adminsHere === 0 ? (
                                  <span className="hidden @min-[42rem]:inline-flex flex-shrink-0 px-2 py-0.5 rounded-full bg-[var(--amber-soft)] text-[var(--amber-ink)] text-[11px] font-bold">
                                    Needs admin
                                  </span>
                                ) : null}
                                <ChevronDown
                                  size={16}
                                  aria-hidden="true"
                                  className={`flex-shrink-0 text-[var(--muted-foreground)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                />
                              </button>

                              {/* A cog, not a pencil: what this opens is the
                                  terminal's whole configuration — name, location,
                                  shape, fares, colour — not a text field. */}
                              <button
                                type="button"
                                onClick={() => openEdit(t)}
                                aria-label={`Settings for ${t.name}`}
                                title="Terminal settings"
                                className="ml-auto @min-[36rem]:ml-2 min-h-11 flex-shrink-0 flex items-center justify-center gap-2 rounded-xl border border-line px-3 text-xs font-bold text-[var(--teal)] hover:bg-[var(--teal-soft)] transition-colors"
                              >
                                <Settings className="w-4 h-4" aria-hidden="true" /> Settings
                              </button>

                              {/* Super Admin only, matching the rule the delete
                                  has always had: a Rider Admin is scoped to one
                                  terminal and does not get to remove it. */}
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  onClick={() => confirmDeleteTerminal(t.id)}
                                  aria-label={`Delete ${t.name}`}
                                  title="Delete terminal"
                                  className="ml-2 w-11 min-h-11 rounded-xl flex-shrink-0 flex items-center justify-center hover:bg-[var(--error-soft)] transition-colors"
                                >
                                  <Trash2 className="w-4 h-4 text-[var(--error)]" />
                                </button>
                              )}
                            </div>

                            {isOpen && (
                              <div id={`toda-roster-${t.id}`} className="px-3 pb-4 sm:px-5">
                                <DriverPicker
                                  terminalName={t.name}
                                  candidates={candidates}
                                  onPick={rider => confirmAssignDriver(rider, t)}
                                />

                                {onThisTerminal.length === 0 ? (
                                  <p className="mt-3 text-sm text-[var(--muted-foreground)] italic">
                                    Nobody on this terminal yet
                                  </p>
                                ) : (
                                  <ul className="mt-3 divide-y divide-line border border-line rounded-xl overflow-hidden">
                                    {onThisTerminal.map(rider => {
                                      const savingFlag = savingAdminFlagId === rider.id;
                                      const isAdmin = !!rider.isTerminalAdmin;
                                      return (
                                        <li
                                          key={rider.id}
                                          className="flex flex-wrap items-center gap-2 px-3 py-3 bg-card"
                                        >
                                          <div className="w-8 h-8 flex-shrink-0 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)] flex items-center justify-center text-[11px] font-bold">
                                            {driverInitials(rider)}
                                          </div>
                                          <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] @min-[42rem]:basis-0">
                                            <p className="text-sm font-semibold text-[var(--ink)] break-words">
                                              {riderName(rider)}
                                            </p>
                                            <p className="text-xs text-[var(--muted-foreground)] break-all">
                                              {riderPlate(rider) || rider.email}
                                            </p>
                                          </div>

                                          {/* A real switch, not a checkbox: it is a
                                              state the driver carries between
                                              sessions, and a checkbox reads as an
                                              action to take once. Always live here —
                                              being on this terminal is the
                                              precondition, and the row only lists
                                              drivers who meet it. */}
                                          <button
                                            type="button"
                                            role="switch"
                                            aria-checked={isAdmin}
                                            aria-label={`TODA admin for ${riderName(rider)} on ${t.name}`}
                                            disabled={savingFlag || !terminalAdminColumn}
                                            onClick={() => confirmDriverTerminalAdmin(rider, !isAdmin)}
                                            className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                              isAdmin ? 'bg-[var(--teal)]' : 'bg-[var(--border)]'
                                            }`}
                                          >
                                            <span
                                              aria-hidden="true"
                                              className={`absolute top-1 size-5 rounded-full bg-white shadow transition-[left] ${
                                                isAdmin ? 'left-6' : 'left-1'
                                              }`}
                                            />
                                          </button>
                                          {savingFlag ? (
                                            <Loader2
                                              size={16}
                                              aria-label="Saving"
                                              className="flex-shrink-0 text-[var(--muted-foreground)] animate-spin"
                                            />
                                          ) : (
                                            <span className="flex-shrink-0 text-xs font-bold text-[var(--muted-foreground)]">
                                              {isAdmin ? 'Admin' : 'Driver'}
                                            </span>
                                          )}

                                          <button
                                            type="button"
                                            aria-label={`Remove ${riderName(rider)} from ${t.name}`}
                                            onClick={() => confirmUnassignDriver(rider, t)}
                                            className="ml-auto flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--error-soft)] hover:text-[var(--error)] transition-colors"
                                          >
                                            <X size={15} />
                                          </button>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}

                    {/* Nobody at all is a different answer from "no terminal
                        has them": without this the page looks complete when it
                        has nothing to assign. */}
                    {riders.length === 0 && terminals.length > 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-[var(--muted-foreground)] border-t border-line">
                        No drivers registered yet
                      </p>
                    ) : null}
                  </section>

                  {/* --------------------------------------------------
                      Assignment health — the one number the directory
                      cannot show at a glance.
                      -------------------------------------------------- */}
                  <section aria-labelledby="terminal-coverage-title" className="min-w-0 rounded-3xl bg-card border border-line p-5 sm:p-6">
                    <h2 id="terminal-coverage-title" className="text-base font-bold text-[var(--ink)]">Terminal coverage</h2>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">Terminals with at least one TODA admin</p>

                    {/* Coverage ring, drawn rather than charted: it is one
                        arc and one number, and a donut's library would be
                        more code than the eight lines below. */}
                    <div className="mt-4 flex items-center justify-center">
                      <div className="relative w-[132px] h-[132px]">
                        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" aria-hidden="true">
                          <circle cx="60" cy="60" r="52" fill="none" stroke="var(--muted)" strokeWidth="10" />
                          {/* Not drawn at all when nothing is assigned: a
                              zero-length dash under a round cap draws a dot, which
                              would read as a sliver of coverage that isn't there. */}
                          {terminalCoverage > 0 && (
                            <circle
                              cx="60"
                              cy="60"
                              r="52"
                              fill="none"
                              stroke="var(--teal)"
                              strokeWidth="10"
                              strokeLinecap="round"
                              strokeDasharray={`${(terminalCoverage / 100) * 326.7} 326.7`}
                            />
                          )}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-extrabold text-[var(--ink)] tabular-nums">{loading ? '—' : `${terminalCoverage}%`}</span>
                          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                            Coverage
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="mt-4 text-center text-lg font-extrabold text-[var(--ink)]">
                      {loading ? 'Loading coverage…' : `${terminalsWithAdmins.length} of ${terminals.length} terminals staffed`}
                    </p>
                    <p className="mt-1 text-center text-sm text-[var(--muted-foreground)]">
                      {loading ? 'Refreshing terminal assignments.' : terminals.length === 0 ? 'Add your first terminal to start building the network.' : terminalsWithoutAdmins === 0 ? 'Every terminal has an admin assigned.' : `${terminalsWithoutAdmins} terminal${terminalsWithoutAdmins === 1 ? ' needs' : 's need'} an admin. Open a roster to designate one.`}
                    </p>
                    <button type="button" onClick={() => { setTerminalQuery(''); setDirectoryFilter('needs-admin'); }} className="mt-3 inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-3 text-xs font-bold text-[var(--teal)] hover:bg-[var(--teal-soft)]"><Filter className="size-4" aria-hidden="true" /> View terminals needing an admin</button>
                    <p className="mt-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
                      {assignedAdminCount} of {todaAdmins.length} designated admins have a terminal assignment.{unassignedAdminCount > 0 ? ` ${unassignedAdminCount} still unassigned.` : ''}
                    </p>

                    <div className="mt-5 pt-4 border-t border-line">
                      {loading ? <p className="text-xs text-[var(--muted-foreground)]">Loading assignments…</p> : terminalsWithAdmins.length === 0 ? (
                        <p className="text-sm text-[var(--muted-foreground)] italic">
                          No terminals have an admin yet
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {terminalsWithAdmins.map(({ terminal, count }) => (
                            <li key={terminal.id} className="flex items-center gap-2.5">
                              <span
                                aria-hidden="true"
                                className="w-2.5 h-2.5 flex-shrink-0 rounded-full"
                                style={{ background: normalizeTerminalColor(terminal.marker_color) }}
                              />
                              <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--ink)] truncate">
                                {terminal.name}
                              </span>
                              <span className="flex-shrink-0 min-w-6 px-1.5 py-0.5 rounded-full bg-[var(--muted)] text-[11px] font-bold text-center text-[var(--muted-foreground)]">
                                {count}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/*
                        "Manage terminals" used to jump to the Terminals tab.
                        The directory beside this rail is the terminal list now,
                        and it is already on screen — a link to something you
                        can see from where you are reading this is worse than no
                        link.
                      */}
                    </div>
                  </section>
                </div>
              ) : (
                /* A Rider Admin's own scope. Same question as the directory
                   above it — who runs which terminal — answered for the one
                   terminal they can possibly be scoped to. */
                <div className="grid gap-5 @min-[56rem]:grid-cols-[minmax(0,1fr)_18rem] items-start">
                  <div className="min-w-0 space-y-5">
                    <div className={`rounded-3xl border p-5 sm:p-6 ${assignedTerminalId ? 'bg-[var(--info-soft)] border-[var(--info-soft)]' : 'bg-[var(--amber-soft)] border-[var(--amber-soft)]'}`}>
                      <p className={`font-bold ${assignedTerminalId ? 'text-[var(--info)]' : 'text-[var(--amber-ink)]'}`}>
                        {assignedTerminalId
                          ? `Assigned to ${assignedTerminalName || 'your terminal'}`
                          : 'No terminal assigned'}
                      </p>
                      <p className={`text-sm mt-0.5 ${assignedTerminalId ? 'text-[var(--info)]/80' : 'text-[var(--amber-ink)]'}`}>
                        {assignedTerminalId
                          ? 'You can only edit this terminal and manage its drivers. Changes are sent to the Super Admin for approval.'
                          : 'Ask the Super Admin to assign you to a terminal before you can manage drivers.'}
                      </p>
                      {assignedTerminalId && (
                        // Opens the terminal's own settings. It used to jump to
                        // the Terminals tab, which is gone; opening the terminal
                        // directly is one step fewer and lands on the same form.
                        <button
                          type="button"
                          onClick={() => {
                            const own = terminals.find(t => t.id === assignedTerminalId);
                            if (own) openEdit(own);
                          }}
                          className="mt-3 flex items-center gap-1 text-sm font-bold text-[var(--info)] hover:underline min-h-11"
                        >
                          Open this terminal
                          <ChevronRight size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    {/* A Rider Admin's submitted requests have their own screen
                        now (Submitted Requests), which lists all of them with
                        search and status filters rather than the eight most
                        recent here. */}
                    {myRequests.some(req => req.status === 'pending') && (
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--muted-foreground)] mb-2 flex items-center gap-2">
                          <ClipboardCheck size={16} /> Awaiting Approval
                        </h3>
                        <div className="space-y-2">
                          {myRequests.filter(req => req.status === 'pending').map(req => {
                            const p = req.payload || {};
                            const summary = req.request_type.startsWith('terminal')
                              ? `${p.name || p.id || 'Terminal'}`
                              : `${p.driver_name || 'Driver'} → ${p.terminal_name || p.terminal_id || ''}`;
                            return (
                              <div
                                key={req.id}
                                className="flex flex-col items-start gap-2 px-4 py-3 rounded-2xl border border-line bg-[var(--amber-soft)] @min-[44rem]:flex-row @min-[44rem]:justify-between"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <Clock size={15} className="text-[var(--amber-ink)] flex-shrink-0" />
                                  <p className="text-sm font-semibold text-[var(--ink)] break-words">
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
                  </div>

                  <div className="min-w-0 rounded-3xl bg-card border border-line p-5 sm:p-6">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--teal)]">
                      Your drivers
                    </p>
                    <p className="mt-3 text-3xl font-extrabold text-[var(--ink)]">
                      {assignedRiderCount}
                    </p>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      driver{assignedRiderCount === 1 ? '' : 's'} on your terminal
                    </p>
                    <Link to="/admin/users" className="mt-4 flex min-h-11 items-center justify-between rounded-xl bg-[var(--teal-soft)] px-3 text-sm font-bold text-[var(--teal)]">Browse drivers <ChevronRight className="size-4" aria-hidden="true" /></Link>
                    <Link to="/admin/requests" className="mt-2 flex min-h-11 items-center justify-between rounded-xl border border-line px-3 text-sm font-bold text-[var(--ink)]">Submitted requests <ChevronRight className="size-4" aria-hidden="true" /></Link>
                    {/* "Manage drivers" used to jump to the Terminals tab. The
                        roster is edited from the terminal's own row, which is
                        reachable from the directory above, so a link to nowhere
                        went rather than one that pretends to still work. */}
                  </div>
                </div>
              )}
            </div>
          )}

          {/*
              The Terminals and Map Editor sections used to stand here, and
              everything the terminal editor can do now hangs off a row in the
              directory above: tapping a terminal opens it, and its Toda tab
              carries the network map that the separate overview used to draw.
          ------------------------------------------------------------------ */}

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
                    className="min-w-0 flex-1 text-sm font-semibold text-[var(--ink)] placeholder:text-[var(--muted-foreground)] placeholder:font-normal outline-none bg-transparent"
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
              className={`relative flex flex-col gap-1 p-2 bg-surface border-r border-[var(--border)] shrink-0 transition-[width] duration-200 ${sidebarCollapsed ? 'w-16' : routesListOpen ? 'w-72 max-w-[70vw] sm:max-w-none' : 'w-44 max-w-[60vw] sm:max-w-none'}`}
            >
              {([
                // Toda first: it is the only tab that answers "what does this
                // network look like", and it is the one an admin lands on from
                // the Assignments list, which is where they usually start. The
                // drawing tabs hang off it — a terminal you have picked out of
                // the network is what you then draw.
                ['toda', 'Toda', MapPinned],
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
                // No wrapper, no width class, no chevron beside it: the tab is a
                // direct child of the rail, so it stretches edge to edge and the
                // active highlight covers the tab's whole width. Anything sitting
                // next to it in a flex row would squeeze the highlight short.
                return (
                  <ReactFragment key={id}>
                    <button
                      type="button"
                      onClick={() => setEditorSection(id)}
                      aria-current={active ? 'page' : undefined}
                      title={sidebarCollapsed ? label : undefined}
                      aria-label={label}
                      className={`flex items-center gap-3 h-12 px-3 rounded-xl transition-colors ${
                        active
                          ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                          : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      {/* Collapsed shows the icon only; the tooltip keeps the name reachable. */}
                      {!sidebarCollapsed && (
                        <span className="text-sm font-bold truncate">{label}</span>
                      )}
                    </button>

                    {/*
                      The route list, under the Route tab.

                      A sub-section of Route rather than a sixth tab: it is not a
                      different job from drawing a route, it is the list of roads
                      the Route tab draws. It sits directly under Route and only
                      while Route is open — elsewhere in the rail it would be a
                      control for a tab nobody is looking at. Nothing folds it away:
                      the roads are what the tab is for.
                    */}
                    {id === 'route' && active && !sidebarCollapsed && (
                      <div className="mt-0.5 mb-1">
                        <div className="mt-1 space-y-1">
                          {form.routes.length === 0 ? (
                            <p className="px-3 py-2 text-[11px] leading-snug text-[var(--muted-foreground)] italic">
                              No routes yet — add one, or tap the map to plot the first.
                            </p>
                          ) : (
                            form.routes.map(route => {
                              const isActive = route.id === activeRoute?.id;
                              const hidden = editorHiddenRouteIds.includes(route.id);
                              const renaming = renamingRouteId === route.id;
                              return (
                                <div
                                  key={route.id}
                                  className={`rounded-xl px-2 py-1.5 transition-colors ${
                                    isActive ? 'bg-[var(--muted)]' : 'hover:bg-[var(--muted)]'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      aria-hidden="true"
                                      className={`w-2.5 h-2.5 flex-shrink-0 rounded-full ${hidden ? 'opacity-30' : ''}`}
                                      style={{ background: normalizeRouteColor(form.route_color) }}
                                    />
                                    {renaming ? (
                                      /* An edit field the admin cannot see focus in
                                         is worse than one that takes it on open;
                                         Escape puts the old name back. */
                                      <input
                                        autoFocus
                                        defaultValue={route.name}
                                        maxLength={60}
                                        aria-label={`Rename ${route.name}`}
                                        onClick={e => e.stopPropagation()}
                                        onBlur={e => commitRename(route.id, e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') {
                                            commitRename(route.id, (e.target as HTMLInputElement).value);
                                          }
                                          if (e.key === 'Escape') setRenamingRouteId(null);
                                        }}
                                        className="min-w-0 flex-1 h-8 px-2 rounded-lg border border-line bg-surface text-xs font-bold text-[var(--ink)]"
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setForm(f => ({ ...f, activeRouteId: route.id }))}
                                        aria-pressed={isActive}
                                        className="min-w-0 flex-1 text-left"
                                      >
                                        <span className={`block text-xs font-bold truncate ${isActive ? 'text-[var(--ink)]' : 'text-[var(--ink-soft)]'}`}>
                                          {route.name}
                                        </span>
                                        <span className="block text-[11px] text-[var(--muted-foreground)] truncate">
                                          {route.points.length} pt{route.points.length === 1 ? '' : 's'}
                                          {route.points.length >= 2 ? ` · ${formatRouteDistance(routeDistanceMeters(route.points))}` : ''}
                                          {route.enabled ? '' : ' · off'}
                                        </span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => toggleEditorRouteHidden(route.id)}
                                      aria-pressed={!hidden}
                                      aria-label={`${hidden ? 'Show' : 'Hide'} ${route.name} on the map`}
                                      title={hidden ? 'Show on map' : 'Hide on map'}
                                      className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--surface)] active:scale-90"
                                    >
                                      {hidden
                                        ? <EyeOff size={14} className="text-[var(--muted-foreground)]" />
                                        : <Eye size={14} className="text-[var(--ink)]" />}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setRenamingRouteId(route.id)}
                                      aria-label={`Rename ${route.name}`}
                                      title={`Rename ${route.name}`}
                                      className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--surface)] active:scale-90"
                                    >
                                      <Edit2 size={14} className="text-[var(--muted-foreground)]" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteRoute(route)}
                                      aria-label={`Delete ${route.name}`}
                                      title={`Delete ${route.name}`}
                                      className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--error-soft)] active:scale-90"
                                    >
                                      <Trash2 size={14} className="text-[var(--error)]" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}

                          <button
                            type="button"
                            onClick={addRoute}
                            className="w-full flex items-center gap-1.5 h-9 px-3 rounded-xl border border-line text-xs font-bold text-[var(--ink)] hover:bg-[var(--muted)] active:scale-95"
                          >
                            <Plus size={14} aria-hidden="true" />
                            Add route
                          </button>
                        </div>
                      </div>
                    )}

                    {/*
                      The terminal list, under the Toda tab.

                      Same shape as the route list above it and for the same
                      reason: a sub-section of its own tab rather than a sixth
                      tab, because it is not a different job from the tab it
                      belongs to — it is the list of terminals the Toda tab is
                      about. It only exists while Toda is open, so it is never a
                      control for a tab nobody is looking at.

                      `visibleTerminals`, not `terminals`: a Rider Admin is
                      scoped to one terminal, and this list must not be the way
                      round that.
                    */}
                    {id === 'toda' && active && !sidebarCollapsed && (
                      <div className="mt-0.5 mb-1">
                        <div className="mt-1 space-y-1">
                          {visibleTerminals.length === 0 ? (
                            <p className="px-3 py-2 text-[11px] leading-snug text-[var(--muted-foreground)] italic">
                              {isRiderAdmin
                                ? 'No terminal assigned to you yet.'
                                : 'No terminals yet.'}
                            </p>
                          ) : (
                            visibleTerminals.map(other => {
                              const isCurrent = other.id === editTerminal?.id;
                              const roadCount = readTerminalRoutes(other).filter(
                                r => r.points.length >= 2
                              ).length;
                              return (
                                <div
                                  key={other.id}
                                  className={`rounded-xl px-2 py-1.5 transition-colors ${
                                    isCurrent ? 'bg-[var(--muted)]' : 'hover:bg-[var(--muted)]'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      aria-hidden="true"
                                      className={`w-2.5 h-2.5 flex-shrink-0 rounded-full ${
                                        other.is_active === false ? 'opacity-30' : ''
                                      }`}
                                      style={{ background: normalizeTerminalColor(other.marker_color) }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => openEditKeepingSection(other, 'toda')}
                                      aria-pressed={isCurrent}
                                      className="min-w-0 flex-1 text-left"
                                    >
                                      <span className={`block text-xs font-bold truncate ${isCurrent ? 'text-[var(--ink)]' : 'text-[var(--ink-soft)]'}`}>
                                        {other.name}
                                      </span>
                                      <span className="block text-[11px] text-[var(--muted-foreground)] truncate">
                                        {other.is_active === false ? 'Inactive' : 'Active'}
                                        {roadCount > 0 ? ` · ${roadCount} route${roadCount === 1 ? '' : 's'}` : ''}
                                      </span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </ReactFragment>
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

            {/*
            `relative` is what the guide floats against, so it stays in the same
            corner on all six tabs. Without it the guide would anchor to the
            editor's outer edge and sit half over the rail.
          */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
          {/*
            Read once from editorSectionIsMap rather than re-tested here as a
            two-way comparison — that is what the flag is for, and re-listing the
            sections here is how a new one ends up rendering a map that would
            then plot into the wrong form.
          */}
          {editorSectionShowsMap && (
          <div className="flex-1 relative flex min-h-0">
            <div className="flex-1 relative min-w-0">
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={editorSection === 'toda' ? OVERVIEW_CENTER : formMapCenter}
              zoom={editorSection === 'toda' ? 13 : 15}
              // No handler on the Toda section, so a tap on the map does
              // nothing at all. Wiring this unconditionally is how a tap aimed
              // at a terminal would move the open terminal's pin instead.
              onClick={editorSectionIsMap ? handleFormMapClick : undefined}
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
                  shape's colour on the two plotting tabs.

                  On Toda it is the whole network instead of the one terminal
                  being edited — borders and roads included, since two TODAs a
                  few hundred metres apart are told apart by what they enclose,
                  not by their pins. */}
              {editorSection === 'toda'
                ? visibleTerminals.map(other => {
                    const area = other.boundary_area && other.boundary_area.length >= 3
                      ? other.boundary_area
                      : null;
                    const roads = readTerminalRoutes(other).filter(r => r.points.length >= 2);
                    const isCurrent = other.id === editTerminal?.id;
                    const dim = other.is_active === false || !isCurrent;
                    return (
                      <ReactFragment key={other.id}>
                        {area && (
                          <Polygon
                            path={area}
                            options={{
                              fillColor: other.border_color,
                              // The open terminal keeps full weight so it stays
                              // findable among its neighbours; the rest recede.
                              fillOpacity: dim ? 0.05 : 0.16,
                              strokeColor: other.border_color,
                              strokeOpacity: dim ? 0.4 : 1,
                              strokeWeight: isCurrent ? 3 : 2,
                              clickable: false,
                            }}
                          />
                        )}
                        {roads.map(route => (
                          <Polyline
                            key={`${other.id}_${route.id}`}
                            path={route.points}
                            options={{
                              strokeColor: normalizeRouteColor(other.route_color),
                              strokeWeight: isCurrent ? 5 : 3,
                              strokeOpacity: dim ? 0.35 : 0.9,
                              clickable: false,
                              geodesic: true,
                            }}
                          />
                        ))}
                        <Marker
                          position={{ lat: other.center_lat, lng: other.center_lng }}
                          title={other.name}
                          icon={terminalMarkerIcon(other.marker_color, isCurrent ? 76 : 54)}
                          // The one thing on this map you can tap. It opens that
                          // terminal rather than moving this one.
                          onClick={() => openEditKeepingSection(other, 'toda')}
                          zIndex={isCurrent ? 40 : 30}
                        />
                      </ReactFragment>
                    );
                  })
                : mapPickerMode === 'location' ? (
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
              {/* The enclosing area, drawn under the road it contains.

                  Skipped on Toda: the network branch above already draws this
                  terminal's border, with the open one at full weight, and
                  drawing it twice puts a second, differently-weighted edge over
                  the top of the first. */}
              {editorSection !== 'toda' && form.boundary_area.length >= 3 && (
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
              {/*
                Every road this terminal runs, not just the first. The active one
                is heavier and drawn over the others, because it is the one the
                next tap extends and the only one whose ends are marked.
              */}
              {mapPickerMode === 'road' &&
                visibleEditorRoutes.map((route, index) => {
                  if (route.points.length < 2) return null;
                  const isActive = route.id === activeRoute?.id;
                  return (
                    <Polyline
                      key={route.id}
                      path={route.points}
                      options={{
                        // Every road of a terminal in the terminal's own colour —
                        // see the note in lib/terminalRoutes.
                        strokeColor: normalizeRouteColor(form.route_color),
                        strokeWeight: isActive ? 5 : 3,
                        strokeOpacity: isActive ? 0.9 : 0.4,
                        clickable: false,
                        geodesic: true,
                        zIndex: isActive ? 10 : 5,
                      }}
                    />
                  );
                })}
              {/*
                The active route's two ends, numbered in the route's own colour so
                a route point never reads as a border point on the same map.

                Only the ends are marked, though every tap is still stored. The
                intermediate pins were the single loudest thing on this map: a
                thirty-point route was thirty overlapping teardrops sitting on the
                road being plotted, hiding the very thing being judged — where the
                line actually falls — and making it impossible to see which of two
                nearby taps was which. What an admin needs from the shape is "where
                does it start and stop"; the bends are read off the line itself.

                The two ends are numbered 1 and 2, not 1 and N. Once the
                intermediate pins are gone the last point's real index is
                meaningless to anyone reading the map: a route of 110 plotted
                points ending in a "110" pin implies there were 109 others still
                standing, which is the opposite of what the map now shows. 1 and 2
                is the whole story the markers need to tell — first tap, last tap
                — and it stays true no matter how long the route is.
              */}
              {mapPickerMode === 'road' &&
                activeRoute &&
                !editorHiddenRouteIds.includes(activeRoute.id) &&
                activeRoute.points
                  .map((point, index) => ({ point, index }))
                  .filter(
                    ({ index }) =>
                      index === 0 || index === activeRoute.points.length - 1
                  )
                  .map(({ point, index }) => (
                    <Marker
                      key={`${point.lat}_${point.lng}_${index}`}
                      position={point}
                      title={index === 0 ? 'Route start' : 'Route end'}
                      icon={numberedPinIcon(
                        index === 0 ? 1 : 2,
                        normalizeRouteColor(form.route_color),
                      )}
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

            {/*
              The snapping warning, deliberately kept out of the guide.

              It is not something to go looking for: it explains why every tap
              landed away from the road, and behind a "?" an admin would be drawing
              straight lines across the map and blaming the map. A warning earns the
              corner the few times it is true.
            */}
            {mapPickerMode === 'road' && roadSnapUnavailable && (
              <div className="absolute top-3 left-3 z-[2015] max-w-sm pointer-events-none bg-white/95 backdrop-blur rounded-xl shadow-lg p-3">
                <p className="text-[11px] text-[var(--amber-dark)]">
                  Snapping to roads is unavailable, so points are placed exactly where
                  you tap. Allow the Roads API on the Maps key (Credentials → your key
                  → API restrictions) for lines that follow the road network.
                </p>
              </div>
            )}

            {/*
              The map's controls, left to right along the top-right corner: undo,
              redo, clear, then the "?" that opens the guide.

              One row, not a column. Read as a single toolbar — and the corner is
              wide and shallow, so a column of controls grew taller than the guide it
              replaced and started eating into the street the admin was plotting on.

              Undo and redo stay visible whenever there is anything to step through,
              including after every point has been undone, where the road is empty but
              redo still has work to do. Clear appears only once there is something to
              erase; the route and the border each gate it, which is what
              hasPlottedPoints above resolves.

              pointer-events-none on the wrapper so a tap between the buttons still
              plots a point; every control opts back in.
            */}
            <div className="absolute top-3 right-3 z-[2015] flex flex-col items-end gap-2 pointer-events-none">
              <div className="flex items-center gap-2">
                {mapPickerMode !== 'location' && (
                  <>
                    <button
                      type="button"
                      onClick={undoBoundary}
                      disabled={boundaryPast.length === 0}
                      aria-label="Undo point"
                      title="Undo point"
                      className="pointer-events-auto w-11 h-11 flex items-center justify-center bg-white/95 backdrop-blur border border-line rounded-xl shadow-lg text-[#122724] active:scale-95 disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed"
                    >
                      <Undo2 className="w-5 h-5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={redoBoundary}
                      disabled={boundaryFuture.length === 0}
                      aria-label="Redo point"
                      title="Redo point"
                      className="pointer-events-auto w-11 h-11 flex items-center justify-center bg-white/95 backdrop-blur border border-line rounded-xl shadow-lg text-[#122724] active:scale-95 disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed"
                    >
                      <Redo2 className="w-5 h-5" aria-hidden="true" />
                    </button>
                    {hasPlottedPoints && (
                      <button
                        type="button"
                        onClick={confirmClearBoundary}
                        aria-label={mapPickerMode === 'road' ? 'Clear road' : 'Clear border area'}
                        title={mapPickerMode === 'road' ? 'Clear road' : 'Clear border area'}
                        className="pointer-events-auto w-11 h-11 flex items-center justify-center bg-white/95 backdrop-blur border-2 border-[#bc4b1f] rounded-xl shadow-lg text-[#bc4b1f] active:scale-95"
                      >
                        <Eraser className="w-5 h-5" aria-hidden="true" />
                      </button>
                    )}
                  </>
                )}

                {/*
                  The "?" moved out of this block and up to the section column,
                  above the configuration and fares panels. It used to sit here
                  because the map was the only place with something to explain —
                  now every tab has a guide, and a "?" that vanished when you
                  left the map was worse than none.
                */}
              </div>
            </div>
            </div>
          </div>
          )}

          {/*
            The guide, for whichever tab is open.

            Floated against the section column rather than the map, so it is in
            the same place on all six tabs — a control that moved when you changed
            section would be read as belonging to the one you just left.

            pointer-events-none on the wrapper, as the undo controls above it:
            on a map tab a tap between the controls still has to reach the map.
          */}
          <div className="absolute top-3 right-3 z-[2015] flex flex-col items-end gap-2 pointer-events-none">
            <button
              type="button"
              onClick={toggleGuide}
              aria-expanded={guideOpen}
              aria-controls="map-editor-guide"
              aria-label={guideOpen ? 'Hide the guide' : 'Show the guide'}
              title={guideOpen ? 'Hide the guide' : 'Show the guide'}
              className={`pointer-events-auto w-11 h-11 flex items-center justify-center rounded-full border shadow-lg text-base font-bold active:scale-95 ${
                guideOpen
                  ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                  : 'bg-white/95 backdrop-blur border-line text-[#122724]'
              }`}
            >
              <span aria-hidden="true">?</span>
            </button>

            {guideOpen && (
              <div
                id="map-editor-guide"
                className="pointer-events-auto w-[22rem] max-w-[calc(100vw-1.5rem)] bg-white/95 backdrop-blur rounded-xl shadow-lg p-3"
              >
                <p className="text-sm font-semibold text-[#122724]">{editorGuide.title}</p>
                <p className="text-xs text-[#5c6b68] mt-1">{editorGuide.detail}</p>
                <p className="text-[11px] mt-1 text-[#5c6b68]">{editorGuide.note}</p>
              </div>
            )}
          </div>

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
                              // Through setCorridorWidth, so this and the Route tab's
                              // own width stay one number: this column is the mirror
                              // of the first route's buffer, and two fields writing
                              // it independently is how they end up disagreeing.
                              setCorridorWidth(e.target.value === '' ? NaN : Number(e.target.value))
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

                  const distance = (
                    key: 'base_fare_included_km' | 'delivery_fee_included_km',
                    label: string,
                    hint: string,
                    disabled = false,
                  ) => (
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] block mb-1">
                        {label}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        inputMode="decimal"
                        value={form[key]}
                        disabled={disabled}
                        aria-invalid={!!errors[key]}
                        aria-label={label}
                        onChange={e =>
                          setForm(f => ({
                            ...f,
                            [key]: e.target.value === '' ? NaN : Number(e.target.value),
                          }))
                        }
                        className={`w-full px-3 rounded-xl ${field} ${errors[key] ? invalid : ''} disabled:opacity-50`}
                      />
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

                  const optionalDistance = (
                    key: 'private_ride_fee_included_km',
                    label: string,
                    hint: string,
                    placeholder: string,
                    disabled = false,
                  ) => (
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] block mb-1">
                        {label}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.1"
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
                        className={`w-full px-3 rounded-xl ${field} ${errors[key] ? invalid : ''} disabled:opacity-50`}
                      />
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
                            'Charged once and covers the included distance.',
                            '20',
                          )}
                          {distance(
                            'base_fare_included_km',
                            'Base fare includes (km)',
                            'Per-km pricing starts after this distance. Defaults to 1 km.',
                            !fareColumns.baseDistance,
                          )}
                          {money(
                            'per_km',
                            'Fare per km',
                            'Charged only for distance beyond the base fare.',
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
                            'Base fare',
                            'Leave empty to charge the share ride base fare.',
                            'Same as share',
                            !fareColumns.privateRide,
                          )}
                          {optionalDistance(
                            'private_ride_fee_included_km',
                            'Base fare includes (km)',
                            'Leave empty to use the Share Ride distance.',
                            'Same as share',
                            !fareColumns.baseDistance,
                          )}
                          {optionalMoney(
                            'private_ride_fee_per_km',
                            'Price per km',
                            'Leave empty to use the Share Ride rate after the included distance.',
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
                            'Base fee',
                            'Leave empty to use the platform default.',
                            'Platform default',
                            !fareColumns.delivery,
                          )}
                          {distance(
                            'delivery_fee_included_km',
                            'Base fee includes (km)',
                            'Per-km pricing starts after this distance. Defaults to 1 km.',
                            !fareColumns.baseDistance || !fareColumns.delivery,
                          )}
                          {optionalMoney(
                            'delivery_fee_per_km',
                            'Price per km',
                            'Charged only for distance beyond the base fee.',
                            'Flat fee',
                            !fareColumns.delivery,
                          )}
                        </>,
                      )}

                      {(!fareColumns.privateRide || !fareColumns.delivery || !fareColumns.baseDistance) && (
                        <p className="text-xs text-[var(--amber-ink)] bg-[var(--amber-soft)] rounded-xl p-3">
                          {[
                            !fareColumns.privateRide ? 'ADD_TERMINAL_PRIVATE_RIDE_FEE.sql' : null,
                            !fareColumns.delivery ? 'ADD_TERMINAL_DELIVERY_AND_CAPACITY.sql' : null,
                            !fareColumns.baseDistance ? 'ADD_TERMINAL_BASE_DISTANCE.sql' : null,
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
