import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";

import { cn } from "./utils";

type ChoiceCardProps = {
  /** Toggle state; exposed to assistive tech via aria-pressed. */
  selected: boolean;
  onSelect: () => void;
  /** Primary English label. */
  label: string;
  /** Short Filipino label shown next to the primary label. */
  filipino?: string;
  /** Plain-language explanation of the choice. */
  description?: string;
  icon: LucideIcon;
  /** Fare or price shown on the right, e.g. "15". */
  price?: string;
  /** Caption above the price, e.g. "Fixed fare". */
  priceLabel?: string;
  /** Supporting meta line, e.g. wait time. */
  meta?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Large selectable card.
 *
 * Selected state is signalled by border, fill, icon treatment **and** a check
 * badge, so it never relies on colour alone. Meets the 44px minimum target
 * comfortably at phone widths.
 */
export default function ChoiceCard({
  selected,
  onSelect,
  label,
  filipino,
  description,
  icon: Icon,
  price,
  priceLabel = "Fixed fare",
  meta,
  disabled = false,
  className,
}: ChoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        "relative flex min-h-32 w-full flex-col rounded-3xl border-2 p-4 text-left transition-colors",
        "focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        selected
          ? "border-teal bg-mint-soft"
          : "border-line bg-surface hover:border-muted-foreground/40",
        className,
      )}
    >
      <span
        className={cn(
          "absolute bottom-4 right-4 grid size-7 place-items-center rounded-full border-2 transition-colors",
          selected ? "border-teal bg-teal text-white" : "border-line text-transparent",
        )}
        aria-hidden="true"
      >
        <Check className="size-4" />
      </span>

      <span className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-2xl",
            selected ? "bg-teal text-white" : "bg-soft text-ink",
          )}
          aria-hidden="true"
        >
          <Icon className="size-6" />
        </span>

        {price !== undefined ? (
          <span className="block text-right">
            <span className="block text-xs text-muted-foreground">
              {priceLabel}
            </span>
            <span className="block text-2xl font-bold text-ink">₱{price}</span>
          </span>
        ) : null}
      </span>

      <span className="mt-3 block text-lg font-bold text-ink">
        {label}
        {filipino ? (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {filipino}
          </span>
        ) : null}
      </span>

      {description ? (
        <span className="mt-1 block text-sm leading-snug text-muted-foreground">
          {description}
        </span>
      ) : null}

      {meta ? (
        <span className="mt-2 block pr-9 text-sm font-bold text-teal">
          {meta}
        </span>
      ) : null}
    </button>
  );
}
