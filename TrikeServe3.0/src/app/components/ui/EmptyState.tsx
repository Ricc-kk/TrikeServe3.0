import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { cn } from "./utils";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Short Filipino reassurance line. */
  filipino?: string;
  /** Optional action, e.g. a primary button. */
  action?: ReactNode;
  className?: string;
};

/**
 * Shared empty / no-results surface. Dashed warm container with a labelled
 * icon, a plain-language title and an optional next step.
 */
export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  filipino,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-dashed border-line bg-soft p-8 text-center",
        className,
      )}
    >
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface text-teal">
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <p className="mt-4 text-lg font-bold text-ink">{title}</p>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
      {filipino ? (
        <p className="mt-1 text-sm text-muted-foreground">{filipino}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
