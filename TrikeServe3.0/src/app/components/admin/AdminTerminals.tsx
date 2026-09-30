import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, Edit2, Trash2, UserPlus, UserMinus, MapPin, Users, Menu, X, Navigation, Search, Loader2, Save,
  ClipboardCheck, CheckCircle, XCircle, Clock, ShieldCheck
} from "lucide-react";
import { GoogleMap, MarkerF, InfoWindow, Polygon } from "@react-google-maps/api";
import useMapLoader from "@/lib/mapLoader";
import { autocompletePlacesNew, createPlacesSessionToken, fetchPlaceDetailsNew } from "@/lib/placesApi";
import AdminSidebar from "./AdminSidebar";
import { supabase } from "../../../utils/supabase";
import { useAuth } from "../../contexts/AuthContext";
import {
  submitApprovalRequest,
  getApprovalRequests,
  getRiderAdmins,
  assignRiderAdminTerminal,
  getAdminTerminalAssignment,
  normalizeBoundaryPolygon,
  APPROVAL_REQUEST_LABELS,
  type ApprovalRequest,
  type RiderAdminSummary,
  type LatLngPoint,
} from "../../../lib/supabase";
import ConfirmationModal from "../ui/confirmation-modal";
import Toast from "../ui/Toast";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// Default centre for a new terminal's location / boundary picker — Gen T Deleon,
// Valenzuela City (same point the customer/business map selectors default to).
const DEFAULT_TERMINAL_CENTER = { lat: 14.7244, lng: 120.9668 };

