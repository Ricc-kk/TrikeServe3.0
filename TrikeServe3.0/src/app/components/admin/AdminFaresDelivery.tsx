import { useCallback, useEffect, useRef, useState } from "react";
import { Banknote, Loader2, Save, Users, Truck, TriangleAlert } from "lucide-react";

import { supabase } from "../../../utils/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { DEFAULT_MAX_PASSENGERS } from "@/lib/pricing";
import { logAudit } from "../../../lib/supabase";
import AdminShell from "./AdminShell";
import Toast from "../ui/Toast";
import EmptyState from "../ui/EmptyState";

/**
 * Fares, delivery and capacity, per terminal.
 *
 * Three numbers that decide what a customer is charged and what they are allowed
 * to book, set in one place because they are read together: a terminal's ride
 * fare, what it charges to deliver food, and how many riders it can carry.
 *
 * The ride fare (base + per km) could already be edited on the Terminals screen.
 * It is here too rather than only there, because setting a fare is the reason to
 * open this page and making people cross over to a screen otherwise about
 * boundaries and riders to do it is the kind of two-step that quietly stops
 * happening -- a terminal left on the default fare because nobody found the field.
 *
 * The other two are new. `delivery_fee` and `max_passengers` live on the terminal
 * row and need ADD_TERMINAL_DELIVERY_AND_CAPACITY.sql to have been run; until it
 * has, they are reported as unavailable rather than silently not saving.
 */

type Terminal = {
  id: string;
  name: string;
  base_fare: number | null;
  per_km: number | null;
  delivery_fee: number | null;
  delivery_fee_per_km: number | null;
  max_passengers: number | null;
  is_active: boolean;
};

/** What is being edited for one terminal. */
type Draft = {
  base_fare: string;
  per_km: string;
  /** Blank means "use the platform default", not zero. */
  delivery_fee: string;
  /** Blank or 0 means the delivery fee is flat. */
  delivery_fee_per_km: string;
  /** Blank means the platform default of 4. */
  max_passengers: string;
};

const draftOf = (t: Terminal): Draft => ({
  base_fare: t.base_fare != null ? String(t.base_fare) : "",
  per_km: t.per_km != null ? String(t.per_km) : "",
  delivery_fee: t.delivery_fee != null ? String(t.delivery_fee) : "",
  delivery_fee_per_km: t.delivery_fee_per_km != null ? String(t.delivery_fee_per_km) : "",
  max_passengers: t.max_passengers != null ? String(t.max_passengers) : String(DEFAULT_MAX_PASSENGERS),
});

/**
 * Read a money field, treating blank and nonsense alike.
 *
 * Blank is deliberately not zero: an emptied box means "not set here", and the
 * platform default should apply. Writing 0 instead would silently start charging
 * nothing, which is the kind of mistake nobody notices until a rider is unpaid.
 */
