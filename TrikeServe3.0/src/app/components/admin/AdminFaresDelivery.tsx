import { useCallback, useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { Car, ChevronDown, ChevronUp, Loader2, Save, Users, Truck, TriangleAlert, Search, MapPin, CheckCircle, Pencil } from "lucide-react";

import { supabase } from "../../../utils/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { DEFAULT_MAX_PASSENGERS } from "@/lib/pricing";
import { logAudit } from "../../../lib/supabase";
import AdminShell from "./AdminShell";
import AdminPageIntro, { AdminMetricCards } from "./AdminPageIntro";
import Toast from "../ui/Toast";
import EmptyState from "../ui/EmptyState";

/**
 * Fares, delivery and capacity, per terminal.
 *
 * The numbers that decide what a customer is charged and what they are allowed
 * to book, set in one place because they are read together. They are grouped
 * here by what the customer is buying -- Share Ride, Private Ride, Delivery --
 * rather than by which SQL file added the column, because that grouping is how
 * the fare reads to the person setting it: a row of six unlabelled money boxes
 * made "which of these is the private ride price?" a real question.
 *
 * Each group is its own base + per-km pair. A private ride books the whole
 * vehicle and can be priced differently from a shared seat, and each half falls
 * back to the shared ride rate when a terminal has not set it, so no terminal
 * is repriced just by running a migration.
 *
 * The ride fare (base + per km) could already be edited on the Terminals screen.
 * It is here too rather than only there, because setting a fare is the reason to
 * open this page and making people cross over to a screen otherwise about
 * boundaries and riders to do it is the kind of two-step that quietly stops
 * happening -- a terminal left on the default fare because nobody found the field.
 *
 * The optional columns arrived in separate migrations, each needing its own SQL
 * file run: `delivery_fee` and `max_passengers` from
 * ADD_TERMINAL_DELIVERY_AND_CAPACITY.sql, and the private ride columns from
 * ADD_TERMINAL_PRIVATE_RIDE_FEE.sql. Until one has been, the fields it owns are
 * reported as unavailable rather than silently not saving -- and each group is
 * tracked separately, so running one migration without the other still leaves
 * everything that works editable.
 */

type Terminal = {
  id: string;
  name: string;
  base_fare: number | null;
  per_km: number | null;
  delivery_fee: number | null;
  delivery_fee_per_km: number | null;
  max_passengers: number | null;
  private_ride_fee: number | null;
  private_ride_fee_per_km: number | null;
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
  /** Blank means "same as the share ride price", not zero. */
  private_ride_fee: string;
  /** Blank means "same as the share ride per-km rate". */
  private_ride_fee_per_km: string;
};

const draftOf = (t: Terminal): Draft => ({
  base_fare: t.base_fare != null ? String(t.base_fare) : "",
  per_km: t.per_km != null ? String(t.per_km) : "",
  delivery_fee: t.delivery_fee != null ? String(t.delivery_fee) : "",
  delivery_fee_per_km: t.delivery_fee_per_km != null ? String(t.delivery_fee_per_km) : "",
  max_passengers: t.max_passengers != null ? String(t.max_passengers) : String(DEFAULT_MAX_PASSENGERS),
  private_ride_fee: t.private_ride_fee != null ? String(t.private_ride_fee) : "",
  private_ride_fee_per_km: t.private_ride_fee_per_km != null ? String(t.private_ride_fee_per_km) : "",
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
 * Shared by the delivery base, its per-km rate and the private ride surcharge:
 * blank means "not set here" in all three cases, and for the per-km rate and the
 * surcharge specifically it means "charge nothing extra".
 */
const readOptionalMoney = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * One category a customer can buy: a heading, what it costs, and its fields.
 *
 * Grouped this way so the screen answers "what does a private ride cost here?"
 * without arithmetic across an undifferentiated list of money boxes. The blurb
 * says what the group is *for*, which is the part the field names alone never
 * made obvious -- "Price" next to a delivery fee and "Price" next to a ride fare
 * are the same word meaning two different things.
 */
type FareGroupProps = {
  title: string;
  blurb: string;
  icon: ElementType;
  children: ReactNode;
};

function FareGroup({ title, blurb, icon: Icon, children }: FareGroupProps) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-soft/40 p-4">
      <div className="mb-3 flex items-start gap-2.5">
        <Icon className="mt-0.5 size-5 shrink-0 text-[var(--primary)]" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[var(--ink)]">{title}</h3>
          <p className="text-xs text-[var(--muted-foreground)]">{blurb}</p>
        </div>
      </div>
      <div className="grid gap-4 @min-[24rem]:grid-cols-2">{children}</div>
    </div>
  );
}

/**
 * One terminal's whole pricing, in a row, instead of three panels of fields.
 *
 * Built from the draft rather than the saved row so it always agrees with the
 * boxes directly above it: an admin who has typed a new private rate and
 * collapsed the panel to check the next terminal should still see what they are
 * about to save. Unsaved values are already signalled by the lit Save button.
 *
 * The point is to make the fallbacks legible. A terminal that has set nothing
 * private looks identical to one that deliberately set private = share, and the
 * summary says which it is, so "why is the private price the same?" has an
 * answer on screen.
 */
function TerminalSummary({ draft }: { draft: Draft }) {
  const shareBase = draft.base_fare.trim();
  const sharePerKm = draft.per_km.trim();
  const privateBase = draft.private_ride_fee.trim();
  const privatePerKm = draft.private_ride_fee_per_km.trim();

  // Blank on both means the private ride inherits the share rate outright.
  const privateInherits = privateBase === "" && privatePerKm === "";

  const deliveryBase = draft.delivery_fee.trim();
  const deliveryPerKm = draft.delivery_fee_per_km.trim();

  const entry = (title: string, icon: ReactNode, detail: ReactNode, note?: string) => (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
        {icon}
        {title}
      </dt>
      <dd className="mt-0.5 font-semibold text-[var(--ink)]">{detail}</dd>
      {note && <p className="text-[11px] text-[var(--muted-foreground)]">{note}</p>}
    </div>
  );

  const icon = (I: ElementType) => <I className="size-3.5" aria-hidden="true" />;

  return (
    <dl className="grid gap-4 rounded-2xl border border-line bg-[var(--muted)]/40 p-4 @min-[28rem]:grid-cols-2 @min-[58rem]:grid-cols-4">
      {entry(
        "Share Ride",
        icon(Users),
        shareBase !== "" || sharePerKm !== ""
          ? `₱${shareBase || 0} base + ₱${sharePerKm || 0}/km`
          : "Platform rate",
      )}

      {entry(
        "Private Ride",
        icon(Car),
        privateInherits
          ? "Same as Share Ride"
          : `₱${privateBase || shareBase || 0} base + ₱${privatePerKm || sharePerKm || 0}/km`,
        privateInherits ? "Booked whole, charged the share rate" : undefined,
      )}

      {entry(
        "Delivery",
        icon(Truck),
        deliveryBase !== ""
          ? `₱${deliveryBase}${deliveryPerKm !== "" ? ` + ₱${deliveryPerKm}/km` : " flat"}`
          : deliveryPerKm !== ""
            ? `₱0 base + ₱${deliveryPerKm}/km`
            : "Platform default",
      )}

      {entry(
        "Seats",
        icon(Users),
        `${draft.max_passengers.trim() || DEFAULT_MAX_PASSENGERS}`,
        "On a shared ride",
      )}
    </dl>
  );
}

export default function AdminFaresDelivery() {
  const { user } = useAuth();
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  /**
   * Which terminals are folded down to their summary.
   *
   * Per terminal rather than one global toggle, because the reason to fold is
   * comparing: an admin checking three terminals against each other wants the
   * summaries side by side, and a single global switch would mean folding and
   * unfolding the same panels over and over.
   */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: prev[id] === false }));
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  /**
   * Which optional columns the database actually has.
   *
   * Two separate flags, because the columns arrived in two migrations and a
   * project is likely to be between them: someone who runs
   * ADD_TERMINAL_PRIVATE_RIDE_FEE.sql today on a database that never ran
   * ADD_TERMINAL_DELIVERY_AND_CAPACITY.sql should still get the private ride
   * field. One flag for the pair would have to disable both together, or claim
   * both exist and fail every save.
   */
  const extraColumnsExist = useRef(true);
  const privateFeeColumnExists = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      /*
       * Selecting a column that does not exist fails the *entire* query, not just
       * that field, so a terminal missing one optional column reads here as no
       * terminals at all -- on a system that plainly has three, reported as "No
       * terminals yet". Step down a query at a time until one is accepted, which
       * is the only way to tell "no terminals" from "these columns are missing",
       * and leaves every field that does exist editable either way.
       *
       * The extra round trips only happen on a database that has not been
       * migrated; a fully migrated one answers the first query and stops.
       */
      const attempts = [
        {
          columns:
            "id, name, base_fare, per_km, delivery_fee, delivery_fee_per_km, max_passengers, private_ride_fee, private_ride_fee_per_km, is_active",
          extra: true,
          privateFee: true,
        },
        {
          columns: "id, name, base_fare, per_km, delivery_fee, delivery_fee_per_km, max_passengers, is_active",
          extra: true,
          privateFee: false,
        },
        {
          columns: "id, name, base_fare, per_km, is_active",
          extra: false,
          privateFee: false,
        },
      ];

      let rows: Terminal[] | null = null;
      let lastError: unknown = null;

      for (const attempt of attempts) {
        const result = await supabase
          .from("terminals")
          .select(attempt.columns)
          .order("name", { ascending: true });

        if (!result.error) {
          rows = (result.data ?? []) as Terminal[];
          extraColumnsExist.current = attempt.extra;
          privateFeeColumnExists.current = attempt.privateFee;
          lastError = null;
          break;
        }
        lastError = result.error;
      }

      if (rows === null) throw lastError;

      setTerminals(rows);
      setDrafts(Object.fromEntries(rows.map((t) => [t.id, draftOf(t)])));
    } catch (err) {
      setLoadError(`Could not load terminals: ${(err as Error).message || 'Please try again.'}`);
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
    // A private ride is priced in its own right. Blank means "whatever this
    // terminal charges for a shared ride", which is what the resolver falls back
    // to -- writing 0 instead would make private rides free.
    const private_ride_fee = readOptionalMoney(draft.private_ride_fee);
    const private_ride_fee_per_km = readOptionalMoney(draft.private_ride_fee_per_km);

    // Only send the optional columns once they are known to exist, so this
    // screen keeps saving the rest on a database that has not run every
    // migration rather than failing every save with a PostgREST error.
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
    if (privateFeeColumnExists.current) {
      patch.private_ride_fee = private_ride_fee;
      patch.private_ride_fee_per_km = private_ride_fee_per_km;
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
          ...(privateFeeColumnExists.current
            ? { private_ride_fee, private_ride_fee_per_km }
            : {}),
        };
      }),
    );
    /*
     * Rebuild the draft from what was just written, not from the terminal object
     * this render closed over -- that one still holds the pre-save values, so
     * every box the save had just set emptied itself again on screen while the
     * row behind it read the new number. Left that way, the Save button also
     * stayed lit, because the cleared draft no longer matched the saved row.
     */
    setDrafts((prev) => ({
      ...prev,
      [terminal.id]: draftOf({
        ...terminal,
        base_fare,
        per_km,
        ...(extraColumnsExist.current
          ? { delivery_fee, delivery_fee_per_km, max_passengers }
          : {}),
        ...(privateFeeColumnExists.current
          ? { private_ride_fee, private_ride_fee_per_km }
          : {}),
      }),
    }));

    logAudit({
      action: "update_terminal_rates",
      actorRole: "admin",
      entityType: "terminal",
      entityId: terminal.id,
      summary: `Updated fares for ${terminal.name}`,
      details: {
        base_fare,
        per_km,
        delivery_fee,
        delivery_fee_per_km,
        max_passengers,
        private_ride_fee,
        private_ride_fee_per_km,
      },
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
      d.max_passengers !== current.max_passengers ||
      d.private_ride_fee !== current.private_ride_fee ||
      d.private_ride_fee_per_km !== current.private_ride_fee_per_km
    );
  };

  const field =
    "w-full min-h-11 rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-[var(--ink)] outline-none focus:border-[var(--primary)]";
  const label = "block text-xs font-bold text-[var(--ink)] mb-1";

  /*
   * The SQL files still to be run, built up as the screen finds out which
   * columns are missing.
   *
   * Naming the specific file rather than one blanket warning matters because the
   * two sets of columns came from separate migrations and a project is routinely
   * between them. "Run ADD_TERMINAL_PRIVATE_RIDE_FEE.sql" for a field that is
   * already working sends the admin off to re-apply something they already did.
   */
  const missingMigrations = [
    ...(extraColumnsExist.current ? [] : ["ADD_TERMINAL_DELIVERY_AND_CAPACITY.sql"]),
    ...(privateFeeColumnExists.current ? [] : ["ADD_TERMINAL_PRIVATE_RIDE_FEE.sql"]),
  ];
  const missingSummary =
    missingMigrations.length === 1
      ? missingMigrations[0]
      : `${missingMigrations[0]} and ${missingMigrations[1]}`;

  return (
    <AdminShell title="Fares & Delivery" subtitle="Share ride, private ride and delivery pricing per terminal">
      <div className="@container mx-auto w-full max-w-[100rem] space-y-6 sm:space-y-8">
      <AdminPageIntro eyebrow="Fares & delivery" title="Clear pricing. Every terminal." description="Compare terminal rates, set ride and delivery prices, and manage shared-ride capacity." />
      <AdminMetricCards loading={loading} items={[
        { label: 'Terminals', value: terminals.length, Icon: MapPin },
        { label: 'Active', value: terminals.filter(t => t.is_active).length, Icon: CheckCircle, tone: 'success' },
        { label: 'Unsaved drafts', value: terminals.filter(dirty).length, Icon: Pencil, tone: 'amber' },
      ]} />
      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-[var(--amber-soft)] p-4 text-sm text-[var(--amber-ink)]"><p className="min-w-0 flex-1 break-words">{loadError}</p><button type="button" disabled={terminals.some(dirty)} onClick={() => void load()} className="min-h-11 rounded-xl border border-current px-3 text-xs font-bold disabled:opacity-50">Retry loading</button></div>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4">
        <div className="relative min-w-0 w-full sm:max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true" /><label htmlFor="fare-search" className="sr-only">Search terminal pricing</label><input id="fare-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search terminal pricing…" className="min-h-11 w-full rounded-xl border border-line bg-soft pl-10 pr-3 text-sm" /></div>
        <p role="status" className="text-xs text-[var(--muted-foreground)]">{terminals.filter(t => t.name.toLowerCase().includes(query.trim().toLowerCase())).length} of {terminals.length} terminals</p>
      </div>
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}

      {missingMigrations.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[var(--amber)] bg-[var(--amber-soft)] p-4">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-[var(--amber)]" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-bold text-[var(--amber-ink)]">
              {missingMigrations.length === 1
                ? "One of these fields cannot be saved yet"
                : "Some of these fields cannot be saved yet"}
            </p>
            <p className="mt-1 text-sm text-[var(--amber-ink)]">
              Run <span className="font-bold">{missingSummary}</span> in Supabase.
              Every other field on this screen still saves.
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
          {!terminals.some(t => t.name.toLowerCase().includes(query.trim().toLowerCase())) && <EmptyState title="No matching terminals" description="Try another terminal name." action={<button type="button" onClick={() => setQuery('')} className="min-h-11 rounded-xl border border-line px-4 text-sm font-bold">Clear search</button>} />}
          {terminals.filter(t => t.name.toLowerCase().includes(query.trim().toLowerCase())).map((terminal) => {
            const draft = drafts[terminal.id] ?? draftOf(terminal);
            const saving = savingId === terminal.id;
            const changed = dirty(terminal);
            const isCollapsed = collapsed[terminal.id] !== false;
            return (
              <section
                key={terminal.id}
                className="@container relative min-w-0 rounded-3xl border border-line bg-card p-4 sm:p-5 transition-colors hover:border-[var(--teal)]/40"
              >
                {isCollapsed && user?.adminType === 'business_customer' && <button type="button" onClick={() => toggleCollapsed(terminal.id)} aria-label={`Edit pricing for ${terminal.name}`} aria-expanded={false} className="absolute inset-0 z-10 rounded-3xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--teal)]"><span className="sr-only">Open terminal pricing editor</span></button>}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="break-words text-lg font-bold text-[var(--ink)]">
                      {terminal.name}
                    </h2>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {terminal.is_active ? "Active" : "Inactive"}{changed ? ' · Unsaved changes' : ' · Saved rates'}
                    </p>
                  </div>
                  {/*
                    The two controls, grouped.

                    They were siblings of the terminal name under justify-between,
                    which spread all three across the row: the name pinned left,
                    Save pinned right, and the chevron stranded somewhere in the
                    middle, 300px from Save and reading as a stray icon rather than
                    the control next to it. One wrapper puts them in a single
                    cluster that shrink-wraps to the name.
                  */}
                  <div className="relative z-20 flex shrink-0 items-center gap-2">
                    {/*
                      The "v" that folds a terminal down to its summary.

                      The chevron points at what tapping it will *do*, not at the
                      current state: down collapses to the summary, up expands
                      back to the fields. aria-expanded still carries the state to
                      a screen reader, which the icon alone does not.
                    */}
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(terminal.id)}
                      aria-expanded={!isCollapsed}
                      className="inline-flex size-11 items-center justify-center rounded-xl border border-line bg-[var(--surface)] text-[var(--ink-soft)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] active:scale-95"
                    >
                      {isCollapsed ? (
                        <ChevronUp className="size-5" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="size-5" aria-hidden="true" />
                      )}
                      <span className="sr-only">
                        {isCollapsed
                          ? `Show pricing fields for ${terminal.name}`
                          : `Summarise pricing for ${terminal.name}`}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => saveTerminal(terminal)}
                      disabled={saving || !changed}
                      className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 font-bold transition-all active:scale-[0.97] ${
                        changed
                          ? "bg-[var(--success-ink)] text-[var(--background)] hover:opacity-90"
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
                </div>

                {isCollapsed ? (
                  <TerminalSummary draft={draft} />
                ) : (
                  <div className="grid items-start gap-3 @min-[58rem]:grid-cols-3">
                  <FareGroup
                    title="Share Ride"
                    blurb="One seat, split with whoever else is going your way."
                    icon={Users}
                  >
                    <div>
                      <label className={label} htmlFor={`base-${terminal.id}`}>
                        Price (₱)
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
                      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                        Flat part. Charged once per trip, then split between passengers.
                      </p>
                    </div>

                    <div>
                      <label className={label} htmlFor={`perkm-${terminal.id}`}>
                        Price per km (₱)
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
                      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                        Charged on the distance, before the split.
                      </p>
                    </div>

                    <div className="@min-[24rem]:col-span-2">
                      <label className={label} htmlFor={`pax-${terminal.id}`}>
                        <Users className="mr-1 inline size-3.5" aria-hidden="true" />
                        Seats on a shared ride
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
                        className={`${field} sm:max-w-[12rem]`}
                      />
                      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                        Shared rides only, so this does not apply to a private one.
                        Defaults to {DEFAULT_MAX_PASSENGERS}.
                      </p>
                    </div>
                  </FareGroup>

                  <FareGroup
                    title="Private Ride"
                    blurb="The whole vehicle, booked by one person."
                    icon={Car}
                  >
                    <div>
                      <label className={label} htmlFor={`private-${terminal.id}`}>
                        Price (₱)
                      </label>
                      <input
                        id={`private-${terminal.id}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={draft.private_ride_fee}
                        placeholder="Same as share"
                        disabled={!privateFeeColumnExists.current}
                        onChange={(e) => setDraft(terminal.id, { private_ride_fee: e.target.value })}
                        className={field}
                      />
                      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                        Blank uses the Share Ride price above.
                      </p>
                    </div>

                    <div>
                      <label className={label} htmlFor={`privatekm-${terminal.id}`}>
                        Price per km (₱)
                      </label>
                      <input
                        id={`privatekm-${terminal.id}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={draft.private_ride_fee_per_km}
                        placeholder="Same as share"
                        disabled={!privateFeeColumnExists.current}
                        onChange={(e) =>
                          setDraft(terminal.id, { private_ride_fee_per_km: e.target.value })
                        }
                        className={field}
                      />
                      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                        Blank uses the Share Ride per km. Nobody splits this one — it is
                        charged whole.
                      </p>
                    </div>
                  </FareGroup>

                  <FareGroup
                    title="Delivery"
                    blurb="Riding a rider to a shop's customer with their order."
                    icon={Truck}
                  >
                    <div>
                      <label className={label} htmlFor={`del-${terminal.id}`}>
                        Price (₱)
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
                        Price per km (₱)
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
                  </FareGroup>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      </div>
    </AdminShell>
  );
}
