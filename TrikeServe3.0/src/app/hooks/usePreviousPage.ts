import { useCallback } from "react";
import { useNavigate } from "react-router";

/**
 * Back, meaning "the page I came from".
 *
 * `navigate(-1)` on its own is wrong for a screen that can be opened cold: a
 * deep link or a fresh tab has exactly one history entry, so the pop walks the
 * customer out of the app and off the site. The guard usually written for that,
 * `window.history.length > 1`, is worse -- `history.length` counts entries from
 * before the app ever loaded, so it cheerfully reports a poppable history on a
 * cold load and then pops to wherever the browser thinks it was.
 *
 * React Router tracks how deep the current entry sits in `history.state.idx`
 * and resets it to 0 on the first entry of a fresh load. That is the honest
 * answer to "is there anywhere to go back to", so this pops when there is and
 * falls through to `fallback` when there is not.
 */
export function usePreviousPage(fallback: string): () => void {
  const navigate = useNavigate();

  return useCallback(() => {
    const idx = window.history.state?.idx;
    if (typeof idx === "number" && idx > 0) {
      navigate(-1);
      return;
    }
    navigate(fallback);
  }, [navigate, fallback]);
}
