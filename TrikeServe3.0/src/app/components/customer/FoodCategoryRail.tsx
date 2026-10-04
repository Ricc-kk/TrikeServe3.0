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

  return (
    <div
      role="tablist"
      aria-label="Food categories"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5"
      // A horizontally scrolling rail is not keyboard-scrollable by default.
      tabIndex={0}
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === "all"}
        onClick={() => onChange("all")}
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
            onClick={() => onChange(id)}
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
  );
}