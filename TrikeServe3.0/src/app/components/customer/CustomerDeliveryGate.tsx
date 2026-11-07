import type { ReactNode } from "react";
import { Link } from "react-router";

import { useDevModeOnlyFeature } from "../../hooks/useDevModeSettings";
import BottomNav from "../ui/BottomNav";

export default function CustomerDeliveryGate({ children }: { children: ReactNode }) {
  const foodDeliveryEnabled = useDevModeOnlyFeature("foodDelivery");
  if (foodDeliveryEnabled) return children;

  return (
    <>
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 pb-24">
        <section role="status" className="w-full max-w-md rounded-3xl border border-line bg-card p-6 text-center shadow-card">
          <h1 className="text-xl font-extrabold text-[var(--ink)]">Food delivery unavailable</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Food delivery is currently unavailable on the website.
          </p>
          <Link to="/customer" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white">
            Back to customer home
          </Link>
        </section>
      </main>
      <BottomNav variant="customer" />
    </>
  );
}
