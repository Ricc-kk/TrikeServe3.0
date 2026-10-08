import type { OrderProgress as OrderProgressTrack } from "@/lib/orderProgress";

type ProgressProps = {
  progress: OrderProgressTrack;
  className?: string;
};

/**
 * The horizontal order tracker.
 *
 * Both the customer and the business render this, so the track never changes
 * length or wording depending on who is looking at it. The columns are a fixed
 * width and the row scrolls sideways, because the track now carries the rider's
 * leg too and no longer fits a phone at once.
 *
 * Rider steps are ringed in the info colour so the hand-off from the kitchen to
 * the rider is visible, and the caption below spells out where the order is -
 * including whatever the rider app wrote as `driver_status_message`.
 */
export function OrderProgressStepper({ progress, className }: ProgressProps) {
  const { steps, current } = progress;

  return (
    <div className={className}>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max">
          {steps.map((step, idx) => {
            const done = idx <= current;
            const isCurrent = idx === current;
            const isLast = idx === steps.length - 1;

            return (
              <div key={step.key} className="flex w-[72px] sm:w-[84px] md:w-[96px] flex-col shrink-0">
                <div className="flex w-full items-center">
                  <span
                    className={[
                      "flex h-7 w-7 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                      // A cancelled order is not "done", it never got there. It gets
                      // the error colour and a cross rather than a green tick, which
                      // is what it showed before the track was shared.
                      progress.isCancelled
                        ? "bg-[var(--error)] text-white"
                        : isCurrent
                          ? "bg-[var(--info)] text-white ring-4 ring-[color:var(--info-soft)]"
                          : done
                            ? `bg-[var(--success)] text-white${step.isRiderStep ? " ring-2 ring-[color:var(--info-soft)]" : ""}`
                            : `bg-[var(--border)] text-[var(--muted-foreground)]${step.isRiderStep ? " ring-2 ring-[color:var(--info-soft)]" : ""}`,
                    ].join(" ")}
                  >
                    {progress.isCancelled ? "✕" : done ? "✓" : idx + 1}
                  </span>
                  {!isLast && (
                    <span
                      className={`mx-1 h-0.5 flex-1 rounded-full transition-colors ${
                        idx < current ? "bg-[var(--success)]" : "bg-[var(--border)]"
                      }`}
                    />
                  )}
                </div>
                <p
                  className={`mt-1.5 pr-1 text-left text-[9px] sm:text-[10px] md:text-[11px] font-semibold leading-tight ${
                    isCurrent
                      ? "text-[var(--info)]"
                      : done
                        ? "text-[var(--ink)]"
                        : "text-[var(--muted-foreground)]"
                  }`}
                >
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Where the order is right now, in words rather than tick marks. */}
      <div className="mt-1 border-t border-[var(--border)] pt-2">
        <p className={`text-xs font-bold ${progress.isCancelled ? "text-[var(--error)]" : "text-[var(--ink)]"}`}>
          {progress.currentStepIsRiderStep ? "🛵 " : ""}
          {progress.currentTitle}
        </p>
        {progress.currentStepIsRiderStep && progress.riderMessage && (
          <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
            Rider: {progress.riderMessage}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The same track as a vertical timeline, with a line of explanation per step.
 *
 * Past steps are ticked, the current one is highlighted and marked as such, and
 * upcoming steps stay muted so the list reads as "still to do" rather than as a
 * list of things that already happened.
 */
export function OrderProgressTimeline({ progress, className }: ProgressProps) {
  const { steps, current } = progress;

  return (
    <div className={className}>
      {steps.map((step, idx) => {
        const done = idx < current;
        const isCurrent = idx === current;
        // The rider app writes a human message with each status change; when we
        // have it, it beats our generic description of the step.
        const detail = isCurrent && progress.riderMessage ? progress.riderMessage : step.description;

        return (
          <div key={step.key} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <span
                className={[
                  "flex h-6 w-6 md:h-7 md:w-7 shrink-0 items-center justify-center rounded-full text-[10px] md:text-xs font-bold",
                  progress.isCancelled
                    ? "bg-[var(--error)] text-white"
                    : isCurrent
                      ? "bg-[var(--info)] text-white ring-4 ring-[color:var(--info-soft)]"
                      : done
                        ? "bg-[var(--success)] text-white"
                        : "bg-[var(--border)] text-[var(--muted-foreground)]",
                ].join(" ")}
              >
                {progress.isCancelled ? "✕" : done ? "✓" : isCurrent ? "●" : idx + 1}
              </span>
              {idx < steps.length - 1 && (
                <span className={`w-0.5 h-6 ${done ? "bg-[var(--success)]" : "bg-[var(--border)]"}`} />
              )}
            </div>

            <div className="pt-0.5 pb-3 min-w-0">
              <p
                className={`text-sm font-semibold ${
                  progress.isCancelled
                    ? "text-[var(--error)]"
                    : isCurrent
                      ? "text-[var(--info)]"
                      : done
                        ? "text-[var(--ink)]"
                        : "text-[var(--muted-foreground)]"
                }`}
              >
                {step.title}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">{detail}</p>
              {isCurrent && !progress.isCancelled && (
                <p className="mt-0.5 text-[10px] md:text-xs font-semibold text-[var(--info)]">Current</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default OrderProgressStepper;