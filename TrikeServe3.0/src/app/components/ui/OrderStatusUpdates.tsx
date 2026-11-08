import { AlertCircle, BadgeCheck, CookingPot, MapPin, Package, PackageCheck, Store, Truck } from "lucide-react";

type OrderStatusUpdatesProps = {
  status?: string | null;
  driverStatus?: string | null;
  deliveryMode?: string | null;
  /** Show shared restaurant arrival and customer drop-off milestones for delivery. */
  showRestaurantArrival?: boolean;
  className?: string;
};

function normalize(value?: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/_/g, "-");
}

/** Shared order milestones, with optional restaurant-arrival detail for business. */
export function OrderStatusUpdates({
  status: rawStatus,
  driverStatus: rawDriverStatus,
  deliveryMode: rawDeliveryMode,
  showRestaurantArrival = false,
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

  const hasRestaurantArrivalSteps = !isPickup && showRestaurantArrival;
  const steps = hasRestaurantArrivalSteps
    ? [
        { label: "Accepted", Icon: BadgeCheck },
        { label: "Preparing", Icon: CookingPot },
        { label: "Ready", Icon: Package },
        { label: "At restaurant", Icon: Store },
        { label: "Out for delivery", Icon: Truck },
        { label: "At drop-off", Icon: MapPin },
        { label: "Delivered", Icon: PackageCheck },
      ]
    : [
        { label: "Accepted", Icon: BadgeCheck },
        { label: "Preparing", Icon: CookingPot },
        { label: isPickup ? "Ready for pickup" : "Out for delivery", Icon: isPickup ? Package : Truck },
        { label: isPickup ? "Collected" : "Delivered", Icon: PackageCheck },
      ];

  // An order still awaiting the business must not look accepted. The first
  // milestone becomes active when the business confirms payment/accepts it.
  let current = status && status !== "pending" ? 0 : -1;
  if (hasRestaurantArrivalSteps) {
    const orderStepByStatus: Record<string, number> = {
      preparing: 1,
      ready: 2,
      confirmed: 2,
      "payment-confirmed": 0,
      "on-the-way": 2,
      "picked-up": 4,
      "in-progress": 4,
      "dropped-off": 5,
      "awaiting-payment": 5,
      delivered: 6,
      collected: 6,
      completed: 6,
    };
    const driverStepByStatus: Record<string, number> = {
      accepted: 2,
      // There is no separate "to restaurant" milestone. The track stays Ready
      // until the driver actually arrives at the restaurant.
      "on-the-way": 2,
      arrived: 3,
      "at-restaurant": 3,
      "picked-up": 4,
      "in-progress": 4,
      "dropped-off": 5,
      "awaiting-payment": 5,
      completed: 6,
    };

    current = Math.max(current, orderStepByStatus[status] ?? -1, driverStepByStatus[driverStatus] ?? -1);
  } else if (status !== "pending") {
    if (["delivered", "collected", "completed"].includes(status) || driverStatus === "completed") {
      current = 3;
    } else if (
      !isPickup &&
      (["picked-up", "in-progress", "dropped-off", "awaiting-payment"].includes(status) ||
        ["picked-up", "in-progress", "dropped-off", "awaiting-payment"].includes(driverStatus))
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
  }

  return (
    <div className={`relative grid w-full ${hasRestaurantArrivalSteps ? "grid-cols-7" : "grid-cols-4"} ${className ?? ""}`} role="list" aria-label="Order progress">
      {steps.slice(0, -1).map((_, index) => (
        <span
          key={`connector-${index}`}
          aria-hidden="true"
          className={`absolute top-4 h-0.5 ${index < current ? "bg-[var(--success)]" : "bg-[var(--border)]"}`}
          style={{ left: `${((index + 0.5) * 100) / steps.length}%`, width: `${100 / steps.length}%` }}
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
