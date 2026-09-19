import { supabase } from "./supabase";

/**
 * Helpers for handling Supabase auth callback links (password recovery and
 * signup confirmation).
 *
 * The problem these solve:
 * Supabase email links carry their tokens in the URL, and supabase-js picks
 * them up automatically (`detectSessionInUrl` defaults to `true`). As soon as
 * it has stored the session it does `window.location.hash = ''` to clean the
 * URL. That work starts while this app's module graph is still being evaluated
 * — i.e. before React renders — so reading the URL from inside a `useEffect`
 * usually finds it already emptied and concludes the link was invalid.
 *
 * So we snapshot the URL here, synchronously, at module evaluation time.
 */
const initialHref = typeof window !== "undefined" ? window.location.href : "";

const hashIndex = initialHref.indexOf("#");
const queryIndex = initialHref.indexOf("?");

const HASH_PARAMS = new URLSearchParams(hashIndex >= 0 ? initialHref.slice(hashIndex + 1) : "");

const QUERY_PARAMS = new URLSearchParams(
  queryIndex >= 0 ? initialHref.slice(queryIndex + 1).split("#")[0] : ""
);

/** Which kind of auth callback (if any) this page load came from. */
export type AuthLinkKind = "recovery" | "signup" | "other" | "none";

export type AuthLinkParams = {
  kind: AuthLinkKind;
  /** The raw `type` query/hash parameter, if present. */
  type: string | null;
  /** `#access_token=...` — implicit flow (Supabase's default email template). */
  accessToken: string | null;
  /** `?token_hash=...` — used by templates that pass `{{ .TokenHash }}`. */
  tokenHash: string | null;
  /** `?code=...` — PKCE flow. */
  code: string | null;
  /** True when the URL carried something that looks like an auth token. */
  hasToken: boolean;
};

export function getAuthLinkParams(): AuthLinkParams {
  const type = HASH_PARAMS.get("type") || QUERY_PARAMS.get("type");
  const accessToken = HASH_PARAMS.get("access_token");
  const tokenHash = QUERY_PARAMS.get("token_hash");
  const code = QUERY_PARAMS.get("code");

  const kind: AuthLinkKind =
    type === "recovery" ? "recovery" : type === "signup" ? "signup" : type ? "other" : "none";

  return {
    kind,
    type,
    accessToken,
    tokenHash,
    code,
    hasToken: Boolean(tokenHash || code || accessToken),
  };
}

/**
 * Waits for the session supabase-js establishes from the URL.
 *
 * For the implicit flow there is nothing to exchange — the client has already
 * stored the session — but there is a short window before it finishes, so poll
 * rather than reading once and reporting a dead link.
 */
export async function waitForSession(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return null;
}
