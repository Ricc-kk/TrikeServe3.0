import type { ReactNode } from "react";

import { cn } from "./utils";

type SectionHeadingProps = {
  /** Optional small uppercase label above the heading. */
  eyebrow?: string;
  title: string;
  /** Short Filipino reassurance line shown under the title. */
  filipino?: string;
  /** Optional trailing content, e.g. a chip or a link. */
  action?: ReactNode;
  /** Heading level rendered; defaults to h2. */
  as?: "h2" | "h3";
  id?: string;
  className?: string;
};

/**
 * Shared heading block: optional eyebrow, a sentence-case title, a short
 * Filipino line and an optional trailing element. Keeps hierarchy identical
 * across every role hub.
 */
export default function SectionHeading({
  eyebrow,
  title,
  filipino,
  action,
  as: Heading = "h2",
  id,
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex items-end justify-between gap-4",
        Heading === "h2" ? "mb-4" : "mb-3",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-sm font-bold uppercase tracking-widest text-teal">
            {eyebrow}
          </p>
        ) : null}
        <Heading
          id={id}
          className={cn(
            "font-bold tracking-tight text-ink",
            Heading === "h2" ? "text-2xl sm:text-3xl" : "text-xl",
          )}
        >
          {title}
        </Heading>
        {filipino ? (
          <p className="mt-1 text-sm text-muted-foreground">{filipino}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
