import { useCallback, useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { ArrowLeft, Car, ChevronRight, Loader2, Save, Users, Truck, TriangleAlert, Search, MapPin, CheckCircle, Pencil } from "lucide-react";

import { supabase } from "../../../utils/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { Link, useBlocker, useNavigate, useParams } from "react-router";
import { DEFAULT_MAX_PASSENGERS, DEFAULT_RATES, formatPeso, normalizeRates, type RideRates } from "@/lib/pricing";
import { logAudit } from "../../../lib/supabase";
import AdminShell from "./AdminShell";
import AdminPageIntro, { AdminMetricCards } from "./AdminPageIntro";
import Toast from "../ui/Toast";
import EmptyState from "../ui/EmptyState";
import { TerminalIconGlyph } from "../ui/TerminalIcon";

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
  base_fare_included_km?: number | null;
  per_km: number | null;
  delivery_fee: number | null;
  delivery_fee_included_km?: number | null;
  delivery_fee_per_km: number | null;
  max_passengers: number | null;
  private_ride_fee: number | null;
  private_ride_fee_included_km?: number | null;
  private_ride_fee_per_km: number | null;
  is_active: boolean;
};

/** What is being edited for one terminal. */
type Draft = {
  base_fare: string;
  base_fare_included_km: string;
  per_km: string;
  /** Blank means "use the platform default", not zero. */
  delivery_fee: string;
  delivery_fee_included_km: string;
  /** Blank or 0 means no additional delivery charge after the included distance. */
  delivery_fee_per_km: string;
  /** Blank means the platform default of 4. */
  max_passengers: string;
  /** Blank means "same as the share ride price", not zero. */
  private_ride_fee: string;
  /** Blank means "same as the share ride included distance". */
  private_ride_fee_included_km: string;
  /** Blank means "same as the share ride per-km rate". */
  private_ride_fee_per_km: string;
};

