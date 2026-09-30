import { useEffect, useRef, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "./utils";

type AppSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Small uppercase label above the title. */
  eyebrow?: string;
  /** Optional supporting text; also used as the accessible description. */
  description?: string;
  children: ReactNode;
  /** Stacked action buttons rendered at the bottom of the sheet. */
  actions?: ReactNode;
  className?: string;
};

/**
 * Shared bottom sheet for the role hubs.
 *
 * Built on Radix Dialog, so focus is trapped while open, Escape closes it, and
 * the page behind becomes inert. Radix only restores focus automatically when a
 * `Dialog.Trigger` opened the dialog; screens here open the sheet from arbitrary
 * controls, so the opener is remembered and focus is returned to it on close.
 * The footer stacks full-width actions for easy tapping on phones.
 *
 * Named `AppSheet` to avoid colliding with the shadcn `sheet.tsx` primitive on
 * case-insensitive file systems.
 */
export default function AppSheet({
  open,
  onClose,
  title,
  eyebrow,
  description,
  children,
  actions,
  className,
}: AppSheetProps) {
  const openerRef = useRef<HTMLElement | null>(null);

  // Radix unmounts the content only after the exit animation finishes, and the
  // preview webview can freeze CSS animations, so restore focus as soon as the
  // sheet reports closed rather than relying on the unmount callback.
  useEffect(() => {
    if (open) return;
    if (openerRef.current?.isConnected) openerRef.current.focus();
    openerRef.current = null;
  }, [open]);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[2000] bg-ink/50 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={() => {
            openerRef.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(event) => {
            // Focus is restored by the effect above; just stop Radix from
            // dropping focus onto <body> when the content unmounts.
            event.preventDefault();
          }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-[2001] mx-auto flex max-h-[88vh] w-full max-w-2xl flex-col overflow-y-auto rounded-t-3xl border border-line bg-surface shadow-app outline-none",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom",
            "sm:bottom-6 sm:rounded-3xl",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-6 sm:px-7">
            <div className="min-w-0">
              {eyebrow ? (
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-teal">
                  {eyebrow}
                </p>
              ) : null}
              <DialogPrimitive.Title className="text-2xl font-bold text-ink">
                {title}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="grid size-11 shrink-0 place-items-center rounded-2xl bg-soft text-ink transition-colors hover:bg-line"
            >
              <X className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          {description ? (
            <DialogPrimitive.Description className="px-5 pb-1 text-base text-muted-foreground sm:px-7">
              {description}
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">
              {title}
            </DialogPrimitive.Description>
          )}

          <div className="px-5 pt-4 sm:px-7">{children}</div>

          <div
            className={cn(
              actions ? "grid gap-2 px-5 pt-3 sm:px-7" : "px-5 sm:px-7",
              "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
            )}
          >
            {actions}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
