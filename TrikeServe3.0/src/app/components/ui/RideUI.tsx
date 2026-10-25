import type { ComponentProps, MouseEvent, ReactNode } from "react";

import { Card } from "./card";
import { cn } from "./utils";

type RideSurfaceCardProps = ComponentProps<typeof Card>;

/** Shared card treatment for ride details and passenger summaries. */
export function RideSurfaceCard({ className, ...props }: RideSurfaceCardProps) {
  return (
    <Card
      {...props}
      className={cn(
        "rounded-2xl border border-[var(--border)] bg-surface text-[var(--ink)] shadow-sm",
        className,
      )}
    />
  );
}

interface RideModalProps {
  children: ReactNode;
  /** ID of the visible heading inside the dialog. */
  labelledBy?: string;
  /** Accessible fallback for dialogs whose heading is rendered by a child. */
  ariaLabel?: string;
  zIndexClassName?: string;
  contentClassName?: string;
  overlayClassName?: string;
  onBackdropClick?: () => void;
}

/** Centered ride popup matching the share ride dialogs. */
export function RideModal({
  children,
  labelledBy,
  ariaLabel,
  zIndexClassName = "z-[2000]",
  contentClassName,
  overlayClassName,
  onBackdropClick,
}: RideModalProps) {
  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onBackdropClick?.();
  };

  return (
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center bg-black/60 p-4",
        zIndexClassName,
        overlayClassName,
      )}
      onClick={handleBackdropClick}
    >
      <RideSurfaceCard
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : ariaLabel}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "relative w-full max-w-sm gap-0 rounded-2xl border border-[var(--border)] bg-surface p-5 text-[var(--ink)] shadow-2xl",
          contentClassName,
        )}
      >
        {children}
      </RideSurfaceCard>
    </div>
  );
}