const draftOf = (t: Terminal): Draft => ({
  base_fare: t.base_fare != null ? String(t.base_fare) : "",
  base_fare_included_km: t.base_fare_included_km != null ? String(t.base_fare_included_km) : "1",
  per_km: t.per_km != null ? String(t.per_km) : "",
  delivery_fee: t.delivery_fee != null ? String(t.delivery_fee) : "",
  delivery_fee_included_km: t.delivery_fee_included_km != null ? String(t.delivery_fee_included_km) : "1",
  delivery_fee_per_km: t.delivery_fee_per_km != null ? String(t.delivery_fee_per_km) : "",
  max_passengers: t.max_passengers != null ? String(t.max_passengers) : String(DEFAULT_MAX_PASSENGERS),
  private_ride_fee: t.private_ride_fee != null ? String(t.private_ride_fee) : "",
  private_ride_fee_included_km: t.private_ride_fee_included_km != null ? String(t.private_ride_fee_included_km) : "",
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

const formatFareCardRate = (baseFare: number, includedKm: number, perKm: number): string =>
  perKm > 0
    ? `${formatPeso(baseFare)} base · ${includedKm} km included · ${formatPeso(perKm)}/km after`
    : `${formatPeso(baseFare)} flat`;

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

export default function AdminFaresDelivery() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { terminalId } = useParams<{ terminalId?: string }>();
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [platformRates, setPlatformRates] = useState<RideRates>(DEFAULT_RATES);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
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
  const distanceColumnsExist = useRef(true);
  const [distanceColumnsReady, setDistanceColumnsReady] = useState(true);

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

      // Keep the new included-distance settings in their own migration so an
      // older database can still load and save the fare columns it already has.
      const { data: distanceRows, error: distanceError } = await supabase
        .from("terminals")
        .select("id, base_fare_included_km, private_ride_fee_included_km, delivery_fee_included_km");
      distanceColumnsExist.current = !distanceError;
      setDistanceColumnsReady(!distanceError);
      if (!distanceError && distanceRows) {
        const distances = new Map(distanceRows.map((row: any) => [row.id, row]));
        rows = rows.map((terminal) => ({ ...terminal, ...distances.get(terminal.id) }));
      }

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

  useEffect(() => {
    let active = true;
    const loadPlatformRates = async () => {
      let loaded: RideRates | null = null;
      try {
        const { data, error } = await supabase
          .from('admin_settings')
          .select('setting_value')
          .eq('setting_key', 'rates')
          .maybeSingle();
        if (!error && data?.setting_value != null) {
          const raw = typeof data.setting_value === 'string'
            ? JSON.parse(data.setting_value)
            : data.setting_value;
          loaded = normalizeRates(raw);
        }
      } catch {
        // A missing/unavailable platform setting falls back to the local copy,
        // then to DEFAULT_RATES (whose delivery default is zero).
      }

      if (!loaded) {
        try {
          const saved = localStorage.getItem('trikeserve_rates');
          if (saved) loaded = normalizeRates(JSON.parse(saved));
        } catch {
          // Leave the platform defaults in place if the local backup is invalid.
        }
      }

      const rates = loaded ?? DEFAULT_RATES;
      if (active) {
        setPlatformRates(rates);
      }
    };

    void loadPlatformRates();
    return () => { active = false; };
  }, []);

  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const saveTerminal = async (terminal: Terminal, suppressToast = false): Promise<boolean> => {
    const draft = drafts[terminal.id];
    if (!draft) return true;

    // A shop cannot set a fare below zero, and an empty box means "leave it as
    // the platform default" rather than "charge nothing".
    const base_fare = readMoney(draft.base_fare, 20);
    const base_fare_included_km = readMoney(draft.base_fare_included_km, 1);
    const per_km = readMoney(draft.per_km, 10);
    const delivery_fee = readOptionalMoney(draft.delivery_fee);
    const delivery_fee_included_km = readMoney(draft.delivery_fee_included_km, 1);
    const delivery_fee_per_km = readOptionalMoney(draft.delivery_fee_per_km);
    const max_passengers = readPassengers(draft.max_passengers);
    // A private ride is priced in its own right. Blank means "whatever this
    // terminal charges for a shared ride", which is what the resolver falls back
    // to -- writing 0 instead would make private rides free.
    const private_ride_fee = readOptionalMoney(draft.private_ride_fee);
    const private_ride_fee_included_km = readOptionalMoney(draft.private_ride_fee_included_km);
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
    if (distanceColumnsExist.current) {
      patch.base_fare_included_km = base_fare_included_km;
      patch.private_ride_fee_included_km = private_ride_fee_included_km;
      patch.delivery_fee_included_km = delivery_fee_included_km;
    }

    let saveError: string | null = null;
    try {
      const { error } = await supabase.from("terminals").update(patch).eq("id", terminal.id);
      saveError = error?.message ?? null;
    } catch (error) {
      saveError = error instanceof Error ? error.message : "Please try again.";
    }

    if (saveError) {
      if (!suppressToast) setToast({ message: `Save failed: ${saveError}`, variant: "error" });
      return false;
    }

    setTerminals((prev) =>
      prev.map((t) => {
        if (t.id !== terminal.id) return t;
        return {
          ...t,
          base_fare,
          ...(distanceColumnsExist.current ? {
            base_fare_included_km,
            private_ride_fee_included_km,
            delivery_fee_included_km,
          } : {}),
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
        ...(distanceColumnsExist.current ? {
          base_fare_included_km,
          private_ride_fee_included_km,
          delivery_fee_included_km,
        } : {}),
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
        base_fare_included_km,
        per_km,
        delivery_fee,
        delivery_fee_included_km,
        delivery_fee_per_km,
        max_passengers,
        private_ride_fee,
        private_ride_fee_per_km,
      },
      actorEmail: user?.email,
      actorName: user?.name,
    });

    if (!suppressToast) setToast({ message: `${terminal.name} saved`, variant: "success" });
    return true;
  };

  const dirty = (t: Terminal) => {
    const d = drafts[t.id];
    if (!d) return false;
    const current = draftOf(t);
    return (
      d.base_fare !== current.base_fare ||
      d.base_fare_included_km !== current.base_fare_included_km ||
      d.per_km !== current.per_km ||
      d.delivery_fee !== current.delivery_fee ||
      d.delivery_fee_included_km !== current.delivery_fee_included_km ||
      d.delivery_fee_per_km !== current.delivery_fee_per_km ||
      d.max_passengers !== current.max_passengers ||
      d.private_ride_fee !== current.private_ride_fee ||
      d.private_ride_fee_included_km !== current.private_ride_fee_included_km ||
      d.private_ride_fee_per_km !== current.private_ride_fee_per_km
    );
  };

  const dirtyTerminals = terminals.filter(dirty);
  const hasUnsavedChanges = dirtyTerminals.length > 0;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const saveAllTerminals = async () => {
    if (isSavingAll || dirtyTerminals.length === 0) return;
    const pending = [...dirtyTerminals];
    setIsSavingAll(true);
    let savedCount = 0;
    let failedCount = 0;
    try {
      for (const terminal of pending) {
        if (await saveTerminal(terminal, true)) savedCount++;
        else failedCount++;
      }
      setToast(failedCount > 0
        ? { message: `${savedCount} terminal${savedCount === 1 ? '' : 's'} saved; ${failedCount} failed. Review and try again.`, variant: 'error' }
        : { message: `Saved fares for ${savedCount} terminal${savedCount === 1 ? '' : 's'}.`, variant: 'success' });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : 'Some fares could not be saved. Try again.', variant: 'error' });
    } finally {
      setIsSavingAll(false);
    }
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
    ...(distanceColumnsReady ? [] : ["ADD_TERMINAL_BASE_DISTANCE.sql"]),
  ];
  const missingSummary =
    missingMigrations.length === 1
      ? missingMigrations[0]
      : `${missingMigrations.slice(0, -1).join(", ")} and ${missingMigrations[missingMigrations.length - 1]}`;
  const rateKeys: (keyof Pick<Draft, "base_fare" | "base_fare_included_km" | "per_km" | "private_ride_fee" | "private_ride_fee_included_km" | "private_ride_fee_per_km" | "delivery_fee" | "delivery_fee_included_km" | "delivery_fee_per_km">)[] = [
    "base_fare",
    "base_fare_included_km",
    "per_km",
    "private_ride_fee",
    "private_ride_fee_included_km",
    "private_ride_fee_per_km",
    "delivery_fee",
    "delivery_fee_included_km",
    "delivery_fee_per_km",
  ];
  const configuredRateCount = terminals.reduce((count, terminal) => {
    const draft = drafts[terminal.id] ?? draftOf(terminal);
    return count + rateKeys.filter(key => draft[key].trim() !== "").length;
  }, 0);
  const totalRateCount = terminals.length * rateKeys.length;
  const rateCompleteness = totalRateCount > 0
    ? Math.round((configuredRateCount / totalRateCount) * 100)
    : 0;
  const isTerminalDetail = Boolean(terminalId);
  const selectedTerminal = terminals.find((terminal) => terminal.id === terminalId) || null;
  const visibleTerminals = isTerminalDetail
    ? terminals.filter((terminal) => terminal.id === terminalId)
    : terminals.filter((terminal) => terminal.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <AdminShell
      title="Fares & Delivery"
      subtitle={selectedTerminal ? `Pricing for ${selectedTerminal.name}` : "Share ride, private ride and delivery pricing per terminal"}
      actions={hasUnsavedChanges ? (
        <button
          type="button"
          onClick={() => void saveAllTerminals()}
          disabled={isSavingAll}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--success-ink)] px-4 py-2 font-bold text-[var(--background)] transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {isSavingAll ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
          {isSavingAll ? 'Saving...' : 'Save changes'}
        </button>
      ) : undefined}
    >
      <div className="@container mx-auto w-full max-w-[100rem] space-y-6 sm:space-y-8">
      {isTerminalDetail && (
        <button
          type="button"
          onClick={() => navigate('/admin/delivery')}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-[var(--ink)] transition-colors hover:bg-soft"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All terminals
        </button>
      )}
      <AdminPageIntro
        eyebrow={isTerminalDetail ? "Terminal rates" : "Fares & delivery"}
        title={isTerminalDetail ? "Edit terminal pricing" : "Clear pricing. Every terminal."}
        description={isTerminalDetail
          ? selectedTerminal ? `Set share ride, private ride and delivery fares for ${selectedTerminal.name}.` : "Loading this terminal's rates."
          : "Compare terminal rates, set ride and delivery prices, and manage shared-ride capacity."}
      />
      {!isTerminalDetail && <>
      <AdminMetricCards loading={loading} items={[
        { label: 'Terminals', value: terminals.length, Icon: MapPin },
        { label: 'Active', value: terminals.filter(t => t.is_active).length, Icon: CheckCircle, tone: 'success' },
        { label: 'Unsaved drafts', value: terminals.filter(dirty).length, Icon: Pencil, tone: 'amber' },
      ]} />
      <section aria-labelledby="fare-completeness-title" aria-busy={loading} className="flex flex-col items-center gap-5 rounded-3xl border border-line bg-card p-5 sm:flex-row sm:p-6">
        <div className="relative size-[132px] shrink-0" role="img" aria-label={`Fare completeness: ${rateCompleteness}%`}>
          <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--muted)" strokeWidth="10" />
            {rateCompleteness > 0 && (
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="var(--teal)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${(rateCompleteness / 100) * 326.7} 326.7`}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-extrabold text-[var(--ink)] tabular-nums">{loading ? '—' : `${rateCompleteness}%`}</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Complete</span>
          </div>
        </div>
        <div className="min-w-0 text-center sm:text-left">
          <h2 id="fare-completeness-title" className="text-base font-bold text-[var(--ink)]">Fare completeness</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {loading
              ? 'Loading terminal rates…'
              : `${configuredRateCount} of ${totalRateCount} terminal rate fields filled`}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
            {loading
              ? 'Checking share ride, private ride and delivery prices.'
              : terminals.length === 0
                ? 'Add a terminal to start setting fares and delivery prices.'
                : rateCompleteness === 100
                  ? 'Every terminal has explicit share ride, private ride and delivery rates.'
                  : `${totalRateCount - configuredRateCount} rate fields still use their fallback prices.`}
          </p>
        </div>
      </section>
      </>}
      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-[var(--amber-soft)] p-4 text-sm text-[var(--amber-ink)]"><p className="min-w-0 flex-1 break-words">{loadError}</p><button type="button" disabled={terminals.some(dirty)} onClick={() => void load()} className="min-h-11 rounded-xl border border-current px-3 text-xs font-bold disabled:opacity-50">Retry loading</button></div>}
      {!isTerminalDetail && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4">
        <div className="relative min-w-0 w-full sm:max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true" /><label htmlFor="fare-search" className="sr-only">Search terminal pricing</label><input id="fare-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search terminal pricing…" className="min-h-11 w-full rounded-xl border border-line bg-soft pl-10 pr-3 text-sm" /></div>
        <p role="status" className="text-xs text-[var(--muted-foreground)]">{terminals.filter(t => t.name.toLowerCase().includes(query.trim().toLowerCase())).length} of {terminals.length} terminals</p>
      </div>}
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}

      {blocker.state === 'blocked' && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/50 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="unsaved-fares-title" className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <h2 id="unsaved-fares-title" className="text-lg font-bold text-[var(--ink)]">Unsaved fare changes</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
              {isSavingAll
                ? 'Fares are still saving. Stay on this page until the save finishes.'
                : 'Your fare changes have not been saved. Leave this page and discard them?'}
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                disabled={isSavingAll}
                onClick={() => blocker.proceed?.()}
                className="min-h-11 rounded-xl bg-[var(--error)] px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Leave without saving
              </button>
              <button
                type="button"
                onClick={() => blocker.reset?.()}
                className="min-h-11 rounded-xl border border-line px-4 py-3 text-sm font-bold text-[var(--ink)] transition-colors hover:bg-soft"
              >
                Stay on page
              </button>
            </div>
          </div>
        </div>
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
          title={isTerminalDetail ? "Terminal not found" : "No terminals yet"}
          description={isTerminalDetail ? "This terminal may have been removed." : "Add a terminal first, then set its fares here."}
          action={isTerminalDetail ? (
            <button type="button" onClick={() => navigate('/admin/delivery')} className="min-h-11 rounded-xl border border-line px-4 text-sm font-bold">Back to terminals</button>
          ) : undefined}
        />
      ) : visibleTerminals.length === 0 ? (
        <EmptyState
          title={isTerminalDetail ? "Terminal not found" : "No matching terminals"}
          description={isTerminalDetail ? "This terminal may have been removed." : "Try another terminal name."}
          action={isTerminalDetail ? (
            <button type="button" onClick={() => navigate('/admin/delivery')} className="min-h-11 rounded-xl border border-line px-4 text-sm font-bold">Back to terminals</button>
          ) : (
            <button type="button" onClick={() => setQuery('')} className="min-h-11 rounded-xl border border-line px-4 text-sm font-bold">Clear search</button>
          )}
        />
      ) : (
        <div className="space-y-4">
          {visibleTerminals.map((terminal) => {
            const draft = drafts[terminal.id] ?? draftOf(terminal);
            const changed = dirty(terminal);
            const isCollapsed = !isTerminalDetail;
            const shareBase = readMoney(draft.base_fare, DEFAULT_RATES.baseFare);
            const shareIncludedKm = readMoney(draft.base_fare_included_km, DEFAULT_RATES.baseFareIncludedKm);
            const sharePerKm = readMoney(draft.per_km, DEFAULT_RATES.perKm);
            const privateBase = readOptionalMoney(draft.private_ride_fee) ?? shareBase;
            const privateIncludedKm = readOptionalMoney(draft.private_ride_fee_included_km) ?? shareIncludedKm;
            const privatePerKm = readOptionalMoney(draft.private_ride_fee_per_km) ?? sharePerKm;
            const deliveryBase = readOptionalMoney(draft.delivery_fee) ?? platformRates.deliveryBaseFee;
            const deliveryIncludedKm = readMoney(draft.delivery_fee_included_km, DEFAULT_RATES.baseFareIncludedKm);
            const deliveryPerKm = readOptionalMoney(draft.delivery_fee_per_km) ?? 0;
            const fareSummaries = [
              { label: "Share Ride", fare: formatFareCardRate(shareBase, shareIncludedKm, sharePerKm) },
              { label: "Private Ride", fare: formatFareCardRate(privateBase, privateIncludedKm, privatePerKm) },
              { label: "Delivery", fare: formatFareCardRate(deliveryBase, deliveryIncludedKm, deliveryPerKm) },
            ];
            return (
              <section
                key={terminal.id}
                className={`@container relative min-w-0 rounded-3xl border border-line bg-card p-4 sm:p-5 ${isCollapsed ? "min-h-20 cursor-pointer transition-colors hover:border-[var(--teal)]/40" : ""}`}
              >
                {isCollapsed ? (
                  <Link
                    to={`/admin/delivery/${terminal.id}`}
                    aria-label={`Open pricing for ${terminal.name}`}
                    className="block rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--teal)]"
                  >
                      <h2 className="flex min-w-0 items-center gap-2 text-lg font-bold text-[var(--ink)]">
                        <TerminalIconGlyph className="size-5 shrink-0 text-[var(--primary)]" aria-hidden="true" />
                        <span className="break-words">{terminal.name}</span>
                      </h2>
                    </button>
                    <div className="mt-3 grid gap-2 border-t border-line pt-3 @min-[32rem]:grid-cols-3">
                      {fareSummaries.map(({ label: fareLabel, fare }) => (
                        <div key={fareLabel} className="min-w-0 rounded-xl bg-soft/60 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted-foreground)]">{fareLabel}</p>
                          <p className="mt-1 break-words text-xs font-semibold text-[var(--ink)]">{fare}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-1 text-sm font-bold text-[var(--primary)]">
                      Manage rates
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </div>
                  </Link>
                ) : (
                  <>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="flex min-w-0 items-center gap-2 text-lg font-bold text-[var(--ink)]">
                          <TerminalIconGlyph className="size-5 shrink-0 text-[var(--primary)]" aria-hidden="true" />
                          <span className="break-words">{terminal.name}</span>
                        </h2>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {terminal.is_active ? "Active" : "Inactive"}{changed ? ' · Unsaved changes' : ' · Saved rates'}
                        </p>
                      </div>
                    </div>
                  <div className="grid items-start gap-3 @min-[58rem]:grid-cols-3">
                  <FareGroup
                    title="Share Ride"
                    blurb="One seat, split with whoever else is going your way."
                    icon={Users}
                  >
                    <div>
                      <label className={label} htmlFor={`base-${terminal.id}`}>
                        Base fare (₱)
                      </label>
                      <input
                        id={`base-${terminal.id}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={draft.base_fare}
                        disabled={isSavingAll}
                        onChange={(e) => setDraft(terminal.id, { base_fare: e.target.value })}
                        className={field}
                      />
                      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                        Amount charged once for the included distance, then split between passengers.
                      </p>
                    </div>

                    <div>
                      <label className={label} htmlFor={`basekm-${terminal.id}`}>
                        Base fare includes (km)
                      </label>
                      <input
                        id={`basekm-${terminal.id}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.1"
                        value={draft.base_fare_included_km}
                        disabled={!distanceColumnsReady || isSavingAll}
                        onChange={(e) => setDraft(terminal.id, { base_fare_included_km: e.target.value })}
                        className={field}
                      />
                      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                        Per-km pricing starts after this distance. Defaults to 1 km.
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
                        disabled={isSavingAll}
                        onChange={(e) => setDraft(terminal.id, { per_km: e.target.value })}
                        className={field}
                      />
                      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                        Charged only for distance beyond the base fare, before the split.
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
                        disabled={!extraColumnsExist.current || isSavingAll}
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
                        Base fare (₱)
                      </label>
                      <input
                        id={`private-${terminal.id}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={draft.private_ride_fee}
                        placeholder="Same as share"
                        disabled={!privateFeeColumnExists.current || isSavingAll}
                        onChange={(e) => setDraft(terminal.id, { private_ride_fee: e.target.value })}
                        className={field}
                      />
                      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                        Blank uses the Share Ride price above.
                      </p>
                    </div>

                    <div>
                      <label className={label} htmlFor={`privatebasekm-${terminal.id}`}>
                        Base fare includes (km)
                      </label>
                      <input
                        id={`privatebasekm-${terminal.id}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.1"
                        value={draft.private_ride_fee_included_km}
                        placeholder="Same as share"
                        disabled={!distanceColumnsReady || !privateFeeColumnExists.current || isSavingAll}
                        onChange={(e) => setDraft(terminal.id, { private_ride_fee_included_km: e.target.value })}
                        className={field}
                      />
                      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                        Blank uses the Share Ride distance.
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
                        disabled={!privateFeeColumnExists.current || isSavingAll}
                        onChange={(e) =>
                          setDraft(terminal.id, { private_ride_fee_per_km: e.target.value })
                        }
                        className={field}
                      />
                      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                        Blank uses the Share Ride per-km price. Charged for distance beyond the base.
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
                        Base fee (₱)
                      </label>
                      <input
                        id={`del-${terminal.id}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={draft.delivery_fee}
                        placeholder={`₱${platformRates.deliveryBaseFee} default`}
                        disabled={!extraColumnsExist.current || isSavingAll}
                        onChange={(e) => setDraft(terminal.id, { delivery_fee: e.target.value })}
                        className={field}
                      />
                      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                        Blank uses the platform default (₱{platformRates.deliveryBaseFee}).
                      </p>
                    </div>

                    <div>
                      <label className={label} htmlFor={`delbasekm-${terminal.id}`}>
                        Base fee includes (km)
                      </label>
                      <input
                        id={`delbasekm-${terminal.id}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.1"
                        value={draft.delivery_fee_included_km}
                        disabled={!distanceColumnsReady || !extraColumnsExist.current || isSavingAll}
                        onChange={(e) => setDraft(terminal.id, { delivery_fee_included_km: e.target.value })}
                        className={field}
                      />
                      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                        Per-km pricing starts after this distance. Defaults to 1 km.
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
                        disabled={!extraColumnsExist.current || isSavingAll}
                        onChange={(e) =>
                          setDraft(terminal.id, { delivery_fee_per_km: e.target.value })
                        }
                        className={field}
                      />
                      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                        Charged only for distance beyond the included kilometres.
                      </p>
                    </div>
                  </FareGroup>
                  </div>
                  </>
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
