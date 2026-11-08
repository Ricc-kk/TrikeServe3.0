import { useCallback, useEffect, useState } from "react";
import {
  isDevModeEnabled,
  isDevModeFeatureEnabled,
  setDevModeEnabled,
  setDevModeFeatureEnabled,
  subscribeToDevModeChanges,
  type DevModeFeature,
} from "../../lib/devMode";

const webRideServicesEnabled =
  import.meta.env.VITE_ENABLE_WEB_RIDE_SERVICES?.trim().toLowerCase() === "true";
const webDriverQueueJoiningEnabled =
  import.meta.env.VITE_ENABLE_WEB_DRIVER_QUEUE_JOINING?.trim().toLowerCase() === "true";
const webDriverFoodDeliveryEnabled =
  import.meta.env.VITE_ENABLE_WEB_DRIVER_FOOD_DELIVERY?.trim().toLowerCase() === "true";

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

/** Website feature flags are the normal setting; Dev Mode provides a local override. */
export function useDevModeOnlyFeature(feature: DevModeFeature): boolean {
  const [devModeEnabled] = useDevModeStatus();
  const [featureEnabled] = useDevModeFeature(feature);
  const canEnableFromWebsiteEnv =
    (feature === "customerRideBooking" && webRideServicesEnabled) ||
    (feature === "driverQueueJoining" && webDriverQueueJoiningEnabled) ||
    (feature === "driverFoodDelivery" && webDriverFoodDeliveryEnabled);
  const isWebsiteFeature = feature === "customerRideBooking" ||
    feature === "driverQueueJoining" || feature === "driverFoodDelivery";

  if (isWebsiteFeature) {
    // Keep deployed website defaults outside Dev Mode, but let the developer
    // switches override those defaults in any build.
    return devModeEnabled ? featureEnabled : canEnableFromWebsiteEnv;
  }

  return !devModeEnabled || featureEnabled;
}

/** A local developer override that applies only while Developer Mode is enabled. */
export function useDevModeActiveFeature(feature: DevModeFeature): boolean {
  const [devModeEnabled] = useDevModeStatus();
  const [featureEnabled] = useDevModeFeature(feature);
  return devModeEnabled && featureEnabled;
}
