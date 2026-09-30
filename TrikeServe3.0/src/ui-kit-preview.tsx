import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { Bike, MapPin, ShoppingBag, Star, TrendingUp, Users } from "lucide-react";

import "./styles/index.css";
import { AuthProvider } from "./app/contexts/AuthContext";
import { CartProvider } from "./app/contexts/CartContext";
import AppShell from "./app/components/ui/AppShell";
import AppHeader from "./app/components/ui/AppHeader";
import BottomNav from "./app/components/ui/BottomNav";
import ChoiceCard from "./app/components/ui/ChoiceCard";
import EmptyState from "./app/components/ui/EmptyState";
import MapCanvas from "./app/components/ui/MapCanvas";
import SectionHeading from "./app/components/ui/SectionHeading";
import AppSheet from "./app/components/ui/AppSheet";
import StatCard from "./app/components/ui/StatCard";
import { Button } from "./app/components/ui/button";

/**
 * Dev-only preview of the shared UI kit.
 *
 * Served by Vite at `/kit-preview.html` (it is not part of the production
 * build, which only bundles `index.html`). Use it to check the shell, header,
 * bottom navigation, sheet and card primitives in isolation before the role
 * screens adopt them.
 */
function KitPreview() {
  const [rideType, setRideType] = useState<"shared" | "private">("shared");
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <AppShell
      header={<AppHeader notificationCount={3} hint="Pumili ng serbisyo para magsimula." />}
      bottomNav={<BottomNav variant="customer" active="food" messagesBadge={2} />}
    >
      <SectionHeading
        eyebrow="Easy booking"
        title="Saan ka pupunta?"
        filipino="Pumili ng destinasyon, tapos ang klase ng sakay."
        action={
          <span className="rounded-full bg-mint-soft px-3 py-1 text-xs font-bold text-teal">
            Cash
          </span>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <ChoiceCard
          selected={rideType === "shared"}
          onSelect={() => setRideType("shared")}
          label="Shared ride"
          filipino="Sabay"
          description="Lower fare. Other passengers may ride with you."
          icon={Users}
          price="15"
          meta="4-7 min wait"
        />
        <ChoiceCard
          selected={rideType === "private"}
          onSelect={() => setRideType("private")}
          label="Private ride"
          filipino="Pribado"
          description="A direct ride reserved just for you."
          icon={Bike}
          price="50"
          meta="2-4 min wait"
        />
      </div>

      <Button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="mt-4 min-h-14 w-full rounded-2xl bg-primary text-base font-bold text-primary-foreground hover:bg-primary/90"
      >
        Review booking
      </Button>

      <SectionHeading
        eyebrow="Live map"
        title="Pickup and route"
        filipino="Makikita mo rito ang pickup at daan."
        as="h3"
        className="mt-8"
      />
      <MapCanvas
        label="Map showing the Gen. T. de Leon terminal and nearby streets"
        center={{ lat: 14.7294, lng: 120.9349 }}
        overlay={
          <div className="rounded-2xl border border-line bg-surface p-3 shadow-card">
            <p className="text-xs font-semibold text-muted-foreground">
              Pickup
            </p>
            <p className="font-bold text-ink">Gen. T. de Leon Terminal</p>
          </div>
        }
      />

      <SectionHeading
        eyebrow="Today"
        title="Quick numbers"
        filipino="Mabilisang tingin sa araw mo."
        as="h3"
        className="mt-8"
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon={TrendingUp} label="Trips today" value="12" meta="+8% vs yesterday" tone="ink" />
        <StatCard icon={ShoppingBag} label="Orders" value="18" meta="3 waiting" />
        <StatCard icon={Star} label="Rating" value="4.8" meta="Community score" tone="mint" />
      </div>

      <SectionHeading
        eyebrow="Nothing here yet"
        title="Empty states"
        as="h3"
        className="mt-8"
      />
      <EmptyState
        icon={MapPin}
        title="No nearby drivers yet"
        description="Try again in a moment or choose another terminal."
        filipino="Wala pang driver sa malapit."
        action={
          <Button
            type="button"
            className="min-h-12 rounded-2xl bg-ink px-6 font-bold text-white hover:bg-teal"
          >
            Refresh
          </Button>
        }
      />

      <AppSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        eyebrow="Review your ride"
        title="Tama ba ang detalye?"
        description="Check the pickup, destination and fare before booking."
        actions={
          <>
            <Button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="min-h-14 w-full rounded-2xl bg-primary text-base font-bold text-primary-foreground hover:bg-primary/90"
            >
              Confirm booking / I-book na
            </Button>
            <Button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="min-h-12 w-full rounded-2xl bg-soft font-bold text-muted-foreground hover:bg-line"
            >
              Go back and edit
            </Button>
          </>
        }
      >
        <div className="rounded-2xl bg-soft p-4">
          <p className="text-xs font-semibold text-muted-foreground">Pickup</p>
          <p className="font-bold text-ink">Gen. T. de Leon Terminal</p>
          <div className="my-3 ml-3 h-5 border-l-2 border-dashed border-line" />
          <p className="text-xs font-semibold text-muted-foreground">
            Destination
          </p>
          <p className="font-bold text-ink">Gen. T. de Leon Market</p>
        </div>
      </AppSheet>
    </AppShell>
  );
}

export default function KitPreviewRoot() {
  return (
    <MemoryRouter>
      <AuthProvider>
        <CartProvider>
          <KitPreview />
        </CartProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

createRoot(document.getElementById("root")!).render(<KitPreviewRoot />);
