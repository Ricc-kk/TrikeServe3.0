import { useEffect, useState } from "react";
import { Flame, MapPin, Search, UtensilsCrossed } from "lucide-react";

import { Tricycle } from "../ui/Tricycle";
import { supabase } from "../../../utils/supabase";

export type HubFilter = "all" | "tricycle" | "food";

type HubFiltersProps = {
  value: HubFilter;
  onChange: (next: HubFilter) => void;
};

/** Same key the food search overlay writes, so both screens agree on recents. */
const RECENT_KEY = "trikeserve_recent_food_searches";

const FILTERS: { id: HubFilter; label: string; Icon: typeof Search }[] = [
  { id: "all", label: "All", Icon: Search },
  { id: "tricycle", label: "Tricycle", Icon: Tricycle },
  { id: "food", label: "Food", Icon: UtensilsCrossed },
];

/**
 * What the customer wants: everything, a ride, or a meal.
 *
 * Three chips rather than the two big service cards this replaced. The cards
 * duplicated the bottom nav and each other; a filter states the intent and lets
 * the feed below narrow, which is one tap instead of two.
 */
export function HubFilters({ value, onChange }: HubFiltersProps) {
  return (
    <div
      role="tablist"
      aria-label="What to show"
      className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {FILTERS.map(({ id, label, Icon }) => {
        const selected = value === id;

        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(id)}
            className={`flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-full border-2 px-4 text-sm font-bold transition-colors ${
              selected
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--ink)]"
                : "border-line bg-[var(--surface)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            }`}
          >
            <Icon
              className="size-4 flex-shrink-0"
              color={selected ? "var(--primary)" : "currentColor"}
              aria-hidden="true"
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}

type SearchesProps = {
  /** Navigate to the food screen with this term pre-loaded. */
  onPick: (term: string) => void;
};

/**
 * What the customer has looked for, and what everyone else is looking for.
 *
 * Recents are per-device; popular comes from the best rated shops in the
 * database. Empty state matters here: a brand new account has no recents, so
 * the section leads with popular rather than showing an empty shell.
 */
export function HubSearches({ onPick }: SearchesProps) {
  const [recent, setRecent] = useState<string[]>([]);
  const [popular, setPopular] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setRecent(
            parsed
              .map((entry) => (typeof entry === "string" ? entry : entry?.query))
              .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
              .slice(0, 5),
          );
        }
      }
    } catch {
      // A corrupt local entry must not break the home screen.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("restaurants")
      .select("name, rating")
      .order("rating", { ascending: false })
      .limit(6)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const names = data
          .map((row) => (row as { name?: string }).name)
          .filter((name): name is string => Boolean(name && name.trim()));
        setPopular(Array.from(new Set(names)).slice(0, 6));
      })
      .catch(() => {
        // Popular is a convenience; an offline customer simply does not see it.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (recent.length === 0 && popular.length === 0) return null;

  return (
    <section aria-label="Recent and popular searches" className="space-y-3">
      {recent.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--ink)]">
            <Search className="size-4 text-[var(--muted-foreground)]" aria-hidden="true" />
            Recent searches
          </h2>
          <div className="flex flex-wrap gap-2">
            {recent.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => onPick(term)}
                className="min-h-10 rounded-full bg-[var(--muted)] px-3.5 text-sm font-medium text-[var(--ink)]"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}

      {popular.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--ink)]">
            <Flame className="size-4 text-[var(--primary)]" aria-hidden="true" />
            Popular right now
          </h2>
          <div className="flex flex-wrap gap-2">
            {popular.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onPick(name)}
                className="min-h-10 rounded-full border border-line bg-[var(--surface)] px-3.5 text-sm font-medium text-[var(--ink)]"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

type TerminalsProps = {
  terminals: {
    id: string;
    name: string;
    boundary: string;
    center_lat: number;
    center_lng: number;
    base_fare?: number | null;
  }[];
  /** Called when a terminal is chosen; the ride booking picks this up. */
  onSelect: (terminalId: string) => void;
};

/** Every terminal the customer can board from, with its base fare. */
export function HubTerminals({ terminals, onSelect }: TerminalsProps) {
  return (
    <section aria-label="Book a tricycle">
      <h2 className="mb-2 flex items-center gap-1.5 text-lg font-bold text-[var(--ink)]">
        <Tricycle className="size-5" aria-hidden="true" />
        Book a Tricycle
        <span className="ml-1 text-sm font-normal text-[var(--muted-foreground)]">
          terminals
        </span>
      </h2>

      {terminals.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No terminals are loading right now.
        </p>
      ) : (
        <ul className="space-y-2">
          {terminals.map((terminal) => (
            <li key={terminal.id}>
              <button
                type="button"
                onClick={() => onSelect(terminal.id)}
                className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-[var(--surface)] p-3 text-left transition-colors hover:bg-[var(--muted)]"
              >
                <span className="grid size-10 flex-shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)]">
                  <MapPin className="size-5 text-[var(--primary)]" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-[var(--ink)]">
                    {terminal.name}
                  </span>
                  <span className="block truncate text-xs text-[var(--muted-foreground)]">
                    {terminal.boundary || "Valenzuela City"}
                  </span>
                </span>
                {typeof terminal.base_fare === "number" && (
                  <span className="flex-shrink-0 text-sm font-bold text-[var(--primary)]">
                    ₱{terminal.base_fare}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}