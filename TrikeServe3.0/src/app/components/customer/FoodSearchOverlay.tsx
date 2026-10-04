import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Clock, Flame, Search, Star, Store, X } from "lucide-react";
import { Link } from "react-router";

import { CUISINES, type CuisineId } from "@/lib/foodTaxonomy";
import { supabaseHelpers } from "@/lib/supabase";
import StoreLogo from "../figma/StoreLogo";
import type { RestaurantView } from "./RestaurantCard";

const RECENT_KEY = "trikeserve_recent_food_searches";
const RECENT_LIMIT = 6;

type FoodSearchOverlayProps = {
  onClose: () => void;
  restaurants: RestaurantView[];
  /** Query to prefill when reopening the overlay. */
  initialQuery?: string;
  onSearchCommitted?: (term: string) => void;
};

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pushRecent(term: string) {
  const cleaned = term.trim();
  if (cleaned.length < 2) return;
  const next = [cleaned, ...readRecent().filter((t) => t !== cleaned)].slice(
    0,
    RECENT_LIMIT,
  );
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Recents are a convenience; losing them is not worth an error.
  }
}

/**
 * Search, covering the whole page.
 *
 * The inline search this replaces filtered a list that was already on screen, so
 * results appeared above the fold with no indication that a search was running.
 * A full overlay can hold popular terms, recent terms, cuisine filters and the
 * result list at once, which is the pattern every delivery app uses.
 */
export default function FoodSearchOverlay({
  onClose,
  restaurants,
  initialQuery = "",
  onSearchCommitted,
}: FoodSearchOverlayProps) {
  const [query, setQuery] = useState(initialQuery);
  const [popular, setPopular] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>(() => readRecent());
  const [activeCuisine, setActiveCuisine] = useState<CuisineId | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const loggedRef = useRef<string>('');

  // Escape closes, and focus comes back to whatever opened the overlay.
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreFocusRef.current?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    supabaseHelpers
      .getPopularSearchTerms(8)
      .then(({ data }) => {
        if (!cancelled) setPopular(data || []);
      })
      .catch(() => {
        if (!cancelled) setPopular([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Log a term once it stops changing, so typing "ado" then "adobo" records
  // only the finished word rather than every prefix.
  useEffect(() => {
    const term = query.trim().toLowerCase();
    if (term.length < 2 || term === loggedRef.current) return;
    const timer = setTimeout(() => {
      loggedRef.current = term;
      pushRecent(query);
      setRecent(readRecent());
      supabaseHelpers.logRestaurantSearch(term).catch(() => {});
      onSearchCommitted?.(term);
    }, 700);
    return () => clearTimeout(timer);
  }, [query, onSearchCommitted]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();

    return restaurants.filter((r) => {
      if (activeCuisine && !r.cuisineLabels.length) return false;
      if (activeCuisine) {
        const meta = CUISINES.find((c) => c.id === activeCuisine);
        if (!meta || !r.cuisineLabels.includes(meta.label)) return false;
      }
      if (!term) return true;
      return (
        r.name.toLowerCase().includes(term) ||
        r.address.toLowerCase().includes(term) ||
        r.cuisineLabels.some((l) => l.toLowerCase().includes(term))
      );
    });
  }, [restaurants, query, activeCuisine]);

  const suggestions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of [...recent, ...popular]) {
      const key = item.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }, [query, recent, popular]);

  const clearRecent = () => {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // Nothing to do.
    }
    setRecent([]);
  };

  return (
    <div
      className="fixed inset-0 z-[2200] flex flex-col bg-[var(--background)]"
      role="dialog"
      aria-modal="true"
      aria-label="Search food"
    >
      <div className="border-b border-line bg-[var(--surface)] px-3 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Go back"
            className="grid size-12 flex-shrink-0 place-items-center rounded-2xl border border-line hover:bg-[var(--muted)]"
          >
            <ArrowLeft className="size-5 text-[var(--ink)]" aria-hidden="true" />
          </button>

          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-[var(--muted-foreground)]"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search food or restaurant"
              aria-label="Search food or restaurant"
              className="min-h-12 w-full rounded-2xl border border-line bg-[var(--background)] pl-11 pr-10 text-base text-[var(--ink)] outline-none focus:border-[var(--primary)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full hover:bg-[var(--muted)]"
              >
                <X className="size-4 text-[var(--muted-foreground)]" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-4">
        {/* Cuisine quick filters, so "show me an ihawan" is one tap, not a
            typed word. */}
        <div
          role="group"
          aria-label="Filter by cuisine"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5"
          tabIndex={0}
        >
          {CUISINES.map(({ id, label, Icon }) => {
            const selected = activeCuisine === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => setActiveCuisine(selected ? null : id)}
                className={`flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
                  selected
                    ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--coral-dark)]"
                    : "border-line bg-[var(--surface)] text-[var(--muted-foreground)]"
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>

        {suggestions.length > 0 && (
          <section className="mt-5" aria-label="Suggested searches">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                <Flame className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
                Popular searches
              </h2>
              {recent.length > 0 && (
                <button
                  type="button"
                  onClick={clearRecent}
                  className="min-h-11 text-xs font-semibold text-[var(--muted-foreground)]"
                >
                  Clear recent
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setQuery(term)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--muted)] px-3.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--border)]"
                >
                  <Clock className="size-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
                  {term}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="mt-6" aria-label="Search results">
          <h2 className="mb-3 text-lg font-bold text-[var(--ink)]">
            {query.trim() || activeCuisine ? 'Matches' : 'All restaurants'}
            <span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">
              {results.length}
            </span>
          </h2>

          {results.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line px-6 py-10 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--muted)]">
                <Store className="size-6 text-[var(--muted-foreground)]" aria-hidden="true" />
              </div>
              <p className="mt-4 text-lg font-bold text-[var(--ink)]">No matches</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Try a different search or cuisine.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {results.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/customer/restaurant-detail?id=${encodeURIComponent(r.id)}&name=${encodeURIComponent(r.name)}`}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-2xl border border-line bg-[var(--surface)] p-3 transition-colors hover:bg-[var(--muted)]"
                  >
                    {/* The restaurant profile: its logo as an avatar, the way a
                        store is recognised rather than its banner photo. */}
                    <span className="grid size-14 flex-shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-[var(--muted)]">
                      <StoreLogo logo={r.logo} emojiClass="text-2xl" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-base font-bold text-[var(--ink)]">
                          {r.name}
                        </span>
                        <span className="flex flex-shrink-0 items-center gap-1 text-xs font-bold text-[var(--ink)]">
                          <Star
                            className="size-3 fill-[var(--amber)] text-[var(--amber)]"
                            aria-hidden="true"
                          />
                          {r.rating ? Number(r.rating).toFixed(1) : 'New'}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">
                        {r.cuisineLabels.join(" · ") || r.address}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                        <span>{r.time}</span>
                        <span aria-hidden="true">·</span>
                        <span>{r.distanceLabel ?? "Distance unavailable"}</span>
                        {!r.isOpen && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-[var(--error)]">
                              Closed
                            </span>
                          </>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}