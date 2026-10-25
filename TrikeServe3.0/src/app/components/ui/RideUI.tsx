import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Flag, MessageCircle, Star, X } from "lucide-react";

import { Badge } from "./badge";
import { Button } from "./button";
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
          "relative w-full max-w-sm gap-0 rounded-2xl border border-[var(--border)] bg-surface p-5 text-[var(--ink)] shadow-2xl animate-slide-up",
          contentClassName,
        )}
      >
        {children}
      </RideSurfaceCard>
    </div>
  );
}

const getDriverInitials = (name?: string | null) =>
  (name || "Driver")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "D";

interface ActiveRideDriverCardProps {
  driverName: string;
  avatarUrl?: string | null;
  onAvatarError?: () => void;
  statusLabel?: string | null;
  plate: string;
  rating?: string | number | null;
  eta?: string | null;
  pickup?: string | null;
  dropoff: string;
  destinationEta?: string | null;
  fare: string;
  paymentLabel: string;
  className?: string;
  chatDisabled?: boolean;
  chatLabel?: string;
  cancelLabel?: string;
  onChat: () => void;
  onCancel?: () => void;
}

/** Shared live driver and trip card used by private and share ride tracking. */
export function ActiveRideDriverCard({
  driverName,
  avatarUrl,
  onAvatarError,
  statusLabel,
  plate,
  rating,
  eta,
  pickup,
  dropoff,
  destinationEta,
  fare,
  paymentLabel,
  className,
  chatDisabled = false,
  chatLabel = "Chat",
  cancelLabel = "Cancel",
  onChat,
  onCancel,
}: ActiveRideDriverCardProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => setAvatarFailed(false), [avatarUrl]);

  return (
    <RideSurfaceCard className={cn(
      "gap-0 overflow-hidden rounded-2xl border-2 border-[var(--primary)] bg-surface shadow-2xl",
      className,
    )}>
      <div className="p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--primary-soft)]">
            {avatarUrl && !avatarFailed ? (
              <img
                src={avatarUrl}
                alt={`${driverName}'s profile`}
                className="size-full object-cover"
                onError={() => {
                  setAvatarFailed(true);
                  onAvatarError?.();
                }}
              />
            ) : (
              <span className="text-lg font-bold text-[var(--primary)]" role="img" aria-label={`${driverName}'s initials`}>
                {getDriverInitials(driverName)}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-base font-bold text-[var(--ink)]">{driverName}</h3>
              {statusLabel && (
                <p
                  aria-live="polite"
                  className="relative flex min-w-0 items-center overflow-hidden rounded-full border border-[var(--success)]/40 bg-[var(--success)]/12 px-2 py-0.5 text-xs font-semibold text-[var(--success)]"
                >
                  <span aria-hidden="true" className="driver-status-wave pointer-events-none absolute inset-y-0 left-0 w-1/2" />
                  <span aria-hidden="true" className="driver-status-wave driver-status-wave--second pointer-events-none absolute inset-y-0 left-0 w-1/2" />
                  <span className="relative truncate">{statusLabel}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-[var(--success)] text-[10px] text-white">Driver Found</Badge>
              <span className="truncate text-xs text-[var(--muted-foreground)]">{plate}</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            {rating != null && rating !== "" && (
              <div className="flex items-center justify-end gap-1 text-[var(--amber)]">
                <Star className="size-4 fill-current" aria-hidden="true" />
                <span className="text-sm font-bold text-[var(--ink)]">{rating}</span>
              </div>
            )}
            {eta && <p className="text-xs text-[var(--muted-foreground)]">ETA: {eta}</p>}
          </div>
        </div>

        <div className="mb-3 space-y-1.5 rounded-xl bg-[var(--muted)] p-3">
          {pickup && (
            <div className="flex items-start gap-2">
              <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--ink-solid)]">
                <div className="size-2 rounded-full bg-surface" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold text-[var(--muted-foreground)]">Pickup</p>
                <p className="truncate text-xs font-semibold text-[var(--ink)]">{pickup}</p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2">
            <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]">
              <div className="size-2 rounded-full bg-surface" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-[var(--muted-foreground)]">Drop-off</p>
              <p className="truncate text-xs font-semibold text-[var(--ink)]">{dropoff}</p>
            </div>
            {destinationEta && (
              <div className="shrink-0 rounded-lg bg-[var(--error-soft)] px-2 py-1 text-[var(--error)]">
                <p className="flex items-center gap-1 text-[10px] font-bold"><Flag className="size-3" aria-hidden="true" />{destinationEta}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-[var(--muted-foreground)]">Fare</p>
            <p className="text-xl font-bold text-[var(--primary)]">{fare}</p>
            <p className="truncate text-[10px] text-[var(--muted-foreground)]">{paymentLabel}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="flex h-10 items-center gap-2 px-2.5 text-xs sm:px-3 sm:text-sm"
            onClick={onChat}
            disabled={chatDisabled}
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            {chatLabel}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="flex h-10 items-center gap-1.5 border-[var(--error)] px-2.5 text-xs text-[var(--error)] hover:bg-[var(--error-soft)] sm:px-3 sm:text-sm"
            >
              <X className="size-4" aria-hidden="true" />
              {cancelLabel}
            </Button>
          )}
        </div>
      </div>
    </RideSurfaceCard>
  );
}

interface RideStatusModalProps {
  titleId: string;
  title: string;
  message: string;
  statusLabel: string;
  icon: ReactNode;
  onDismiss: () => void;
  zIndexClassName?: string;
}

/** Shared status update dialog for both ride types. */
export function RideStatusModal({
  titleId,
  title,
  message,
  statusLabel,
  icon,
  onDismiss,
  zIndexClassName,
}: RideStatusModalProps) {
  return (
    <RideModal
      labelledBy={titleId}
      zIndexClassName={zIndexClassName}
      contentClassName="p-6 text-center"
      onBackdropClick={onDismiss}
    >
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[var(--primary)] text-white">
        {icon}
      </div>
      <h2 id={titleId} className="mb-2 text-xl font-bold text-[var(--ink)]">{title}</h2>
      <p className="mb-5 text-sm text-[var(--muted-foreground)]">{message}</p>
      <div className="mb-5 rounded-xl bg-[var(--muted)] p-4 text-left">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-[var(--muted-foreground)]">Status update</span>
          <span className="font-bold text-[var(--ink)]">{statusLabel}</span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-[var(--muted-foreground)]">Time</span>
          <span className="text-sm text-[var(--ink)]">Just now</span>
        </div>
      </div>
      <Button onClick={onDismiss} className="h-12 w-full bg-[var(--primary)] text-lg font-bold text-white hover:bg-[var(--primary)]">
        OK
      </Button>
    </RideModal>
  );
}
