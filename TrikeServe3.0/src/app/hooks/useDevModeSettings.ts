import { useCallback, useEffect, useState } from "react";
import {
  isDevModeEnabled,
  isDevModeFeatureEnabled,
  setDevModeEnabled,
  setDevModeFeatureEnabled,
  subscribeToDevModeChanges,
  type DevModeFeature,
} from "../../lib/devMode";

export type WebsiteFeature = "customerRideBooking" | "driverQueueJoining" | "driverFoodDelivery";

const customerRideBookingFlag = import.meta.env.VITE_ENABLE_WEB_RIDE_SERVICES;

export function useDevModeStatus(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(isDevModeEnabled);

  useEffect(() => {
    const sync = () => setEnabled(isDevModeEnabled());
    return subscribeToDevModeChanges(sync);
  }, []);

  const update = useCallback((next: boolean) => {
    setDevModeEnabled(next);
    setEnabled(next);
  }, []);

  return [enabled, update];
}

export function useDevModeFeature(feature: DevModeFeature): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(() => isDevModeFeatureEnabled(feature));

  useEffect(() => {
    const sync = () => setEnabled(isDevModeFeatureEnabled(feature));
    return subscribeToDevModeChanges(sync);
  }, [feature]);

  const update = useCallback((next: boolean) => {
    setDevModeFeatureEnabled(feature, next);
    setEnabled(next);
  }, [feature]);

  return [enabled, update];
}

/** Dev-only overrides fall back to the product requirement whenever Dev Mode is off. */
export function useDevModeOverride(feature: DevModeFeature): [boolean, (enabled: boolean) => void] {
  const [devModeEnabled] = useDevModeStatus();
  const [featureEnabled, updateFeature] = useDevModeFeature(feature);
  return [!devModeEnabled || featureEnabled, updateFeature];
}

/** Customer rides retain a build flag; drivers can use queue and delivery services on the website. */
export function isWebsiteFeatureEnabled(feature: WebsiteFeature): boolean {
  if (feature === "customerRideBooking") {
    return customerRideBookingFlag?.trim().toLowerCase() !== "false";
  }

  return true;
}

/** A local developer override that applies only while Developer Mode is enabled. */
export function useDevModeActiveFeature(feature: DevModeFeature): boolean {
  const [devModeEnabled] = useDevModeStatus();
  const [featureEnabled] = useDevModeFeature(feature);
  return devModeEnabled && featureEnabled;
}
