import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, Loader2, Search } from "lucide-react";
import { useNavigate } from "react-router";

import { supabase } from "../../../utils/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useDeliveryAddress } from "../../contexts/useDeliveryAddress";
import BottomNav from "../ui/BottomNav";
import RecommendedRestaurants from "./RecommendedRestaurants";
import { HubFilters, HubSearches, HubTerminals, type HubFilter } from "./CustomerHubFilters";
import { usePreviousPage } from "../../hooks/usePreviousPage";

type Terminal = {
  id: string;
  name: string;
  boundary: string;
  center_lat: number;
  center_lng: number;
  base_fare?: number | null;
};

/**
 * Everything the home page used to show, behind the search field.
 *
 * The hub was rebuilt into filters, recents, terminals and a ranked feed, and
 * then put straight on the landing screen — so the first thing a customer saw
 * was a list of terminals before they had said what they wanted. That content
 * belongs here instead: it is what you get once you have opened search, and it
 * answers the same question the food screen's search answers, over terminals
 * and restaurants together.
 *
 * The header deliberately drops the notification bell and the avatar. They sat
 * on the same row as back, location and the field, and while searching none of
 * them is what the customer is doing — the field is.
 */
export default function CustomerSearchPage() {
  const navigate = useNavigate();
  // Search is reached from the hub, but it is also the landing screen for a
  // shared search link; back should undo the tap, not force a fixed parent.
  const goBack = usePreviousPage("/customer");
  const { user } = useAuth();
  const delivery = useDeliveryAddress();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HubFilter>("all");
  const [terminals, setTerminals] = useState<Terminal[]>([]);

  /*
   * The delivery address, or where the customer is standing.
   *
   * `delivery.address` is the chosen address, falling back to the device position
   * when the customer has never chosen one. That fallback used to be built here
   * out of `user.address` plus a one-off geolocation call, and it had two problems:
   * a customer with a profile address never saw their actual location even when
   * they had moved, and the label never persisted, so it re-prompted for location
   * on every visit. Both are now the hook's business, shared with the food header
   * and checkout so the three screens cannot disagree about where an order goes.
   *
   * The profile address is still worth reading directly: it is the one address a
   * customer can have without ever opening the address picker, and `delivery`
   * only falls back to it on mount.
   */
  const locationLabel =
    delivery.address?.address?.trim() ||
    user?.address?.trim() ||
    (delivery.locating ? "Locating you…" : "Add delivery address");

  useEffect(() => {
    // `select('*')` keeps this working before ADD_TERMINAL_FARES.sql adds the
    // per-terminal fare columns.
    let cancelled = false;
    supabase
      .from("terminals")
      .select("*")
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setTerminals(data.filter((t: any) => t.is_active !== false) as Terminal[]);
      })
      .catch(() => {
        // No terminals is a degraded search, not a broken screen.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const term = query.trim().toLowerCase();

  const matchingTerminals = useMemo(
    () =>
      term
        ? terminals.filter((t) => t.name.toLowerCase().includes(term))
        : terminals,
    [terminals, term],
  );

  const showTerminals = filter === "all" || filter === "tricycle";
  const showFood = filter === "all" || filter === "food";


  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <header className="sticky top-0 z-[1000] border-b border-line bg-[var(--surface)] pt-safe">
        <div className="mx-auto max-w-3xl px-4 pb-2.5 pt-2 sm:px-5">
          {/* Back, then "Deliver to" with the address under it. In a search
              box "where am I" is the first thing worth knowing, not something
              behind an icon — and it is the same wording the food header uses,
              so the fact does not change name between screens. */}
          <div className="mb-2 flex items-start gap-2">
            <button
              type="button"
              onClick={goBack}
              aria-label="Back"
              className="grid size-11 flex-shrink-0 place-items-center rounded-xl hover:bg-[var(--muted)]"
            >
              <ChevronLeft className="size-5 text-[var(--ink)]" aria-hidden="true" />
            </button>
            {/* Same affordance as the food section: the location line there
                opens the address list, so it does here too. */}
            <button
              type="button"
              onClick={() => navigate("/customer/delivery-address")}
              className="min-w-0 flex-1 pt-0.5 text-left"
            >
              <span className="block text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                Deliver to
              </span>
              <span className="flex items-center gap-1">
                {delivery.locating && (
                  <Loader2
                    className="size-3.5 flex-shrink-0 animate-spin text-[var(--muted-foreground)]"
                    aria-hidden="true"
                  />
                )}
                <span className="truncate text-sm font-semibold text-[var(--ink)]">
                  {locationLabel}
                </span>
                <ChevronDown className="size-4 flex-shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
              </span>
            </button>
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#5c6b68]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search terminals or restaurants"
              aria-label="Search terminals or restaurants"
              autoFocus
              className="min-h-13 w-full rounded-full border border-[#d6d3ca] bg-white pl-12 pr-4 text-base text-[#122724] shadow-md outline-none focus:border-[#122724]"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-4 pb-24 sm:px-5">
        <HubFilters value={filter} onChange={setFilter} />

        {/* Only worth offering while the field is empty: once someone is typing,
            results below are the answer. */}
        {!term && (
          <HubSearches onPick={(t) => setQuery(t)} />
        )}

        {showTerminals && (
          <HubTerminals
            terminals={matchingTerminals}
            onSelect={() => navigate("/customer")}
          />
        )}

        {showFood && <RecommendedRestaurants query={query} />}

      </main>

      <BottomNav variant="customer" />
    </div>
  );
}
