/** The delivery progress vocabulary shown to each person following an order. */
export type OrderProgressAudience = 'customer' | 'business' | 'driver';

export type OrderStepKey =
  | 'accepted'
  | 'preparing'
  | 'driver-at-restaurant'
  | 'pick-up-order'
  | 'out-for-delivery'
  | 'arrived'
  | 'delivered'
  | 'collected'
  | 'cancelled';

export interface OrderProgressStep {
  key: OrderStepKey;
  /** Short label for the horizontal tracker. */
  label: string;
  /** Full phrase for badges and headings. */
  title: string;
  /** One line of explanation for a timeline. */
  description: string;
  /** True for milestones handled by the driver. */
  isRiderStep: boolean;
}

export interface OrderProgress {
  /** The full track for this audience and delivery mode. */
  steps: OrderProgressStep[];
  /** Index of the current step; -1 means the order has not been accepted yet. */
  current: number;
  currentStep: OrderProgressStep;
  currentLabel: string;
  currentTitle: string;
  currentStepIsRiderStep: boolean;
  /** True once the driver has started moving, including the trip to the restaurant. */
  riderHasStarted: boolean;
  hasRider: boolean;
  isCancelled: boolean;
  /** Normalised `ride_requests.driver_status`, if there is one. */
  riderStatus: string | null;
  /** What this screen calls the person delivering the order. */
  driverLabel: 'Rider' | 'Driver';
  /** Whatever the driver app wrote in `driver_status_message`, shown verbatim. */
  riderMessage: string | null;
}

const CUSTOMER_DELIVERY_STEPS: OrderProgressStep[] = [
  { key: 'accepted', label: 'Accepted', title: 'Accepted', description: 'The restaurant accepted your order.', isRiderStep: false },
  { key: 'preparing', label: 'Preparing', title: 'Preparing', description: 'The kitchen is preparing your order.', isRiderStep: false },
  { key: 'out-for-delivery', label: 'Out for Delivery', title: 'Out for Delivery', description: 'The driver picked up your order and is bringing it to you.', isRiderStep: true },
  { key: 'arrived', label: 'Arrived', title: 'Arrived', description: 'The driver arrived at your address and is completing the handover.', isRiderStep: true },
  { key: 'delivered', label: 'Delivered', title: 'Delivered', description: 'The order was delivered. Thanks for ordering!', isRiderStep: true },
];

const BUSINESS_DELIVERY_STEPS: OrderProgressStep[] = [
  { key: 'accepted', label: 'Accepted', title: 'Accepted', description: 'The restaurant accepted the order.', isRiderStep: false },
  { key: 'preparing', label: 'Preparing', title: 'Preparing', description: 'The kitchen is preparing the order.', isRiderStep: false },
  { key: 'driver-at-restaurant', label: 'Driver at Restaurant', title: 'Driver at Restaurant', description: 'The driver has arrived to collect the order.', isRiderStep: true },
  { key: 'out-for-delivery', label: 'Out for Delivery', title: 'Out for Delivery', description: 'The driver collected the order and is bringing it to the customer.', isRiderStep: true },
  { key: 'delivered', label: 'Delivered', title: 'Delivered', description: 'The order was delivered to the customer.', isRiderStep: true },
];

const DRIVER_DELIVERY_STEPS: OrderProgressStep[] = [
  { key: 'pick-up-order', label: 'Pick Up Order', title: 'Pick Up Order', description: 'Collect the order from the restaurant.', isRiderStep: true },
  { key: 'out-for-delivery', label: 'Out for Delivery', title: 'Out for Delivery', description: 'Bring the order to the customer.', isRiderStep: true },
  { key: 'arrived', label: 'Arrived', title: 'Arrived', description: 'You arrived at the customer’s address.', isRiderStep: true },
  { key: 'delivered', label: 'Delivered', title: 'Delivered', description: 'The order was handed to the customer.', isRiderStep: true },
];

/** Pickup still needs a collect action, but it no longer exposes a Ready step. */
const PICKUP_STEPS: OrderProgressStep[] = [
  { key: 'accepted', label: 'Accepted', title: 'Accepted', description: 'The restaurant accepted your order.', isRiderStep: false },
  { key: 'preparing', label: 'Preparing', title: 'Preparing', description: 'The kitchen is preparing your order.', isRiderStep: false },
  { key: 'collected', label: 'Collected', title: 'Collected', description: 'The order was collected from the restaurant.', isRiderStep: false },
];

const CANCELLED_STEPS: OrderProgressStep[] = [
  { key: 'cancelled', label: 'Cancelled', title: 'Cancelled', description: 'This order was cancelled.', isRiderStep: false },
];

const DELIVERY_STEPS: Record<OrderProgressAudience, OrderProgressStep[]> = {
  customer: CUSTOMER_DELIVERY_STEPS,
  business: BUSINESS_DELIVERY_STEPS,
  driver: DRIVER_DELIVERY_STEPS,
};

