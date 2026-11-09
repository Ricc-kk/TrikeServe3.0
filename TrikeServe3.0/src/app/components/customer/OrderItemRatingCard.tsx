import { useId } from "react";
import { CheckCircle2, Star, UtensilsCrossed } from "lucide-react";

import { ImageWithFallback } from "../figma/ImageWithFallback";

type OrderItemRatingCardProps = {
  item: { id: string; name: string; quantity: number; image: string };
  value: number;
  saved: boolean;
  disabled?: boolean;
  onChange: (rating: number) => void;
};

const RATING_LABELS = ["Tap to rate", "Poor", "Fair", "Good", "Great", "Loved it"];

export default function OrderItemRatingCard({ item, value, saved, disabled, onChange }: OrderItemRatingCardProps) {
  const ratingId = useId();
  const unavailable = !item.id || Boolean(disabled);

  return (
    <article
      aria-label={`${item.name} rating`}
      className={`grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 rounded-2xl border bg-card p-4 text-left min-[520px]:grid-cols-[4rem_minmax(0,1fr)_auto] ${saved ? "border-[var(--success)]/30" : "border-line"}`}
    >
      <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--muted)] min-[520px]:size-16">
        {item.image ? (
          <ImageWithFallback src={item.image} alt={item.name} className="size-full object-cover" />
        ) : (
          <UtensilsCrossed className="size-6 text-[var(--muted-foreground)]" aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0">
        <h3 className="break-words text-sm font-bold leading-5 text-[var(--ink)]">{item.name}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="text-[var(--muted-foreground)]">Qty: {item.quantity}</span>
          {saved ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success-soft)] px-2 py-0.5 font-semibold text-[var(--success-ink)]">
              <CheckCircle2 className="size-3" aria-hidden="true" />Saved
            </span>
          ) : value > 0 ? (
            <span className="font-medium text-[var(--primary)]">Not saved yet</span>
          ) : null}
        </div>
        {!item.id && <p className="mt-1 text-xs text-[var(--error)]">This item cannot be rated.</p>}
      </div>

      <fieldset
        disabled={unavailable || saved}
        className="col-span-2 flex min-w-0 flex-col items-end gap-1 border-t border-line pt-3 min-[520px]:col-span-1 min-[520px]:border-t-0 min-[520px]:pt-0"
      >
        <legend className="sr-only">Rate {item.name}</legend>
        <p className="flex min-h-4 items-center gap-2 pr-1 text-xs" aria-live="polite">
          <span className={value > 0 ? "font-medium text-[var(--ink)]" : "text-[var(--muted-foreground)]"}>
            {!item.id ? "Unavailable" : RATING_LABELS[value] || RATING_LABELS[0]}
          </span>
          {value > 0 && <span className="font-semibold tabular-nums text-[var(--amber-ink)]">{value}/5</span>}
        </p>
        <div className={`flex rounded-xl bg-[var(--muted)] p-0.5 ${unavailable && !saved ? "opacity-50" : ""}`}>
          {[1, 2, 3, 4, 5].map((star) => (
            <label key={star} className={unavailable || saved ? "cursor-default" : "cursor-pointer"}>
              <input
                type="radio"
                name={ratingId}
                value={star}
                checked={value === star}
                onChange={() => onChange(star)}
                aria-label={`Rate ${item.name} ${star} out of 5 — ${RATING_LABELS[star]}`}
                className="peer sr-only"
              />
              <span className="grid size-11 place-items-center rounded-lg transition-colors peer-enabled:hover:bg-[var(--amber-soft)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--primary)]">
                <Star
                  strokeWidth={1.7}
                  className={`size-6 ${star <= value ? "fill-[var(--amber)] text-[var(--amber-ink)]" : "fill-transparent text-[var(--muted-foreground)]"}`}
                  aria-hidden="true"
                />
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </article>
  );
}
