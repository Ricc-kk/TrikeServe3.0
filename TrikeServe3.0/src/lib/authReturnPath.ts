const AUTH_RETURN_TO_KEY = 'trikeserve_auth_return_to';

const AUTH_ENTRY_PATHS = new Set([
  '/',
  '/signup',
  '/forgot-password',
  '/verify-email',
  '/set-password',
  '/session-notice',
  '/redirect',
]);

function isReturnPath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return false;
  const pathname = path.split(/[?#]/, 1)[0];
  return !AUTH_ENTRY_PATHS.has(pathname);
}

export function rememberAuthReturnPath(pathname: string, search = '', hash = ''): void {
  const path = `${pathname}${search}${hash}`;
  if (!isReturnPath(path)) return;

  try {
    window.sessionStorage.setItem(AUTH_RETURN_TO_KEY, path);
  } catch {
    // The login redirect can still fall back to the role's home page.
  }
}

export function consumeAuthReturnPath(): string | null {
  try {
    const path = window.sessionStorage.getItem(AUTH_RETURN_TO_KEY);
    window.sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
    return path && isReturnPath(path) ? path : null;
  } catch {
    return null;
  }
}
