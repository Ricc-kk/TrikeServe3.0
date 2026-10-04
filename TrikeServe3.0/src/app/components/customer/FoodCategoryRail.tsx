import { useEffect, useRef, useState } from "react";
import { Grid3x3 } from "lucide-react";

import { CUISINES, type CuisineId } from "@/lib/foodTaxonomy";

export type FoodCategoryId = CuisineId | "all";

export type { CuisineId };

type FoodCategoryRailProps = {
  value: FoodCategoryId;
  onChange: (next: FoodCategoryId) => void;
  /** How many restaurants each bucket currently holds. */
  counts?: Partial<Record<FoodCategoryId, number>>;
};

/**
 * The cuisine filter rail.
 *
 * The buckets used to be inferred from `menu_items.category`, so "Ihawan" meant
 * "sells one item categorised chicken" and "Kafe" and "Malamig" both matched
 * `drinks` -- those two filters could never return different restaurants. The
 * rail now matches the cuisine a business declares in its own settings.
 */
export default function FoodCategoryRail({
  value,
  onChange,
  counts,
}: FoodCategoryRailProps) {
  const allCount = counts?.all;
  const railRef = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);

  /**
   * Replace the rail's scrollbar with a line indicator.
   *
   * The scrollbar sat as a grey strip directly under the categories and told
   * the customer nothing about position. Measuring the rail's own offset keeps
   * the indicator correct when the cuisine list or counts change.
   */
  const onScroll = () => {
    const rail = railRef.current;
    if (!rail) return;

    const pageWidth = rail.clientWidth - 32;
    const total = Math.max(1, Math.ceil(rail.scrollWidth / pageWidth));

    setPages(total);
    setPage(Math.min(total - 1, Math.max(0, Math.round(rail.scrollLeft / pageWidth))));
  };

  /** Keep the selected category visible after a tap further along the rail. */
  const scrollSelectedIntoView = (id: FoodCategoryId) => {
    const rail = railRef.current;
    const button = rail?.querySelector<HTMLElement>(`[data-category="${id}"]`);
    button?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  // Measure once mounted and again on resize. Without this the indicator only
  // ever appeared after the first scroll, so a rail that started overflowing
  // showed no lines at all until the customer touched it.
  useEffect(() => {
    onScroll();
    window.addEventListener("resize", onScroll);
    return () => window.removeEventListener("resize", onScroll);
  }, []);

  return (
    <div>
      <div
        ref={railRef}
        onScroll={onScroll}
        role="tablist"
        aria-label="Food categories"
        // [scrollbar-width:none] plus the WebKit pseudo-element is the only
        // way to actually remove the bar; `overflow-x: auto` alone still draws
        // it on Windows and Android.
        className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-5 sm:px-5 [&::-webkit-scrollbar]:hidden"
        // A horizontally scrolling rail is not keyboard-scrollable by default.
        tabIndex={0}
      >
      <button
        type="button"
        role="tab"
        aria-selected={value === "all"}
        onClick={() => {
            onChange("all");
            scrollSelectedIntoView("all");
          }}
          data-category="all"
        className={[
          "flex min-h-14 flex-shrink-0 items-center gap-2 rounded-2xl border-2 px-3.5 transition-colors",
          value === "all"
            ? "border-[var(--primary)] bg-[var(--primary-soft)]"
            : "border-line bg-[var(--surface)] hover:bg-[var(--muted)]",
        ].join(" ")}
      >
        <Grid3x3
          className="size-5 flex-shrink-0"
          color={value === "all" ? "var(--primary)" : "var(--muted-foreground)"}
          aria-hidden="true"
        />
        <span className="min-w-0 text-left leading-tight">
          <span
            className="block truncate text-sm font-bold"
            style={{
              color: value === "all" ? "var(--coral-dark)" : "var(--ink)",
            }}
          >
            All
          </span>
          <span className="block truncate text-[11px] text-[var(--muted-foreground)]">
            Lahat
            {typeof allCount === "number" && allCount > 0 ? ` · ${allCount}` : ""}
          </span>
        </span>
      </button>

      {CUISINES.map(({ id, label, filipino, Icon }) => {
        const selected = value === id;
        const count = counts?.[id];

        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => {
              onChange(id);
              scrollSelectedIntoView(id);
            }}
            data-category={id}
            className={[
              "flex min-h-14 flex-shrink-0 items-center gap-2 rounded-2xl border-2 px-3.5 transition-colors",
              selected
                ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                : "border-line bg-[var(--surface)] hover:bg-[var(--muted)]",
            ].join(" ")}
          >
            <Icon
              className="size-5 flex-shrink-0"
              color={selected ? "var(--primary)" : "var(--muted-foreground)"}
              aria-hidden="true"
            />
            <span className="min-w-0 text-left leading-tight">
              <span
                className="block truncate text-sm font-bold"
                style={{
                  color: selected ? "var(--coral-dark)" : "var(--ink)",
                }}
              >
                {label}
              </span>
              <span className="block truncate text-[11px] text-[var(--muted-foreground)]">
                {filipino}
                {typeof count === "number" && count > 0 ? ` · ${count}` : ""}
              </span>
            </span>
          </button>
        );
      })}
      </div>

      {pages > 1 && (
        <div
          className="mt-2 flex items-center justify-center gap-1.5"
          role="status"
          aria-label={`Categories page ${page + 1} of ${pages}`}
        >
          {Array.from({ length: pages }, (_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={`h-1 rounded-full transition-all duration-200 ${
                i === page ? "w-6 bg-[var(--success)]" : "w-2.5 bg-[var(--line)]"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}