const readMoney = (raw: string, fallback: number): number => {
  const n = parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/**
 * Read the seat count.
 *
 * Blank is not "uncapped" -- it is "use the default". A shared ride has always
 * been a fixed list of seats on the customer's side, so an uncapped terminal could
 * not do anything a capped one could not; it only moved the guess somewhere less
 * visible.
 */
const readPassengers = (raw: string): number => {
  const n = parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_MAX_PASSENGERS;
};

/**
 * Blank -> null, otherwise a non-negative amount.
 *
 * Shared by the delivery base and its per-km rate: blank means "not set here" in
 * both cases, and for the per-km rate specifically it means the fee is flat.
 */
const readOptionalMoney = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export default function AdminFaresDelivery() {
  const { user } = useAuth();
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  /**
   * Whether the new columns exist yet.
   *
   * A null value in the row could mean "not set" or "no such column", and those
   * need opposite handling: the first is editable, the second is not. Read once
   * from the first row rather than probed separately, since the same select
   * already tells us.
   */
  const extraColumnsExist = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await supabase
        .from("terminals")
        .select("id, name, base_fare, per_km, delivery_fee, delivery_fee_per_km, max_passengers, is_active")
        .order("name", { ascending: true });

      let rows = (result.data ?? []) as Terminal[];

      /*
       * Read again without the new columns if the database does not have them yet.
       *
       * Selecting a column that does not exist fails the *entire* query, not just
       * that field, so before ADD_TERMINAL_DELIVERY_AND_CAPACITY.sql has run this
       * returns no terminals at all and the screen says "No terminals yet" -- on a
       * system that plainly has three. Retrying with what does exist is the only
       * way to tell "no terminals" from "these columns are missing", and it still
       * leaves the fares editable, which is the point of the fallback.
       */
      if (result.error) {
        const fallback = await supabase
          .from("terminals")
          .select("id, name, base_fare, per_km, is_active")
          .order("name", { ascending: true });
        if (fallback.error) throw fallback.error;
        rows = (fallback.data ?? []) as Terminal[];
        extraColumnsExist.current = false;
      }

      setTerminals(rows);
      setDrafts(Object.fromEntries(rows.map((t) => [t.id, draftOf(t)])));
    } catch (err) {
      setToast({ message: `Could not load terminals: ${(err as Error).message}`, variant: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const saveTerminal = async (terminal: Terminal) => {
    const draft = drafts[terminal.id];
    if (!draft) return;
    setSavingId(terminal.id);

    // A shop cannot set a fare below zero, and an empty box means "leave it as
    // the platform default" rather than "charge nothing".
    const base_fare = readMoney(draft.base_fare, 20);
    const per_km = readMoney(draft.per_km, 10);
    const delivery_fee = readOptionalMoney(draft.delivery_fee);
    const delivery_fee_per_km = readOptionalMoney(draft.delivery_fee_per_km);
    const max_passengers = readPassengers(draft.max_passengers);

    // Only send the new columns once they are known to exist, so this screen
    // keeps saving fares on a database that has not run the migration rather
    // than failing every save with a PostgREST error.
    const patch: Record<string, unknown> = {
      base_fare,
      per_km,
      updated_at: new Date().toISOString(),
    };
    if (extraColumnsExist.current) {
      patch.delivery_fee = delivery_fee;
      patch.delivery_fee_per_km = delivery_fee_per_km;
      patch.max_passengers = max_passengers;
    }

    const { error } = await supabase.from("terminals").update(patch).eq("id", terminal.id);

    if (error) {
      setToast({ message: `Save failed: ${error.message}`, variant: "error" });
      setSavingId(null);
      return;
    }

    setTerminals((prev) =>
      prev.map((t) => {
        if (t.id !== terminal.id) return t;
        return {
          ...t,
          base_fare,
          per_km,
          ...(extraColumnsExist.current
            ? { delivery_fee, delivery_fee_per_km, max_passengers }
            : {}),
        };
      }),
    );
    setDrafts((prev) => ({ ...prev, [terminal.id]: draftOf({ ...terminal, base_fare, per_km }) }));

    logAudit({
      action: "update_terminal_rates",
      actorRole: "admin",
      entityType: "terminal",
      entityId: terminal.id,
      summary: `Updated fares for ${terminal.name}`,
      details: { base_fare, per_km, delivery_fee, delivery_fee_per_km, max_passengers },
      actorEmail: user?.email,
      actorName: user?.name,
    });

    setToast({ message: `${terminal.name} saved`, variant: "success" });
    setSavingId(null);
  };

  const dirty = (t: Terminal) => {
    const d = drafts[t.id];
    if (!d) return false;
    const current = draftOf(t);
    return (
      d.base_fare !== current.base_fare ||
      d.per_km !== current.per_km ||
      d.delivery_fee !== current.delivery_fee ||
      d.delivery_fee_per_km !== current.delivery_fee_per_km ||
      d.max_passengers !== current.max_passengers
    );
  };

  const field =
    "w-full rounded-xl border border-line bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--ink)] outline-none focus:border-[var(--primary)]";
  const label = "block text-xs font-bold text-[var(--ink)] mb-1";

  return (
    <AdminShell title="Fares & Delivery" subtitle="Ride fare, delivery fee and passenger capacity per terminal">
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}

      {!extraColumnsExist.current && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[var(--amber)] bg-[var(--amber-soft)] p-4">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-[var(--amber)]" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-bold text-[var(--amber-ink)]">
              Delivery fee and passenger limits cannot be saved yet
            </p>
            <p className="mt-1 text-sm text-[var(--amber-ink)]">
              Run <span className="font-bold">ADD_TERMINAL_DELIVERY_AND_CAPACITY.sql</span> in
              Supabase. Ride fares below will still save.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-[var(--muted-foreground)]">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          Loading terminals…
        </div>
      ) : terminals.length === 0 ? (
        <EmptyState
          title="No terminals yet"
          description="Add a terminal first, then set its fares here."
        />
      ) : (
        <div className="space-y-4">
          {terminals.map((terminal) => {
            const draft = drafts[terminal.id] ?? draftOf(terminal);
            const saving = savingId === terminal.id;
            const changed = dirty(terminal);
            return (
              <section
                key={terminal.id}
                className="rounded-2xl border border-line bg-[var(--surface)] p-4 sm:p-5"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold text-[var(--ink)]">
                      {terminal.name}
                    </h2>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {terminal.is_active ? "Active" : "Inactive"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => saveTerminal(terminal)}
                    disabled={saving || !changed}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 font-bold transition-all active:scale-[0.97] ${
                      changed
                        ? "bg-[var(--success)] text-white hover:opacity-90"
                        : "bg-[var(--border)] text-[var(--muted-foreground)]"
                    }`}
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Save className="size-4" aria-hidden="true" />
                    )}
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className={label} htmlFor={`base-${terminal.id}`}>
                      <Banknote className="mr-1 inline size-3.5" aria-hidden="true" />
                      Base fare (₱)
                    </label>
                    <input
                      id={`base-${terminal.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={draft.base_fare}
                      onChange={(e) => setDraft(terminal.id, { base_fare: e.target.value })}
                      className={field}
                    />
                  </div>

                  <div>
                    <label className={label} htmlFor={`perkm-${terminal.id}`}>
                      Per km (₱)
                    </label>
                    <input
                      id={`perkm-${terminal.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={draft.per_km}
                      onChange={(e) => setDraft(terminal.id, { per_km: e.target.value })}
                      className={field}
                    />
                  </div>

                  <div>
                    <label className={label} htmlFor={`del-${terminal.id}`}>
                      <Truck className="mr-1 inline size-3.5" aria-hidden="true" />
                      Delivery fee (₱)
                    </label>
                    <input
                      id={`del-${terminal.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={draft.delivery_fee}
                      placeholder="Platform default"
                      disabled={!extraColumnsExist.current}
                      onChange={(e) => setDraft(terminal.id, { delivery_fee: e.target.value })}
                      className={field}
                    />
                    <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                      Blank uses the platform default.
                    </p>
                  </div>

                  <div>
                    <label className={label} htmlFor={`delkm-${terminal.id}`}>
                      Delivery per km (₱)
                    </label>
                    <input
                      id={`delkm-${terminal.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={draft.delivery_fee_per_km}
                      placeholder="Flat fee"
                      disabled={!extraColumnsExist.current}
                      onChange={(e) =>
                        setDraft(terminal.id, { delivery_fee_per_km: e.target.value })
                      }
                      className={field}
                    />
                    <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                      Blank charges a flat delivery fee.
                    </p>
                  </div>

                  <div>
                    <label className={label} htmlFor={`pax-${terminal.id}`}>
                      <Users className="mr-1 inline size-3.5" aria-hidden="true" />
                      Passengers allowed
                    </label>
                    <input
                      id={`pax-${terminal.id}`}
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={draft.max_passengers}
                      placeholder={String(DEFAULT_MAX_PASSENGERS)}
                      disabled={!extraColumnsExist.current}
                      onChange={(e) => setDraft(terminal.id, { max_passengers: e.target.value })}
                      className={field}
                    />
                    <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                      Shared rides only. Defaults to {DEFAULT_MAX_PASSENGERS}.
                    </p>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}