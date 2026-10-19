/**
 * The order progress track, in one place.
 *
 * Customer, business and driver screens share this track so they agree about
 * where an order is. The visible label can still use "Rider" or "Driver" for
 * the delivery role, depending on who is looking at it.
 *
 * Two signals feed the track:
 *
 *   `orders.status`             the restaurant side - received, preparing, ready,
 *                               rider assigned
 *   `ride_requests.driver_status` the rider side - heading to the shop, at the
 *                               shop, order in hand, at the door, done
 *
 * The delivery status is the finer of the two, so it drives the second half of
 * the track while the order status only sets a floor. The two rows live in
 * different tables and are written by two devices, so they briefly disagree:
 * taking the furthest step forward and never back keeps the track monotonic, the
 * way a progress bar is expected to behave.
 *
 * Status vocabulary note: the driver app writes `picked-up` / `dropped-off` /
 * `awaiting-payment` while its own UI says `pickup` / `drop-off` / `payment`,
 * and older rows use underscores. Everything is normalised here so callers can
 * pass whichever spelling they have.
 */

export type OrderStepKey =
  | 'received'
  | 'preparing'
  | 'ready'
  | 'rider-assigned'
  | 'picked-up'
  | 'arrived'
  | 'delivered'
  | 'collected'
  | 'cancelled';

export interface OrderProgressStep {
  key: OrderStepKey;
  /** Two or three words - it has to fit under a circle. */
  label: string;
  /** Full phrase for badges and headings, e.g. "Rider heading to the restaurant". */
  title: string;
  /** One line of explanation for the timeline. */
  description: string;
  /** True for the steps that only exist because a rider is carrying the order. */
  isRiderStep: boolean;
}

export interface OrderProgress {
  /** The full track. Always the same length for a given mode, never trimmed. */
  steps: OrderProgressStep[];
  /** Index of the step the order is on. Everything up to it is done. */
  current: number;
  currentStep: OrderProgressStep;
  /** Short label of the current step. */
  currentLabel: string;
  /** Full phrase for the current step, e.g. "Rider heading to the restaurant". */
  currentTitle: string;
  /** True when the current step is one of the rider's, not the restaurant's. */
  currentStepIsRiderStep: boolean;
  /**
   * True once the rider has actually set off, i.e. their status is past
   * "assigned". A ride request nobody has accepted yet also lands on the
   * `rider-assigned` step, and screens should not announce a rider who has not
   * started.
   */
  riderHasStarted: boolean;
  /** True when this order has a rider leg at all (false for pickup orders). */
  hasRider: boolean;
  isCancelled: boolean;
  /** Normalised `ride_requests.driver_status`, if there is one. */
  riderStatus: string | null;
  /** What this screen calls the person delivering the order. */
  driverLabel: 'Rider' | 'Driver';
  /** Whatever the rider app wrote in `driver_status_message`, shown verbatim. */
  riderMessage: string | null;
}

/** Delivery orders: the restaurant hands the food to a rider. */
const DELIVERY_STEPS: OrderProgressStep[] = [
  { key: 'received', label: 'Received', title: 'Order received', description: 'The restaurant has received your order and is checking your GCash payment.', isRiderStep: false },
  { key: 'preparing', label: 'Preparing', title: 'Preparing your order', description: 'The kitchen is preparing your order.', isRiderStep: false },
  { key: 'ready', label: 'Ready', title: 'Ready for pickup', description: 'Your order is packed and waiting to be collected.', isRiderStep: false },
  { key: 'rider-assigned', label: 'Rider Assigned', title: 'Rider assigned to collect your order', description: 'A rider has been assigned to pick up your order from the restaurant.', isRiderStep: true },
  { key: 'picked-up', label: 'Picked Up', title: 'Order picked up', description: 'Your rider has the order and is on the way to you.', isRiderStep: true },
  { key: 'arrived', label: 'Rider Arrived', title: 'Rider Arrived', description: 'Your rider has arrived at your address and is waiting for payment.', isRiderStep: true },
  { key: 'delivered', label: 'Delivered', title: 'Order delivered', description: 'The order was delivered. Thanks for ordering!', isRiderStep: true },
];

/**
 * Pickup orders have no delivery leg, so they use the restaurant steps followed
 * by Collected.
 *
 * Payment confirmation remains part of the order state, but is not a separate
 * progress step.
 */
const PICKUP_STEPS: OrderProgressStep[] = [
  DELIVERY_STEPS[0],
  DELIVERY_STEPS[1],
  DELIVERY_STEPS[2],
  { key: 'collected', label: 'Collected', title: 'Order collected', description: 'The order was collected from the restaurant.', isRiderStep: false },
];

const CANCELLED_STEPS: OrderProgressStep[] = [
  { key: 'cancelled', label: 'Cancelled', title: 'Order cancelled', description: 'This order was cancelled.', isRiderStep: false },
];

const RIDER_ASSIGNED_INDEX = DELIVERY_STEPS.findIndex((s) => s.key === 'rider-assigned');
const DELIVERED_INDEX = DELIVERY_STEPS.length - 1;