function normalize(value?: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/_/g, '-');
}

/**
 * True until the driver has picked up the order. Business live tracking uses
 * this to route to the shop first, then to the customer.
 */
export function isRiderHeadingToRestaurant(riderStatus?: string | null): boolean {
  const key = normalize(riderStatus);
  return ['pending', 'assigned', 'accepted', 'on-the-way', 'arrived', 'at-restaurant'].includes(key);
}

/** Build the role-specific order track from the order and driver statuses. */
export function getOrderProgress(input: {
  status?: string | null;
  driverStatus?: string | null;
  driverMessage?: string | null;
  driverAssigned?: boolean;
  deliveryMode?: string | null;
  driverLabel?: 'Rider' | 'Driver';
  audience?: OrderProgressAudience;
}): OrderProgress {
  const status = normalize(input.status);
  const riderStatus = normalize(input.driverStatus) || null;
  const driverLabel = input.driverLabel ?? 'Rider';
  const audience = input.audience ?? 'customer';
  const rawDriverMessage = input.driverMessage?.trim() || '';
  const riderMessage = rawDriverMessage
    ? rawDriverMessage.replace(/\b(rider|driver)\b/gi, (role) => {
        if (role === role.toUpperCase()) return driverLabel.toUpperCase();
        if (role[0] === role[0].toUpperCase()) return driverLabel;
        return driverLabel.toLowerCase();
      })
    : null;

  if (status === 'cancelled') {
    return {
      steps: CANCELLED_STEPS,
      current: 0,
      currentStep: CANCELLED_STEPS[0],
      currentLabel: CANCELLED_STEPS[0].label,
      currentTitle: CANCELLED_STEPS[0].title,
      currentStepIsRiderStep: false,
      riderHasStarted: false,
      hasRider: false,
      isCancelled: true,
      riderStatus,
      driverLabel,
      riderMessage,
    };
  }

  const isPickup = normalize(input.deliveryMode) === 'pickup';
  const steps = isPickup ? PICKUP_STEPS : DELIVERY_STEPS[audience];
  const indexFor = (key: OrderStepKey) => steps.findIndex((step) => step.key === key);
  const advanceTo = (key: OrderStepKey, current: number) => {
    const index = indexFor(key);
    return index < 0 ? current : Math.max(current, index);
  };
  const isDelivered = ['delivered', 'completed', 'collected'].includes(status) || riderStatus === 'completed';
  let current = audience === 'driver'
    ? 0
    : status === 'pending' && (!riderStatus || riderStatus === 'pending') && !input.driverAssigned
      ? -1
      : 0;

  if (isPickup) {
    if (['preparing', 'ready', 'confirmed', 'on-the-way'].includes(status)) current = advanceTo('preparing', current);
    if (['collected', 'delivered', 'completed'].includes(status)) current = advanceTo('collected', current);
  } else {
    if (
      ['preparing', 'ready', 'confirmed', 'on-the-way'].includes(status) ||
      ['accepted', 'on-the-way', 'arrived', 'at-restaurant'].includes(riderStatus ?? '')
    ) {
      current = advanceTo(audience === 'driver' ? 'pick-up-order' : 'preparing', current);
    }

    if (audience === 'business' && ['arrived', 'at-restaurant'].includes(riderStatus ?? '')) {
      current = advanceTo('driver-at-restaurant', current);
    }

    if (['picked-up', 'in-progress'].includes(status) || ['picked-up', 'in-progress'].includes(riderStatus ?? '')) {
      current = advanceTo('out-for-delivery', current);
    }

    if (['dropped-off', 'awaiting-payment'].includes(status) || ['dropped-off', 'awaiting-payment'].includes(riderStatus ?? '')) {
      current = advanceTo(audience === 'business' ? 'out-for-delivery' : 'arrived', current);
    }
  }

  if (isDelivered) current = steps.length - 1;
  current = Math.min(Math.max(current, -1), steps.length - 1);
  const currentStep = steps[Math.max(current, 0)];
  const hasRider = !isPickup;
  const riderHasStarted = hasRider && (
    ['on-the-way', 'picked-up', 'in-progress', 'dropped-off', 'awaiting-payment', 'delivered', 'completed'].includes(status) ||
    ['on-the-way', 'arrived', 'at-restaurant', 'in-progress', 'picked-up', 'dropped-off', 'awaiting-payment', 'completed'].includes(riderStatus ?? '')
  );

  return {
    steps,
    current,
    currentStep,
    currentLabel: currentStep.label,
    currentTitle: currentStep.title,
    currentStepIsRiderStep: currentStep.isRiderStep && hasRider,
    riderHasStarted,
    hasRider,
    isCancelled: false,
    riderStatus,
    driverLabel,
    riderMessage,
  };
}
