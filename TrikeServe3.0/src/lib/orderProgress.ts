/**
 * The order progress track, in one place.
 *
 * Both sides of an order show a tracker, and each had its own copy: the
 * customer's had five steps and the business six, they disagreed about what
 * "Delivering" meant, and neither mentioned what the rider was actually doing.
 * A track that changes shape depending on who is looking at it cannot answer
 * "where is my order?", so the step list, the status mapping and the rendering
 * are shared instead.
 *
 * Two signals feed the track:
 *
 *   `orders.status`             the restaurant side - received, preparing, ready,
 *                               rider assigned
 *   `ride_requests.driver_status` the rider side - heading to the shop, at the
 *                               shop, order in hand, at the door, done
 *
 * The rider's status is the finer of the two, so it drives the second half of
 * the track while the order status only sets a floor. The two rows live in
 * different tables and are written by two devices, so they briefly disagree:
 * taking the furthest step forward and never back keeps the track monotonic, the
 * way a progress bar is expected to behave.
 *
 * Rider vocabulary note: the rider app writes `picked-up` / `dropped-off` /
 * `awaiting-payment` while its own UI says `pickup` / `drop-off` / `payment`,
 * and older rows use underscores. Everything is normalised here so callers can
 * pass whichever spelling they have.
 */

export type OrderStepKey =
  | 'received'
  | 'preparing'
  | 'ready'
  | 'rider-assigned'
  | 'to-restaurant'
  | 'at-restaurant'
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
  /** Whatever the rider app wrote in `driver_status_message`, shown verbatim. */
  riderMessage: string | null;
}

/** Delivery orders: the restaurant hands the food to a rider. */
const DELIVERY_STEPS: OrderProgressStep[] = [
  { key: 'received', label: 'Received', title: 'Order received', description: 'The restaurant has received your order.', isRiderStep: false },
  { key: 'preparing', label: 'Preparing', title: 'Preparing your order', description: 'The kitchen is preparing your order.', isRiderStep: false },
  { key: 'ready', label: 'Ready', title: 'Ready for pickup', description: 'Your order is packed and waiting to be collected.', isRiderStep: false },
  { key: 'rider-assigned', label: 'Rider Assigned', title: 'Rider assigned', description: 'A rider has been assigned to deliver your order.', isRiderStep: true },
  { key: 'to-restaurant', label: 'To Restaurant', title: 'Rider heading to the restaurant', description: 'Your rider is on the way to the restaurant.', isRiderStep: true },
  { key: 'at-restaurant', label: 'At Restaurant', title: 'Rider at the restaurant', description: 'Your rider has arrived and is collecting your order.', isRiderStep: true },
  { key: 'picked-up', label: 'Picked Up', title: 'Order picked up', description: 'Your rider has the order and is on the way to you.', isRiderStep: true },
  { key: 'arrived', label: 'Arrived', title: 'Rider at your address', description: 'Your rider has arrived and is waiting for payment.', isRiderStep: true },
  { key: 'delivered', label: 'Delivered', title: 'Order delivered', description: 'The order was delivered. Thanks for ordering!', isRiderStep: true },
];

/**
 * Pickup orders have no rider, so they get the same shape minus the rider leg.
 * Showing "Rider heading to the restaurant" on an order the customer is going to
 * collect themselves would be a lie told by the tracker.
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
 * `on-the-way` is written when the rider sets off towards the shop, but the
 * business screen also folds later rider phases into that one value, so it can
 * only be trusted as "the rider has left".
 */
const ORDER_STATUS_STEP: Record<string, number> = {
  pending: 0,
  preparing: 1,
  ready: 2,
  // "Ready for delivery" - the shop published the order and a rider was requested.
  confirmed: RIDER_ASSIGNED_INDEX,
  'on-the-way': RIDER_ASSIGNED_INDEX + 1,
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
  'on-the-way': RIDER_ASSIGNED_INDEX + 1,
  arrived: RIDER_ASSIGNED_INDEX + 2,
  // The rider app's `in-progress` predates the split into picked-up/dropped-off.
  'in-progress': RIDER_ASSIGNED_INDEX + 3,
  'picked-up': RIDER_ASSIGNED_INDEX + 3,
  'dropped-off': RIDER_ASSIGNED_INDEX + 4,
  'awaiting-payment': RIDER_ASSIGNED_INDEX + 4,
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
}): OrderProgress {
  const status = normalize(input.status);
  const riderStatus = normalize(input.driverStatus) || null;
  const riderMessage = input.driverMessage?.trim() || null;

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
      riderMessage,
    };
  }

  const isPickup = normalize(input.deliveryMode) === 'pickup';
  const steps = isPickup ? PICKUP_STEPS : DELIVERY_STEPS;
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
    riderHasStarted: hasRider && current > RIDER_ASSIGNED_INDEX,
    hasRider,
    isCancelled: false,
    riderStatus,
    riderMessage,
  };
}