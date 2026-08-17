import { useState, useEffect } from "react";
import {
  Plus, Edit2, Trash2, UserPlus, UserMinus, MapPin, Users, Menu, X
} from "lucide-react";
import AdminSidebar from "./AdminSidebar";
import { supabase } from "../../../utils/supabase";

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
  const [form, setForm] = useState({ name: "", boundary: "" });

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
    setForm({ name: "", boundary: "" });
    setEditTerminal(null);
    setShowForm(true);
  }

  function openEdit(t: Terminal) {
    setForm({ name: t.name, boundary: t.boundary });
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

  function saveTerminal() {
    if (!form.name || !form.boundary) return;
    if (editTerminal) {
      const updated: Terminal = { ...editTerminal, name: form.name, boundary: form.boundary };
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
        center_lat: 14.7294,
        center_lng: 120.9349,
        radius_km: 2.0,
        is_active: true,
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
  }

  function deleteTerminal(id: string) {
    if (!confirm("Delete this terminal? Assigned riders will be unassigned.")) return;
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
    // Best-effort Supabase sync of the rider's terminal assignment.
    (async () => {
      try {
        const { error } = await supabase
          .from("users")
          .update({ terminal_id: terminalId, terminal_name: terminalName })
          .eq("id", riderId);
        if (error) console.error("Error assigning rider in Supabase:", error);
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
    // Best-effort Supabase sync: clear the rider's terminal assignment.
    (async () => {
      try {
        const { error } = await supabase
          .from("users")
          .update({ terminal_id: null, terminal_name: null })
          .eq("id", riderId);
        if (error) console.error("Error unassigning rider in Supabase:", error);
      } catch (error) {
        console.error("Error unassigning rider in Supabase:", error);
      }
    })();
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex">
      {/* Sidebar Navigation */}
      <AdminSidebar
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
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
                            <span>Radius {t.radius_km}km</span>
                            <span>({t.center_lat.toFixed(4)}, {t.center_lng.toFixed(4)})</span>
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
    </div>
  );
}
