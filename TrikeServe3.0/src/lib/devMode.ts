const DEV_MODE_SESSION_KEY = "trikeserve_dev_mode";

export function isDevModeEnabled(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return window.sessionStorage.getItem(DEV_MODE_SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

export function setDevModeEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;

  try {
    if (enabled) {
      window.sessionStorage.setItem(DEV_MODE_SESSION_KEY, "true");
    } else {
      window.sessionStorage.removeItem(DEV_MODE_SESSION_KEY);
    }
  } catch {
    // Dev mode still works for the current page if session storage is unavailable.
  }
}