interface Terminal {
  id: string;
  name: string;
  boundary: string;
  center_lat: number;
  center_lng: number;
  radius_km: number;
  is_active: boolean;
  rider_count: number;
  // Coverage area plotted on the map; null when no area has been drawn yet.
  boundary_polygon: LatLngPoint[] | null;
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
  { id: "t1", name: "Valenzuela Terminal", boundary: "Main Road, Valenzuela City", center_lat: 14.7294, center_lng: 120.9349, radius_km: 2.0, is_active: true, rider_count: 2, boundary_polygon: null },
  { id: "t2", name: "Malinta Terminal", boundary: "Malinta, Valenzuela City", center_lat: 14.7150, center_lng: 120.9500, radius_km: 1.5, is_active: true, rider_count: 1, boundary_polygon: null },
  { id: "t3", name: "Paso de Blas Terminal", boundary: "Paso de Blas, Valenzuela City", center_lat: 14.6950, center_lng: 120.9600, radius_km: 1.8, is_active: false, rider_count: 0, boundary_polygon: null },
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

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [terminals, setTerminals] = useState<Terminal[]>(getStoredTerminals());
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
  });
  const [showMapPicker, setShowMapPicker] = useState(false);
  // The map picker either moves the terminal pin or draws the coverage area.
  const [mapPickerMode, setMapPickerMode] = useState<'location' | 'boundary'>('location');
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
    setShowMapPicker(true);
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

  async function loadData() {
    const [dbTerminals, dbRiders] = await Promise.all([
      loadTerminalsFromSupabase(),
      loadRidersFromSupabase(),
    ]);
    if (dbTerminals) setTerminals(dbTerminals);
    if (dbRiders) setUsers(dbRiders);
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
        boundary_polygon: normalizeBoundaryPolygon(t.boundary_polygon),
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
    setForm({ name: "", boundary: "", center_lat: DEFAULT_TERMINAL_CENTER.lat, center_lng: DEFAULT_TERMINAL_CENTER.lng, is_active: true, boundary_polygon: [] });
    setEditTerminal(null);
    setMapPickerMode('location');
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
    });
    setEditTerminal(t);
    setMapPickerMode('location');
    setShowForm(true);
  }

  const handleFormMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();

    // In boundary mode every tap adds a corner of the coverage area; otherwise
    // the tap just moves the terminal pin.
    setForm(f =>
      mapPickerMode === 'boundary'
        ? { ...f, boundary_polygon: [...f.boundary_polygon, { lat, lng }] }
        : { ...f, center_lat: lat, center_lng: lng }
    );
  }, [mapPickerMode]);

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

  /** Error message when the plotted area can't be saved as-is, else null. */
  function boundaryValidationError(): string | null {
    // A started-but-unfinished shape (1–2 corners) can't enclose an area.
    if (form.boundary_polygon.length > 0 && form.boundary_polygon.length < 3) {
      return 'Add at least 3 points to the boundary area, or clear it.';
    }
    return null;
  }

  // Confirm before applying a coverage area — it decides which customer
  // drop-offs this terminal accepts.
  function confirmSaveTerminal() {
    if (!form.name || !form.boundary) return;

    const validationError = boundaryValidationError();
    if (validationError) {
      setToast({ message: validationError, variant: 'error' });
      return;
    }

    const points = form.boundary_polygon.length;
    const hadArea = (editTerminal?.boundary_polygon?.length ?? 0) >= 3;

    // Nothing area-related to confirm when no area was ever or is being plotted.
    if (points < 3 && !hadArea) {
      saveTerminal();
      return;
    }

    openModal({
      title: points >= 3 ? 'Confirm Boundary Area' : 'Remove Boundary Area',
      message:
        points >= 3
          ? `Save ${form.name} with this coverage area? It has ${points} plotted points, and ride requests whose drop-off falls outside every terminal's area will be rejected.${isRiderAdmin ? ' Your change will be sent to the Super Admin for approval.' : ''}`
          : `Save ${form.name} without a coverage area? Its boundary will no longer restrict customer drop-offs.`,
      variant: points >= 3 ? 'success' : 'warning',
      confirmLabel: points >= 3 ? 'Save Area' : 'Save',
      onConfirm: async () => {
        closeModal();
        await saveTerminal();
      },
    });
  }

  // Confirm before wiping the plotted area (available from the form and the map picker).
  function confirmClearBoundary() {
    const points = form.boundary_polygon.length;
    if (points === 0) return;

    openModal({
      title: 'Clear Boundary Area',
      message: `Remove all ${points} plotted point${points === 1 ? '' : 's'}? This terminal will have no coverage area until you plot one again, so its drop-offs will not be checked.`,
      variant: 'warning',
      confirmLabel: 'Clear Area',
      // The map picker sits at z-[500], so the dialog has to outrank it.
      zIndexClassName: 'z-[600]',
      onConfirm: () => {
        closeModal();
        setForm(f => ({ ...f, boundary_polygon: [] }));
      },
    });
  }

  async function saveTerminal() {
    if (!form.name || !form.boundary) return;
    if (boundaryValidationError()) return;

    const boundaryPolygon = form.boundary_polygon.length >= 3 ? form.boundary_polygon : null;

    const target: Terminal = editTerminal
      ? { ...editTerminal, name: form.name, boundary: form.boundary, center_lat: form.center_lat, center_lng: form.center_lng, is_active: form.is_active, boundary_polygon: boundaryPolygon }
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
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      if (error) {
        setToast({ message: `Save failed: ${error.message}`, variant: 'error' });
        return;
      }

      setTerminals(ts =>
        editTerminal ? ts.map(t => (t.id === editTerminal.id ? target : t)) : [...ts, target]
      );
      setShowForm(false);
      setShowMapPicker(false);
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
    setShowMapPicker(false);
    await loadMyRequests();
    setToast({ message: 'Terminal change submitted for Super Admin approval', variant: 'warning' });
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
    <div className="min-h-screen bg-[var(--muted)] flex">
      {/* Sidebar Navigation - hidden when map picker is open */}
      {!showMapPicker && (
        <AdminSidebar
          isMobileMenuOpen={isMobileMenuOpen}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
        />
      )}

      {/* Main Content */}
      <div className={`flex-1 ${!showMapPicker ? 'lg:ml-64' : ''}`}>
        {/* Top Header */}
        <div className="bg-surface border-b-2 border-[var(--border)] px-5 lg:px-8 py-4 lg:py-5 sticky top-0 z-50">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Hamburger Menu - Mobile Only */}
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 hover:bg-[var(--muted)] rounded-xl transition-all"
              >
                <Menu className="w-6 h-6 text-[var(--ink)]" />
              </button>
              <div>
                <h1 className="text-2xl lg:text-3xl font-extrabold text-[var(--ink)]">Terminal Management</h1>
                <p className="text-xs lg:text-sm text-[var(--muted-foreground)]">
                  {isRiderAdmin
                    ? (assignedTerminalName ? `Assigned to ${assignedTerminalName} · ${riders.length} drivers` : 'No terminal assigned')
                    : `${terminals.length} terminals · ${riders.length} drivers`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isRiderAdmin && hasPendingChanges && (
                <button
                  onClick={savePendingChanges}
                  className="flex items-center gap-2 px-4 lg:px-5 py-2.5 bg-[var(--success)] hover:bg-[var(--success)] text-white font-bold text-sm uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-lg shadow-[var(--success-soft)] animate-pulse"
                >
                  <Save size={16} /> Save Changes ({Object.keys(pendingChanges).length})
                </button>
              )}
              {isSuperAdmin && (
                <button
                  onClick={openCreate}
                  className="flex items-center gap-2 px-4 lg:px-5 py-2.5 bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-bold text-sm uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-lg shadow-[var(--error-soft)]"
                >
                  <Plus size={16} /> New Terminal
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 lg:p-8">
          {/* Pending Changes Banner */}
          {isRiderAdmin && hasPendingChanges && (
            <div className="mb-4 p-4 bg-[var(--amber-soft)] border-2 border-[var(--amber-soft)] rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-[var(--amber-dark)] text-sm">
                    ⚠️ {Object.keys(pendingChanges).length} pending change{Object.keys(pendingChanges).length > 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-[var(--amber-dark)] mt-0.5">
                    Changes are not applied until you click "Save Changes"
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPendingChanges({})}
                    className="text-xs font-semibold text-[var(--amber-dark)] hover:text-[var(--amber-dark)] underline"
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
                          <select
                            value={admin.terminal_id || ''}
                            disabled={savingAssignmentId === admin.id}
                            onChange={(e) => confirmAssignRiderAdmin(admin, e.target.value)}
                            className="px-3 py-2 border border-line rounded-xl font-semibold text-sm disabled:opacity-50"
                          >
                            <option value="">No terminal</option>
                            {terminals.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
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
              <p className={`font-bold text-sm ${assignedTerminalId ? 'text-[var(--info)]' : 'text-[var(--amber-dark)]'}`}>
                {assignedTerminalId
                  ? `Assigned to ${assignedTerminalName || 'your terminal'}`
                  : 'No terminal assigned'}
              </p>
              <p className={`text-xs mt-0.5 ${assignedTerminalId ? 'text-[var(--info)]/80' : 'text-[var(--amber-dark)]'}`}>
                {assignedTerminalId
                  ? 'You can only edit this terminal and manage its drivers. Changes are sent to the Super Admin for approval.'
                  : 'Ask the Super Admin to assign you to a terminal before you can manage drivers.'}
              </p>
            </div>
          )}

          {/* Rider Admin: status of their own submitted requests */}
          {isRiderAdmin && myRequests.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--muted-foreground)] mb-2 flex items-center gap-2">
                <ClipboardCheck size={16} /> My Submitted Requests
              </h2>
              <div className="space-y-2">
                {myRequests.slice(0, 8).map(req => {
                  const pending = req.status === 'pending';
                  const approved = req.status === 'approved';
                  const p = req.payload || {};
                  const summary = req.request_type.startsWith('terminal')
                    ? `${p.name || p.id || 'Terminal'}`
                    : `${p.driver_name || 'Driver'} → ${p.terminal_name || p.terminal_id || ''}`;
                  return (
                    <div
                      key={req.id}
                      className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border-2 ${
                        pending ? 'bg-[var(--amber-soft)] border-[var(--amber-soft)]' : approved ? 'bg-[var(--success-soft)] border-[var(--success-soft)]' : 'bg-[var(--error-soft)] border-[var(--error-soft)]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {pending ? <Clock size={15} className="text-[var(--amber-dark)] flex-shrink-0" />
                          : approved ? <CheckCircle size={15} className="text-[var(--success)] flex-shrink-0" />
                          : <XCircle size={15} className="text-[var(--error)] flex-shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--ink)] truncate">
                            {APPROVAL_REQUEST_LABELS[req.request_type]} — {summary}
                          </p>
                          {!pending && req.rejection_reason && (
                            <p className="text-xs text-[var(--error)] truncate">Reason: {req.rejection_reason}</p>
                          )}
                        </div>
                      </div>
                      <span className={`text-xs font-bold flex-shrink-0 ${
                        pending ? 'text-[var(--amber-dark)]' : approved ? 'text-[var(--success)]' : 'text-[var(--error)]'
                      }`}>
                        {pending ? 'Awaiting approval' : req.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isRiderAdmin && visibleTerminals.length === 0 ? (
            <div className="p-12 border-2 border-dashed border-[var(--border)] rounded-2xl text-center">
              <MapPin className="w-16 h-16 text-[var(--border)] mx-auto mb-4" />
              <p className="text-[var(--muted-foreground)] text-sm mb-2">No terminal assigned to you yet</p>
              <p className="text-[var(--muted-foreground)] text-xs">The Super Admin must assign you to a terminal</p>
            </div>
          ) : (
          <div className="grid gap-4">
            {visibleTerminals.map(t => {
              const termRiders = getRidersForTerminal(t.id);
              const unassigned = getUnassignedRiders();
              const isExpanded = expandedId === t.id;
              return (
                <div key={t.id} className="bg-surface rounded-2xl border border-line overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 bg-[var(--info-soft)] rounded-xl flex items-center justify-center flex-shrink-0">
                          <MapPin size={20} className="text-[var(--info)]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-[var(--ink)] text-lg">🚏 {t.name}</h3>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${t.is_active ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}>
                              {t.is_active ? "● Active" : "○ Inactive"}
                            </span>
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                t.boundary_polygon && t.boundary_polygon.length >= 3
                                  ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                                  : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                              }`}
                            >
                              {t.boundary_polygon && t.boundary_polygon.length >= 3
                                ? `Boundary: ${t.boundary_polygon.length} pts`
                                : "No boundary"}
                            </span>
                          </div>
                          <p className="text-[var(--muted-foreground)] text-sm mt-0.5">📍 {t.boundary}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-[var(--muted-foreground)]">
                            <span className="flex items-center gap-1"><Users size={12} />{termRiders.length} drivers</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : t.id)}
                          className="px-3 py-1.5 text-xs font-semibold text-[var(--info)] bg-[var(--info-soft)] rounded-lg hover:bg-[var(--info-soft)] transition-all"
                        >
                          {isExpanded ? "Hide" : "Drivers"}
                        </button>
                        {(isSuperAdmin || (isRiderAdmin && t.id === assignedTerminalId)) && (
                          <button
                            onClick={() => openEdit(t)}
                            className="w-8 h-8 bg-[var(--muted)] border border-line rounded-xl flex items-center justify-center hover:border-[var(--info)] transition-all active:scale-90"
                          >
                            <Edit2 size={14} className="text-[var(--muted-foreground)]" />
                          </button>
                        )}
                        {isSuperAdmin && (
                          <button
                            onClick={() => confirmDeleteTerminal(t.id)}
                            className="w-8 h-8 bg-[var(--error-soft)] border-2 border-[var(--error-soft)] rounded-xl flex items-center justify-center hover:border-[var(--error)] transition-all active:scale-90"
                          >
                            <Trash2 size={14} className="text-[var(--error)]" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t-2 border-[var(--border)] p-5 bg-[var(--muted)]">
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
                                  <span className="text-xs font-bold text-[var(--amber-dark)] bg-[var(--amber-soft)] px-2 py-0.5 rounded-full">
                                    ⏳ Pending removal
                                  </span>
                                )}
                              </div>
                              {isRiderAdmin && (isPending ? (
                                <button
                                  onClick={() => cancelPendingChange(r.id)}
                                  className="text-xs font-semibold text-[var(--amber-dark)] hover:text-[var(--amber-dark)] underline"
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
                                        className="flex items-center gap-2 px-3 py-2 bg-[var(--amber-soft)] border-2 border-[var(--amber-soft)] rounded-xl text-sm font-medium text-[var(--amber-dark)]"
                                      >
                                        <UserPlus size={13} className="text-[var(--amber)]" />
                                        {riderName(r)}
                                        <span className="text-xs text-[var(--amber)]">⏳ Queued</span>
                                      </button>
                                      <button
                                        onClick={() => cancelPendingChange(r.id)}
                                        className="text-xs font-semibold text-[var(--amber-dark)] hover:text-[var(--amber-dark)] underline"
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
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b-2 border-[var(--border)] sticky top-0 bg-surface z-10">
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
            <div className="p-5 space-y-4">
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
                  className="w-full h-40 bg-[var(--muted)] border border-line rounded-xl overflow-hidden cursor-pointer relative"
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
                      {form.boundary_polygon.length >= 3 && (
                        <Polygon
                          path={form.boundary_polygon}
                          options={{
                            fillColor: 'var(--primary)',
                            fillOpacity: 0.2,
                            strokeColor: 'var(--primary)',
                            strokeWeight: 2,
                            clickable: false,
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
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="bg-white/90 px-3 py-1 rounded-full text-xs font-semibold text-[var(--ink)] shadow">
                      📍 Tap to set location & boundary
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  Lat: {form.center_lat.toFixed(4)}, Lng: {form.center_lng.toFixed(4)}
                </p>

                {/* Boundary area status */}
                <div className="flex items-center justify-between mt-2 p-2.5 bg-[var(--muted)] rounded-xl">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--ink)]">Boundary Area</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {form.boundary_polygon.length >= 3
                        ? `${form.boundary_polygon.length} points plotted — drop-offs outside every terminal's area are rejected`
                        : form.boundary_polygon.length > 0
                          ? `${form.boundary_polygon.length} point${form.boundary_polygon.length === 1 ? '' : 's'} — add at least 3`
                          : 'Not set — tap the map to plot an area'}
                    </p>
                  </div>
                  {form.boundary_polygon.length > 0 && (
                    <button
                      onClick={confirmClearBoundary}
                      className="ml-3 flex-shrink-0 text-xs font-bold text-[var(--primary)] active:scale-95"
                    >
                      Clear
                    </button>
                  )}
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

      {/* Full-screen Map Picker */}
      {showMapPicker && (
        <div className="fixed inset-0 z-[500] bg-surface flex flex-col">
          <div className="bg-surface border-b border-[var(--border)] px-4 py-3 flex items-center justify-between gap-3">
            <button onClick={() => { setShowMapPicker(false); setShowMapSearchDropdown(false); setMapSearchQuery(""); }} className="active:scale-90 flex-shrink-0">
              <X className="w-6 h-6 text-[var(--ink)]" />
            </button>
            {/* Search Bar */}
            <div className="flex-1 relative">
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
                <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-line rounded-xl shadow-xl max-h-60 overflow-y-auto z-[600]">
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
            <button
              onClick={() => setShowMapPicker(false)}
              className="px-4 py-1.5 bg-[var(--primary)] text-white text-sm font-bold rounded-lg flex-shrink-0"
            >
              Done
            </button>
          </div>

          {/* Move the pin, or draw the coverage area */}
          <div className="flex gap-2 px-4 py-2 bg-surface border-b border-[var(--border)]">
            {([
              ['location', 'Terminal Location'],
              ['boundary', 'Boundary Area'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
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
              {/* Plotted coverage area */}
              {form.boundary_polygon.length >= 3 && (
                <Polygon
                  path={form.boundary_polygon}
                  options={{
                    fillColor: 'var(--primary)',
                    fillOpacity: 0.2,
                    strokeColor: 'var(--primary)',
                    strokeWeight: 2,
                    clickable: false,
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
            </GoogleMap>
            {/* Center crosshair — only while positioning the terminal pin */}
            {mapPickerMode === 'location' && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none">
                <MapPin className="w-8 h-8 text-[var(--primary)] drop-shadow-lg" />
              </div>
            )}
            <div className="absolute bottom-4 left-4 right-4">
              <div className="bg-white/95 backdrop-blur rounded-xl shadow-lg p-3">
                {mapPickerMode === 'boundary' ? (
                  <>
                    <p className="text-sm font-semibold text-[var(--ink)] text-center">
                      Tap the map to plot the boundary area
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)] text-center mt-0.5">
                      {form.boundary_polygon.length === 0
                        ? 'Add at least 3 points to close the area'
                        : form.boundary_polygon.length < 3
                          ? `${form.boundary_polygon.length} point${form.boundary_polygon.length === 1 ? '' : 's'} — add ${3 - form.boundary_polygon.length} more to enclose the area`
                          : `${form.boundary_polygon.length} points — area closed`}
                    </p>
                    {form.boundary_polygon.length > 0 && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => setForm(f => ({ ...f, boundary_polygon: f.boundary_polygon.slice(0, -1) }))}
                          className="flex-1 h-9 border border-line text-[var(--muted-foreground)] text-xs font-bold rounded-lg active:scale-95"
                        >
                          Undo Point
                        </button>
                        <button
                          onClick={confirmClearBoundary}
                          className="flex-1 h-9 border-2 border-[var(--primary)] text-[var(--primary)] text-xs font-bold rounded-lg active:scale-95"
                        >
                          Clear Area
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-[var(--ink)] text-center">
                      Tap anywhere to set terminal location
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)] text-center mt-0.5">
                      Current: {form.center_lat.toFixed(4)}, {form.center_lng.toFixed(4)}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={modalOpen}
        onCancel={closeModal}
        onConfirm={modalConfig?.onConfirm || (() => {})}
        title={modalConfig?.title || ''}
        message={modalConfig?.message || ''}
        variant={modalConfig?.variant || 'danger'}
        confirmLabel={modalConfig?.confirmLabel || 'Confirm'}
        zIndexClassName={modalConfig?.zIndexClassName}
      />

      {/* Toast */}
      <Toast
        message={toast?.message || ''}
        variant={toast?.variant || 'success'}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
