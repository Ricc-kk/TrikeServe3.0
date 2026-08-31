import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, Edit2, Trash2, UserPlus, UserMinus, MapPin, Users, Menu, X, Navigation, Search, Loader2
} from "lucide-react";
import { GoogleMap, MarkerF, InfoWindow } from "@react-google-maps/api";
import useMapLoader from "@/lib/mapLoader";
import { autocompletePlacesNew, createPlacesSessionToken, fetchPlaceDetailsNew } from "@/lib/placesApi";
import AdminSidebar from "./AdminSidebar";
import { supabase } from "../../../utils/supabase";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

interface Terminal {
  id: string;
  name: string;
  boundary: string;
  center_lat: number;
  center_lng: number;
  radius_km: number;
  is_active: boolean;
  rider_count: number;
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
  { id: "t1", name: "Valenzuela Terminal", boundary: "Main Road, Valenzuela City", center_lat: 14.7294, center_lng: 120.9349, radius_km: 2.0, is_active: true, rider_count: 2 },
  { id: "t2", name: "Malinta Terminal", boundary: "Malinta, Valenzuela City", center_lat: 14.7150, center_lng: 120.9500, radius_km: 1.5, is_active: true, rider_count: 1 },
  { id: "t3", name: "Paso de Blas Terminal", boundary: "Paso de Blas, Valenzuela City", center_lat: 14.6950, center_lng: 120.9600, radius_km: 1.8, is_active: false, rider_count: 0 },
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

function saveStoredTerminals(terminals: Terminal[]) {
  localStorage.setItem(TERMINALS_KEY, JSON.stringify(terminals));
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

function saveStoredUsers(users: StoredRider[]) {
  localStorage.setItem("trikeserve_users", JSON.stringify(users));
}

export default function AdminTerminals() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [terminals, setTerminals] = useState<Terminal[]>(getStoredTerminals());
  const [users, setUsers] = useState<StoredRider[]>(getAllUsers());
  const [showForm, setShowForm] = useState(false);
  const [editTerminal, setEditTerminal] = useState<Terminal | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", boundary: "", center_lat: 14.7294, center_lng: 120.9349, is_active: true });
  const [showMapPicker, setShowMapPicker] = useState(false);
  const { isLoaded: isMapsLoaded } = useMapLoader();
  const formMapRef = useRef<google.maps.Map | null>(null);
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [mapSearchResults, setMapSearchResults] = useState<any[]>([]);
  const [isMapSearching, setIsMapSearching] = useState(false);
  const [showMapSearchDropdown, setShowMapSearchDropdown] = useState(false);
  const [placesSessionToken, setPlacesSessionToken] = useState<string>(() => createPlacesSessionToken());

  // Load from Supabase when available; fall back to localStorage data otherwise.
  useEffect(() => {
    loadData();
  }, []);

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
        center_lat: t.center_lat ?? 14.7294,
        center_lng: t.center_lng ?? 120.9349,
        radius_km: t.radius_km ?? 2.0,
        is_active: t.is_active ?? true,
        rider_count: t.rider_count ?? 0,
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

  function openCreate() {
    setForm({ name: "", boundary: "", center_lat: 14.7294, center_lng: 120.9349, is_active: true });
    setEditTerminal(null);
    setShowForm(true);
  }

  function openEdit(t: Terminal) {
    setForm({ name: t.name, boundary: t.boundary, center_lat: t.center_lat, center_lng: t.center_lng, is_active: t.is_active });
    setEditTerminal(t);
    setShowForm(true);
  }

  /** Best-effort write to Supabase; the page keeps working offline via localStorage. */
  async function persistTerminal(t: Terminal) {
    try {
      const { error } = await supabase
        .from("terminals")
        .upsert(
          {
            id: t.id,
            name: t.name,
            boundary: t.boundary,
            center_lat: t.center_lat,
            center_lng: t.center_lng,
            radius_km: t.radius_km,
            is_active: t.is_active,
            rider_count: t.rider_count,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      if (error) console.error("Error saving terminal to Supabase:", error);
    } catch (error) {
      console.error("Error saving terminal to Supabase:", error);
    }
  }

  const handleFormMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setForm(f => ({ ...f, center_lat: lat, center_lng: lng }));
  }, []);

  const handleFormMapLoad = useCallback((map: google.maps.Map) => {
    formMapRef.current = map;
  }, []);

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

  function saveTerminal() {
    if (!form.name || !form.boundary) return;
    if (editTerminal) {
      const updated: Terminal = { ...editTerminal, name: form.name, boundary: form.boundary, center_lat: form.center_lat, center_lng: form.center_lng, is_active: form.is_active };
      persistTerminal(updated);
      setTerminals(ts => {
        const next = ts.map(t => (t.id === editTerminal.id ? updated : t));
        saveStoredTerminals(next);
        return next;
      });
    } else {
      const newT: Terminal = {
        id: `t_${Date.now()}`,
        name: form.name,
        boundary: form.boundary,
        center_lat: form.center_lat,
        center_lng: form.center_lng,
        radius_km: 2.0,
        is_active: form.is_active,
        rider_count: 0,
      };
      persistTerminal(newT);
      setTerminals(ts => {
        const next = [...ts, newT];
        saveStoredTerminals(next);
        return next;
      });
    }
    setShowForm(false);
    setShowMapPicker(false);
  }

  function deleteTerminal(id: string) {
    if (!confirm("Delete this terminal? Assigned drivers will be unassigned.")) return;
    const unassignIds = users.filter(u => riderTerminalId(u) === id).map(u => u.id);
    const updated = users.map(u =>
      riderTerminalId(u) === id
        ? { ...u, terminalId: undefined, terminalName: undefined, terminal_id: undefined, terminal_name: undefined }
        : u
    );
    setUsers(updated);
    saveStoredUsers(updated);
    setTerminals(ts => {
      const next = ts.filter(t => t.id !== id);
      saveStoredTerminals(next);
      return next;
    });
    // Best-effort Supabase sync: clear assignments, then remove the terminal.
    (async () => {
      try {
        if (unassignIds.length > 0) {
          await supabase
            .from("users")
            .update({ terminal_id: null, terminal_name: null })
            .in("id", unassignIds);
        }
        const { error } = await supabase.from("terminals").delete().eq("id", id);
        if (error) console.error("Error deleting terminal in Supabase:", error);
      } catch (error) {
        console.error("Error deleting terminal in Supabase:", error);
      }
    })();
  }

  function assignRider(riderId: string, terminalId: string, terminalName: string) {
    const updated = users.map(u =>
      u.id === riderId
        ? { ...u, terminalId, terminalName, terminal_id: terminalId, terminal_name: terminalName }
        : u
    );
    setUsers(updated);
    saveStoredUsers(updated);
    setTerminals(ts => {
      const next = ts.map(t => (t.id === terminalId ? { ...t, rider_count: t.rider_count + 1 } : t));
      saveStoredTerminals(next);
      return next;
    });
    // Best-effort Supabase sync of the rider's terminal assignment + update rider count.
    (async () => {
      try {
        const { error } = await supabase
          .from("users")
          .update({ terminal_id: terminalId, terminal_name: terminalName })
          .eq("id", riderId);
        if (error) console.error("Error assigning rider in Supabase:", error);
        // Recount riders for this terminal and update rider_count in DB
        const { data: riders } = await supabase
          .from("users")
          .select("id")
          .eq("terminal_id", terminalId);
        const count = (riders || []).length;
        await supabase.from("terminals").update({ rider_count: count }).eq("id", terminalId);
      } catch (error) {
        console.error("Error assigning rider in Supabase:", error);
      }
    })();
  }

  function unassignRider(riderId: string, terminalId: string) {
    const updated = users.map(u =>
      u.id === riderId
        ? { ...u, terminalId: undefined, terminalName: undefined, terminal_id: undefined, terminal_name: undefined }
        : u
    );
    setUsers(updated);
    saveStoredUsers(updated);
    setTerminals(ts => {
      const next = ts.map(t => (t.id === terminalId ? { ...t, rider_count: Math.max(0, t.rider_count - 1) } : t));
      saveStoredTerminals(next);
      return next;
    });
    // Best-effort Supabase sync: clear the rider's terminal assignment + update rider count.
    (async () => {
      try {
        const { error } = await supabase
          .from("users")
          .update({ terminal_id: null, terminal_name: null })
          .eq("id", riderId);
        if (error) console.error("Error unassigning rider in Supabase:", error);
        // Recount remaining riders for this terminal
        const { data: riders } = await supabase
          .from("users")
          .select("id")
          .eq("terminal_id", terminalId);
        const count = (riders || []).length;
        await supabase.from("terminals").update({ rider_count: count }).eq("id", terminalId);
      } catch (error) {
        console.error("Error unassigning rider in Supabase:", error);
      }
    })();
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex">
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
        <div className="bg-white border-b-2 border-[#E2E8F0] px-5 lg:px-8 py-4 lg:py-5 sticky top-0 z-50">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Hamburger Menu - Mobile Only */}
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 hover:bg-[#F8F9FA] rounded-xl transition-all"
              >
                <Menu className="w-6 h-6 text-[#121212]" />
              </button>
              <div>
                <h1 className="text-2xl lg:text-3xl font-extrabold text-[#121212]">Terminal Management</h1>
                <p className="text-xs lg:text-sm text-[#64748B]">
                  {terminals.length} terminals · {riders.length} drivers
                </p>
              </div>
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 lg:px-5 py-2.5 bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold text-sm uppercase tracking-wide rounded-xl transition-all active:scale-95 shadow-lg shadow-red-200"
            >
              <Plus size={16} /> New Terminal
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 lg:p-8">
          <div className="grid gap-4">
            {terminals.map(t => {
              const termRiders = getRidersForTerminal(t.id);
              const unassigned = getUnassignedRiders();
              const isExpanded = expandedId === t.id;
              return (
                <div key={t.id} className="bg-white rounded-2xl border-2 border-[#E2E8F0] overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 bg-[#DBEAFE] rounded-xl flex items-center justify-center flex-shrink-0">
                          <MapPin size={20} className="text-[#3B82F6]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-[#121212] text-lg">🚏 {t.name}</h3>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${t.is_active ? "bg-green-100 text-green-700" : "bg-[#F8F9FA] text-[#64748B]"}`}>
                              {t.is_active ? "● Active" : "○ Inactive"}
                            </span>
                          </div>
                          <p className="text-[#64748B] text-sm mt-0.5">📍 {t.boundary}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-[#64748B]">
                            <span className="flex items-center gap-1"><Users size={12} />{termRiders.length} drivers</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : t.id)}
                          className="px-3 py-1.5 text-xs font-semibold text-[#3B82F6] bg-[#DBEAFE] rounded-lg hover:bg-blue-200 transition-all"
                        >
                          {isExpanded ? "Hide" : "Drivers"}
                        </button>
                        <button
                          onClick={() => openEdit(t)}
                          className="w-8 h-8 bg-[#F8F9FA] border-2 border-[#E2E8F0] rounded-xl flex items-center justify-center hover:border-[#3B82F6] transition-all active:scale-90"
                        >
                          <Edit2 size={14} className="text-[#64748B]" />
                        </button>
                        <button
                          onClick={() => deleteTerminal(t.id)}
                          className="w-8 h-8 bg-red-50 border-2 border-red-100 rounded-xl flex items-center justify-center hover:border-red-300 transition-all active:scale-90"
                        >
                          <Trash2 size={14} className="text-[#EF4444]" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t-2 border-[#E2E8F0] p-5 bg-[#F8F9FA]">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-3">
                        Assigned Drivers ({termRiders.length})
                      </h4>
                      <div className="space-y-2 mb-4">
                        {termRiders.length === 0 && (
                          <p className="text-sm text-[#64748B] italic">No drivers assigned yet</p>
                        )}
                        {termRiders.map(r => (
                          <div key={r.id} className="flex items-center justify-between bg-white rounded-xl border-2 border-[#E2E8F0] px-4 py-2.5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-[#DBEAFE] rounded-lg flex items-center justify-center text-[#3B82F6] font-bold text-xs">
                                {riderName(r)[0]?.toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-[#121212]">{riderName(r)}</p>
                                <p className="text-xs text-[#64748B]">{riderPlate(r) || "No plate"}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => unassignRider(r.id, t.id)}
                              className="flex items-center gap-1 text-xs font-semibold text-[#EF4444] bg-red-50 border border-red-100 px-2.5 py-1.5 rounded-lg hover:bg-red-100 transition-all active:scale-95"
                            >
                              <UserMinus size={12} /> Unassign
                            </button>
                          </div>
                        ))}
                      </div>

                      {unassigned.length > 0 && (
                        <>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-2">Assign Driver</h4>
                          <div className="flex flex-wrap gap-2">
                            {unassigned.map(r => (
                              <button
                                key={r.id}
                                onClick={() => assignRider(r.id, t.id, t.name)}
                                className="flex items-center gap-2 px-3 py-2 bg-white border-2 border-[#E2E8F0] hover:border-[#10B981] rounded-xl transition-all active:scale-95 text-sm font-medium"
                              >
                                <UserPlus size={13} className="text-[#10B981]" />
                                {riderName(r)}
                                {riderPlate(r) && <span className="text-xs text-[#64748B]">{riderPlate(r)}</span>}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b-2 border-[#E2E8F0]">
              <h3 className="font-extrabold text-lg text-[#121212]">
                {editTerminal ? "Edit Terminal" : "New Terminal"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-full bg-[#F8F9FA] flex items-center justify-center"
              >
                <X size={16} className="text-[#64748B]" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {([
                ["name", "Terminal Name", "e.g. Valenzuela Terminal"],
                ["boundary", "Boundary / Area", "e.g. Main Road, Valenzuela City"],
              ] as const).map(([k, label, placeholder]) => (
                <div key={k}>
                  <label className="text-xs font-semibold uppercase tracking-wide text-[#64748B] block mb-1">
                    {label}
                  </label>
                  <input
                    value={form[k]}
                    onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full h-11 px-4 border-2 border-[#CBD5E1] focus:border-[#E11D48] rounded-xl text-sm outline-none"
                  />
                </div>
              ))}

              {/* Terminal Location on Map */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-[#64748B] block mb-1">
                  Terminal Location
                </label>
                <div
                  className="w-full h-40 bg-[#F8F9FA] border-2 border-[#CBD5E1] rounded-xl overflow-hidden cursor-pointer relative"
                  onClick={() => setShowMapPicker(true)}
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
                      <MarkerF position={{ lat: form.center_lat, lng: form.center_lng }} />
                    </GoogleMap>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <p className="text-xs text-[#64748B]">Loading map...</p>
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="bg-white/90 px-3 py-1 rounded-full text-xs font-semibold text-[#121212] shadow">
                      📍 Tap to change location
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Lat: {form.center_lat.toFixed(4)}, Lng: {form.center_lng.toFixed(4)}
                </p>
              </div>

              {/* Active/Inactive Toggle */}
              <div className="flex items-center justify-between p-3 bg-[#F8F9FA] rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-[#121212]">Active Terminal</p>
                  <p className="text-xs text-[#64748B]">Visible to customers for pickup</p>
                </div>
                <button
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`relative w-12 h-7 rounded-full transition-colors ${form.is_active ? 'bg-[#10B981]' : 'bg-[#CBD5E1]'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-5' : ''}`} />
                </button>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 h-11 border-2 border-[#CBD5E1] text-[#64748B] font-bold uppercase text-sm rounded-xl active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={saveTerminal}
                  className="flex-1 h-11 bg-[#E11D48] text-white font-bold uppercase text-sm rounded-xl active:scale-95 hover:bg-[#BE123C] transition-all"
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
        <div className="fixed inset-0 z-[500] bg-white flex flex-col">
          <div className="bg-white border-b border-[#E2E8F0] px-4 py-3 flex items-center justify-between gap-3">
            <button onClick={() => { setShowMapPicker(false); setShowMapSearchDropdown(false); setMapSearchQuery(""); }} className="active:scale-90 flex-shrink-0">
              <X className="w-6 h-6 text-[#121212]" />
            </button>
            {/* Search Bar */}
            <div className="flex-1 relative">
              <div className="flex items-center gap-2 px-3 py-2 bg-[#F8F9FA] border-2 border-[#E2E8F0] rounded-xl">
                <Search className="w-4 h-4 text-[#64748B] flex-shrink-0" />
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
                  className="flex-1 text-sm font-semibold text-[#121212] placeholder:text-[#94A3B8] placeholder:font-normal outline-none bg-transparent"
                />
                {isMapSearching ? (
                  <Loader2 className="w-4 h-4 text-[#64748B] animate-spin flex-shrink-0" />
                ) : (
                  mapSearchQuery && (
                    <button onClick={() => { setMapSearchQuery(""); setMapSearchResults([]); setShowMapSearchDropdown(false); }} className="flex-shrink-0">
                      <X className="w-4 h-4 text-[#64748B]" />
                    </button>
                  )
                )}
              </div>
              {/* Search Results Dropdown */}
              {showMapSearchDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-[#E2E8F0] rounded-xl shadow-xl max-h-60 overflow-y-auto z-[600]">
                  {mapSearchResults.length > 0 ? (
                    mapSearchResults.map((result: any, index: number) => (
                      <button
                        key={result.place_id || index}
                        onClick={() => handleMapSearchPick(result)}
                        className="w-full p-3 border-b border-[#E2E8F0] last:border-b-0 hover:bg-[#F8F9FA] active:bg-[#F1F5F9] transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-[#F8F9FA] rounded-full flex items-center justify-center flex-shrink-0">
                            <MapPin className="w-4 h-4 text-[#64748B]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-[#121212] truncate">{result.displayName}</p>
                            {result.secondaryText && (
                              <p className="text-xs text-[#64748B] truncate">{result.secondaryText}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-3">
                      <p className="text-sm text-[#64748B] text-center">
                        {isMapSearching ? "Searching..." : !GOOGLE_MAPS_API_KEY ? "Search unavailable" : "No results found"}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowMapPicker(false)}
              className="px-4 py-1.5 bg-[#E11D48] text-white text-sm font-bold rounded-lg flex-shrink-0"
            >
              Done
            </button>
          </div>
          <div className="flex-1 relative">
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={{ lat: form.center_lat, lng: form.center_lng }}
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
            </GoogleMap>
            {/* Center crosshair */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none">
              <MapPin className="w-8 h-8 text-[#E11D48] drop-shadow-lg" />
            </div>
            <div className="absolute bottom-4 left-4 right-4">
              <div className="bg-white/95 backdrop-blur rounded-xl shadow-lg p-3 text-center">
                <p className="text-sm font-semibold text-[#121212]">Tap anywhere to set terminal location</p>
                <p className="text-xs text-[#64748B]">Current: {form.center_lat.toFixed(4)}, {form.center_lng.toFixed(4)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