/**
 * How far the restaurant's own status gets the track, as a floor.
 *
 * `on-the-way` is written when the driver sets off towards the shop, but the
 * business screen also folds later delivery phases into that one value. Since
 * this step combines assignment, travel to the shop and arrival there, this
 * status cannot safely advance the track to Picked Up.
 */
const ORDER_STATUS_STEP: Record<string, number> = {
  pending: 0,
  // Payment confirmation stays part of the order state, but shares the Received
  // step in the shorter customer-facing track.
  'payment-confirmed': 0,
  preparing: 1,
  ready: 2,
  // "Ready for delivery" - the shop published the order and a rider was requested.
  confirmed: RIDER_ASSIGNED_INDEX,
  'on-the-way': RIDER_ASSIGNED_INDEX,
  delivered: DELIVERED_INDEX,
};

/**
 * `ride_requests.driver_status` to a step.
 *
 * `dropped-off` is the rider app's name for arriving at the drop-off point, i.e.
 * the customer's address, and `awaiting-payment` is the same place a moment
 * later - both land on "Arrived".
 */
const RIDER_STATUS_STEP: Record<string, number> = {
  // A ride request exists but nobody has taken it yet.
  pending: RIDER_ASSIGNED_INDEX,
  assigned: RIDER_ASSIGNED_INDEX,
  accepted: RIDER_ASSIGNED_INDEX,
  'on-the-way': RIDER_ASSIGNED_INDEX,
  // Assignment, travel to the restaurant, and arrival there are one combined
  // step. The driver route still uses the raw status to switch destinations.
  arrived: RIDER_ASSIGNED_INDEX,
  // The rider app's `in-progress` predates the split into picked-up/dropped-off.
  'in-progress': RIDER_ASSIGNED_INDEX + 1,
  'picked-up': RIDER_ASSIGNED_INDEX + 1,
  'dropped-off': RIDER_ASSIGNED_INDEX + 2,
  'awaiting-payment': RIDER_ASSIGNED_INDEX + 2,
  completed: DELIVERED_INDEX,
};

function normalize(value?: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/_/g, '-');
}

/*
 * True while the rider is still travelling towards the restaurant, i.e. before the
 * order is in their hand. The delivery map tints its route line by this so "on
 * the way to the shop" and "carrying the food over" are told apart.
 *
 * Derived from the same rider-status table the track uses, rather than a second
 * hand-written list that would drift from it.
 */
export function isRiderHeadingToRestaurant(riderStatus?: string | null): boolean {
  const key = normalize(riderStatus);
  const index = RIDER_STATUS_STEP[key];
  if (index === undefined) return false;
  return index < RIDER_STATUS_STEP['picked-up'];
}

/**
 * Builds the track for one order.
 *
 * `driverStatus` is the live `ride_requests.driver_status` for the order, if the
 * caller has it; pass null/undefined when no rider has been assigned yet.
 */
export function getOrderProgress(input: {
  status?: string | null;
  driverStatus?: string | null;
  driverMessage?: string | null;
  deliveryMode?: string | null;
  driverLabel?: 'Rider' | 'Driver';
}): OrderProgress {
  const status = normalize(input.status);
  const riderStatus = normalize(input.driverStatus) || null;
  const driverLabel = input.driverLabel ?? 'Rider';
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
  const steps = isPickup
    ? PICKUP_STEPS
    : DELIVERY_STEPS.map((step) => {
        if (!step.isRiderStep || driverLabel === 'Rider') return step;
        return {
          ...step,
          label: step.label.replace(/rider/gi, driverLabel),
          title: step.title.replace(/rider/gi, driverLabel),
          description: step.description.replace(/rider/gi, driverLabel.toLowerCase()),
        };
      });
  const lastIndex = steps.length - 1;

  // The order status is a floor; the rider's status can only push it forward.
  let current = ORDER_STATUS_STEP[status] ?? 0;
  if (!isPickup && riderStatus && RIDER_STATUS_STEP[riderStatus] !== undefined) {
    current = Math.max(current, RIDER_STATUS_STEP[riderStatus]);
  }
  if (status === 'delivered') current = lastIndex;
  current = Math.min(Math.max(current, 0), lastIndex);

  const currentStep = steps[current];
  const hasRider = !isPickup;

  return {
    steps,
    current,
    currentStep,
    currentLabel: currentStep.label,
    currentTitle: currentStep.title,
    currentStepIsRiderStep: currentStep.isRiderStep && hasRider,
    riderHasStarted: hasRider && (
      current > RIDER_ASSIGNED_INDEX ||
      status === 'on-the-way' ||
      ['on-the-way', 'arrived', 'in-progress', 'picked-up', 'dropped-off', 'awaiting-payment', 'completed'].includes(riderStatus ?? '')
    ),
    hasRider,
    isCancelled: false,
    riderStatus,
    driverLabel,
    riderMessage,
  };
}
