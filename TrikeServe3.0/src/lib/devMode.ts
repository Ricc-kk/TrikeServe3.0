const DEV_MODE_KEY = "trikeserve_dev_mode";

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
}
