import { Capacitor, registerPlugin } from "@capacitor/core";

export type LocationPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "prompt-with-rationale";

export interface LocationServicesPlugin {
  /** Current runtime permission state for location access. */
  checkPermission(): Promise<{ location: LocationPermissionState }>;
  /** Shows the native runtime permission dialog (no-op if already granted). */
  requestPermission(): Promise<{ location: LocationPermissionState }>;
  /** Whether the device's GPS / location toggle is currently switched on. */
  isLocationEnabled(): Promise<{ enabled: boolean }>;
  /** Opens the Android system "Location" settings screen (for GPS being off). */
  openLocationSettings(): Promise<void>;
  /** Opens this app's Android settings screen (for a denied/blocked permission). */
  openAppSettings(): Promise<void>;
}

/**
 * Native plugin defined in `android/app/src/main/java/com/trikeserve/app/LocationServicesPlugin.java`.
 * Only usable on a native (Android/iOS) build — guard calls with `isNativeLocationSupported()`.
 */
export const LocationServices = registerPlugin<LocationServicesPlugin>("LocationServices");

export const isNativeLocationSupported = () => Capacitor.isNativePlatform();
