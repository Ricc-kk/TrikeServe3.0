import { AlertCircle, BadgeCheck, CookingPot, MapPin, Package, PackageCheck, Store, Truck } from "lucide-react";
import type { OrderProgressAudience } from "@/lib/orderProgress";

type OrderStatusUpdatesProps = {
  status?: string | null;
  driverStatus?: string | null;
  deliveryMode?: string | null;
  audience?: OrderProgressAudience;
  className?: string;
};

function normalize(value?: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/_/g, "-");
}

const CUSTOMER_DELIVERY_STEPS = [
  { key: "accepted", label: "Accepted", Icon: BadgeCheck },
  { key: "preparing", label: "Preparing", Icon: CookingPot },
  { key: "out-for-delivery", label: "Out for Delivery", Icon: Truck },
  { key: "arrived", label: "Arrived", Icon: MapPin },
  { key: "delivered", label: "Delivered", Icon: PackageCheck },
] as const;

const BUSINESS_DELIVERY_STEPS = [
  { key: "accepted", label: "Accepted", Icon: BadgeCheck },
  { key: "preparing", label: "Preparing", Icon: CookingPot },
  { key: "driver-at-restaurant", label: "Driver at Restaurant", Icon: Store },
  { key: "out-for-delivery", label: "Out for Delivery", Icon: Truck },
  { key: "delivered", label: "Delivered", Icon: PackageCheck },
] as const;

const DRIVER_DELIVERY_STEPS = [
  { key: "pick-up-order", label: "Pick Up Order", Icon: Package },
  { key: "out-for-delivery", label: "Out for Delivery", Icon: Truck },
  { key: "arrived", label: "Arrived", Icon: MapPin },
  { key: "delivered", label: "Delivered", Icon: PackageCheck },
] as const;

const PICKUP_STEPS = [
  { key: "accepted", label: "Accepted", Icon: BadgeCheck },
  { key: "preparing", label: "Preparing", Icon: CookingPot },
  { key: "collected", label: "Collected", Icon: PackageCheck },
] as const;

/** Role-specific delivery milestones over the same order and driver statuses. */
export function OrderStatusUpdates({
  status: rawStatus,
  driverStatus: rawDriverStatus,
  deliveryMode: rawDeliveryMode,
  audience = "customer",
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

  const steps = isPickup
    ? PICKUP_STEPS
    : audience === "business"
      ? BUSINESS_DELIVERY_STEPS
      : audience === "driver"
        ? DRIVER_DELIVERY_STEPS
        : CUSTOMER_DELIVERY_STEPS;
  const stepIndex = (key: string) => steps.findIndex((step) => step.key === key);
  const advanceTo = (key: string, current: number) => {
    const index = stepIndex(key);
    return index < 0 ? current : Math.max(current, index);
  };

  // The driver's active ride starts at the pickup action. Customer and business
  // progress remain unstarted until the order is accepted.
  let current = audience === "driver" ? 0 : status === "pending" && (!driverStatus || driverStatus === "pending") ? -1 : 0;
  const isDelivered = ["delivered", "completed"].includes(status) || driverStatus === "completed";
  const isPickedUp = ["picked-up", "in-progress"].includes(status) || ["picked-up", "in-progress"].includes(driverStatus);
  const isAtDropoff = ["dropped-off", "awaiting-payment"].includes(status) || ["dropped-off", "awaiting-payment"].includes(driverStatus);
  const isAtRestaurant = ["arrived", "at-restaurant"].includes(driverStatus);

  if (isPickup) {
    if (["preparing", "ready", "confirmed", "on-the-way"].includes(status)) current = advanceTo("preparing", current);
    if (["collected", "delivered", "completed"].includes(status)) current = advanceTo("collected", current);
  } else {
    if (["preparing", "ready", "confirmed", "on-the-way"].includes(status) || ["accepted", "on-the-way", "arrived", "at-restaurant"].includes(driverStatus)) {
      current = advanceTo(audience === "driver" ? "pick-up-order" : "preparing", current);
    }

    if (isAtRestaurant && audience === "business") current = advanceTo("driver-at-restaurant", current);
    if (isPickedUp) current = advanceTo("out-for-delivery", current);

    if (isAtDropoff) {
      current = advanceTo(audience === "business" ? "out-for-delivery" : "arrived", current);
    }

    if (isDelivered) current = steps.length - 1;
  }

  return (
    <div
      className={`relative grid w-full ${className ?? ""}`}
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      role="list"
      aria-label="Order progress"
    >
      {steps.slice(0, -1).map((_, index) => (
        <span
          key={`connector-${index}`}
          aria-hidden="true"
          className={`absolute top-4 h-0.5 ${index < current ? "bg-[var(--success)]" : "bg-[var(--border)]"}`}
          style={{ left: `${((index + 0.5) * 100) / steps.length}%`, width: `${100 / steps.length}%` }}
        />
      ))}
      {steps.map(({ key, label, Icon }, index) => {
        const isCurrent = index === current;
        const isComplete = index < current;

        return (
          <div
            key={key}
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
