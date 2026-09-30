import type { LucideIcon } from "lucide-react";

import { cn } from "./utils";

const TONES = {
  surface: {
    card: "bg-surface border-line",
    icon: "text-teal",
    label: "text-muted-foreground",
    value: "text-ink",
    meta: "text-teal",
  },
  ink: {
    card: "bg-ink border-ink text-white",
    icon: "text-amber",
    label: "text-white/70",
    value: "text-white",
    meta: "text-mint",
  },
  amber: {
    card: "bg-amber border-amber",
    icon: "text-ink",
    label: "text-ink/70",
    value: "text-ink",
    meta: "text-ink/80",
  },
  mint: {
    card: "bg-mint-soft border-mint-soft",
    icon: "text-teal",
    label: "text-muted-foreground",
    value: "text-ink",
    meta: "text-teal",
  },
} as const;

type StatCardProps = {
  icon: LucideIcon;
  label: string;
  value: string | number;
  /** Supporting line under the value, e.g. a trend or wait time. */
  meta?: string;
  tone?: keyof typeof TONES;
  className?: string;
};

/**
 * Shared metric card used across role hubs. Value and label are always paired
 * with a labelled icon so the number is never unexplained.
 */
export default function StatCard({
  icon: Icon,
  label,
  value,
  meta,
  tone = "surface",
  className,
}: StatCardProps) {
  const styles = TONES[tone];

  return (
    <div
      className={cn(
        "flex min-h-28 flex-col rounded-3xl border p-4 shadow-none",
        styles.card,
        className,
      )}
    >
      <Icon className={cn("size-6", styles.icon)} aria-hidden="true" />
      <p className={cn("mt-4 text-xs font-semibold", styles.label)}>{label}</p>
      <p className={cn("text-2xl font-bold leading-tight", styles.value)}>
        {value}
      </p>
      {meta ? (
        <p className={cn("mt-1 text-xs font-bold", styles.meta)}>{meta}</p>
      ) : null}
    </div>
  );
}
