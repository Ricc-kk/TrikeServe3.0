import type { ReactNode } from "react";

import { cn } from "./utils";

type AppShellProps = {
  /** Role header, usually `<AppHeader />`. */
  header?: ReactNode;
  /** Persistent role navigation, usually `<BottomNav />`. */
  bottomNav?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Shared app shell for every role.
 *
 * Renders the warm canvas with an ambient backdrop and centers a single-column
 * surface panel. On phones it fills the viewport; from `md` up it becomes a
 * restrained rounded panel floating on the canvas, matching the redesign
 * reference. Bottom padding always clears the fixed bottom navigation.
 */
export default function AppShell({
  header,
  bottomNav,
  children,
  className,
}: AppShellProps) {
  return (
    <div className="relative min-h-screen bg-canvas text-foreground">
      <div
        className="ambient-bg pointer-events-none fixed inset-0"
        aria-hidden="true"
      />
      <main
        className={cn(
          "relative mx-auto flex min-h-screen w-full max-w-3xl flex-col bg-surface shadow-app",
          "md:my-8 md:min-h-[calc(100vh-4rem)] md:overflow-hidden md:rounded-3xl",
          bottomNav ? "pb-24 md:pb-28" : "pb-6",
          className,
        )}
      >
        {header}
        <div className="flex-1 px-4 py-6 sm:px-7">{children}</div>
      </main>
      {bottomNav}
    </div>
  );
}
