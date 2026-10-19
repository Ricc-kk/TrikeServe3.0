import { AlertCircle, BadgeCheck, CookingPot, Package, PackageCheck, Truck } from "lucide-react";

type OrderStatusUpdatesProps = {
  status?: string | null;
  driverStatus?: string | null;
  deliveryMode?: string | null;
  className?: string;
};

function normalize(value?: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/_/g, "-");
}

/** The four order milestones shared by the customer, business, and driver views. */
export function OrderStatusUpdates({
  status: rawStatus,
  driverStatus: rawDriverStatus,
  deliveryMode: rawDeliveryMode,
  className,
}: OrderStatusUpdatesProps) {
  const status = normalize(rawStatus);
  const driverStatus = normalize(rawDriverStatus);
  const isPickup = normalize(rawDeliveryMode) === "pickup";

  if (status === "cancelled") {
    return (
      <div className={`flex items-center justify-center gap-2 text-[var(--error)] ${className ?? ""}`}>
        <AlertCircle className="size-5" aria-hidden="true" />
        <span className="font-semibold">Cancelled</span>
      </div>
    );
  }

  const steps = [
    { label: "Accepted", Icon: BadgeCheck },
    { label: "Preparing", Icon: CookingPot },
    { label: isPickup ? "Ready for pickup" : "Out for delivery", Icon: isPickup ? Package : Truck },
    { label: isPickup ? "Collected" : "Delivered", Icon: PackageCheck },
  ];

  let current = 0;
  if (["delivered", "collected", "completed"].includes(status) || driverStatus === "completed") {
    current = 3;
  } else if (
    !isPickup &&
    ["picked-up", "in-progress", "dropped-off", "awaiting-payment"].includes(driverStatus)
  ) {
    current = 2;
  } else if (!isPickup && status === "on-the-way" && !driverStatus) {
    current = 2;
  } else if (isPickup && ["ready", "confirmed", "on-the-way"].includes(status)) {
    current = 2;
  } else if (["preparing", "ready", "on-the-way"].includes(status)) {
    // `confirmed` is used by the business flow when an order is published to
    // drivers; it must not imply that kitchen preparation has started.
    current = 1;
  }

  return (
    <div className={`relative grid w-full grid-cols-4 ${className ?? ""}`} role="list" aria-label="Order progress">
      {steps.slice(0, -1).map((_, index) => (
        <span
          key={`connector-${index}`}
          aria-hidden="true"
          className={`absolute top-4 h-0.5 ${index < current ? "bg-[var(--success)]" : "bg-[var(--border)]"}`}
          style={{ left: `${12.5 + index * 25}%`, width: "25%" }}
        />
      ))}
      {steps.map(({ label, Icon }, index) => {
        const isCurrent = index === current;
        const isComplete = index < current;

        return (
          <div
            key={label}
            role="listitem"
            aria-current={isCurrent ? "step" : undefined}
            className="relative z-10 flex min-w-0 flex-col items-center text-center"
          >
            <span
              className={[
                "flex size-8 shrink-0 items-center justify-center rounded-full",
                isCurrent
                  ? "bg-[var(--info)] text-white ring-4 ring-[color:var(--info-soft)]"
                  : isComplete
                    ? "bg-[var(--success)] text-white"
                    : "bg-[var(--border)] text-[var(--muted-foreground)]",
              ].join(" ")}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>

            <div className="min-w-0 px-0.5 pt-2">
              <p
                className={`text-[10px] font-semibold leading-tight sm:text-xs ${
                  isCurrent
                    ? "text-[var(--info)]"
                    : isComplete
                      ? "text-[var(--ink)]"
                      : "text-[var(--muted-foreground)]"
                }`}
              >
                {label}
              </p>
              {isCurrent && (
                <p className="mt-0.5 text-[9px] font-semibold text-[var(--info)] sm:text-[10px]">Current</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default OrderStatusUpdates;
