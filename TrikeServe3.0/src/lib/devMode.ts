const DEV_MODE_KEY = "trikeserve_dev_mode";
const DEV_MODE_CHANGE_EVENT = "trikeserve:dev-mode-change";

export type DevModeFeature = "quickAccess" | "testDataTools" | "enforceBoundary" | "imageProofRequired" | "sameRouteLobbyFilter";

const FEATURE_KEYS: Record<DevModeFeature, string> = {
  quickAccess: "trikeserve_dev_quick_access",
  testDataTools: "trikeserve_dev_test_data_tools",
  enforceBoundary: "trikeserve_dev_enforce_boundary",
  imageProofRequired: "trikeserve_dev_image_proof_required",
  sameRouteLobbyFilter: "trikeserve_dev_same_route_lobby_filter",
};

function notifyDevModeChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DEV_MODE_CHANGE_EVENT));
}

export function subscribeToDevModeChanges(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  window.addEventListener(DEV_MODE_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DEV_MODE_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function isDevModeFeatureEnabled(feature: DevModeFeature): boolean {
  if (typeof window === "undefined") return true;
  try {
    const value = window.localStorage.getItem(FEATURE_KEYS[feature]);
    return value === null ? true : value === "true";
  } catch {
    return true;
  }
}

export function setDevModeFeatureEnabled(feature: DevModeFeature, enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FEATURE_KEYS[feature], String(enabled));
  } catch {
    // The setting still applies in this tab when storage is unavailable.
  }
  notifyDevModeChange();
}

export function isDevModeEnabled(): boolean {
  if (typeof window === "undefined") return false;

  try {
    if (window.localStorage.getItem(DEV_MODE_KEY) === "true") return true;
  } catch {
    // Fall back to the current tab if persistent storage is unavailable.
  }

  try {
    const wasEnabledForThisTab = window.sessionStorage.getItem(DEV_MODE_KEY) === "true";
    if (wasEnabledForThisTab) setDevModeEnabled(true);
    return wasEnabledForThisTab;
  } catch {
    return false;
  }
}

export function setDevModeEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;

  let persisted = false;
  try {
    if (enabled) window.localStorage.setItem(DEV_MODE_KEY, "true");
    else window.localStorage.removeItem(DEV_MODE_KEY);
    persisted = true;
  } catch {
    // Fall back to the current tab if persistent storage is unavailable.
  }

  try {
    if (enabled && !persisted) window.sessionStorage.setItem(DEV_MODE_KEY, "true");
    else window.sessionStorage.removeItem(DEV_MODE_KEY);
  } catch {
    // Storage may be unavailable in restricted browser contexts.
  }

  notifyDevModeChange();
}
