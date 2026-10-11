import { useEffect, useState } from "react";

/**
 * Page numbers for a long list, shared by every screen that paginates.
 *
 * Lives here rather than inside one of its two users (the shop's order list and
 * the admin audit trail) because the failure mode of two copies is not that one
 * of them breaks -- it is that they drift, and someone later wonders why jumping
 * to page 40 works on one screen and not the other.
 */

/** A run of skipped pages, drawn as an ellipsis rather than a button. */
const PAGE_GAP = -1;

/**
 * Which page numbers to draw, and where the gaps go.
 *
 * First and last are always shown, plus the current page and two either side of
 * it. Two rather than one because being able to see page 50 in a window of 48-52
 * is what tells someone they are deep in the list; a window of 49-51 in a list of
 * 99 says the same thing with less to look at.
 *
 * A gap of exactly one page is drawn as that page instead of an ellipsis. "1 2 3 …
 * 5" is strictly worse than "1 2 3 4 5" -- it spends the same room hiding a single
 * number that was perfectly well able to fit.
 */
function pageWindow(current: number, pageCount: number): number[] {
  // Seven or fewer is small enough to just list.
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);

  const kept = new Set<number>([1, pageCount]);
  for (let p = current - 2; p <= current + 2; p++) {
    if (p >= 1 && p <= pageCount) kept.add(p);
  }

  const sorted = [...kept].sort((a, b) => a - b);
  const out: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const jump = sorted[i] - sorted[i - 1];
      if (jump === 2) out.push(sorted[i] - 1);
      else if (jump > 2) out.push(PAGE_GAP);
    }
    out.push(sorted[i]);
  }

  return out;
}

export type ListPaginationProps = {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  /**
   * Names this list in the landmarks and the jump box, so two paginated lists on
   * one screen do not announce as the same one.
   */
  label: string;
};

/**
 * Page controls for a long list.
 *
 * Renders nothing at all when there is a single page, so a short list is never
 * shown furniture for a problem it does not have.
 *
 * The four arrows are the ones a reader will actually reach for on a long list:
 * first, previous, next, last. Numbered pages cover the middle, because someone
 * looking at ninety pages is usually looking for one they have seen before rather
 * than the one after the current.
 *
 * The jump box is there for the same reason. When someone knows the row is on page
 * 60, walking there 60 times is not a reasonable thing to ask of them, and they
 * should not have to know it is on page 60 in order to ask.
 */
export default function ListPagination({ page, pageCount, onChange, label }: ListPaginationProps) {
  /*
   * The typed page. Kept as a string because an <input> mid-edit is allowed to be
   * nonsense -- "1" on the way to "19" -- and clamping on every keystroke would
   * fight the person typing. It is only interpreted when they commit it.
   */
  const [draft, setDraft] = useState(String(page));

  // Follow the page when it moves for a reason other than typing.
  useEffect(() => setDraft(String(page)), [page]);

  // Declared before the early return below; hooks cannot be conditional.
  const pages = pageWindow(page, pageCount);

  if (pageCount <= 1) return null;

  const go = (next: number) => {
    // A jump past either end lands on the end rather than on nothing.
    onChange(Math.min(Math.max(next, 1), pageCount));
  };

  const commitDraft = () => {
    const wanted = Number.parseInt(draft, 10);
    if (Number.isFinite(wanted)) go(wanted);
  };

  const jumpId = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-page-jump`;

  const arrow =
    "grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-sm font-bold text-[var(--ink)] transition-colors hover:bg-[var(--muted)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent";
  const numberButton =
    "grid h-8 min-w-8 shrink-0 place-items-center rounded-lg px-1.5 text-xs font-bold tabular-nums transition-colors";

  return (
    <nav
      aria-label={`${label} pages`}
      className="flex flex-wrap items-center justify-center gap-1 pt-2 pb-1"
    >
      <button type="button" onClick={() => go(1)} disabled={page === 1}
        aria-label="First page" className={arrow}>
        <span aria-hidden="true">«</span>
      </button>

      <button type="button" onClick={() => go(page - 1)} disabled={page === 1}
        aria-label="Previous page" className={arrow}>
        <span aria-hidden="true">‹</span>
      </button>

      {pages.map((p, i) =>
        p === PAGE_GAP ? (
          <span
            key={`gap-${i}`}
            aria-hidden="true"
            className="grid h-8 w-6 shrink-0 place-items-center text-xs text-[var(--muted-foreground)]"
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => go(p)}
            aria-current={p === page ? "page" : undefined}
            aria-label={`Page ${p}`}
            className={`${numberButton} ${
              p === page
                ? "bg-[var(--primary)] text-white"
                : "border border-line text-[var(--ink)] hover:bg-[var(--muted)]"
            }`}
          >
            {p}
          </button>
        ),
      )}

      <button type="button" onClick={() => go(page + 1)} disabled={page === pageCount}
        aria-label="Next page" className={arrow}>
        <span aria-hidden="true">›</span>
      </button>

      <button type="button" onClick={() => go(pageCount)} disabled={page === pageCount}
        aria-label="Last page" className={arrow}>
        <span aria-hidden="true">»</span>
      </button>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          commitDraft();
        }}
        className="ml-1 flex shrink-0 items-center gap-1.5"
      >
        <label htmlFor={jumpId} className="text-xs text-[var(--muted-foreground)]">
          Go to
        </label>
        <input
          id={jumpId}
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
          className="h-8 w-12 rounded-lg border border-line bg-surface px-2 text-center text-xs font-bold tabular-nums text-[var(--ink)] focus:border-[var(--primary)] focus:outline-none"
        />
      </form>
    </nav>
  );
}