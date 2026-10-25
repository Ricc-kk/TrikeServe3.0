import { CarTaxiFront } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../../contexts/AuthContext";
import { useActiveRideContext } from "../../../lib/rideLock";

const CUSTOMER_RIDE_PAGES = new Set([
  "/customer",
  "/customer/book-ride",
  "/customer/active-private-ride",
  "/customer/active-share-ride",
]);

/** Keep a small way back to the private ride map while the customer visits other pages. */
export default function CustomerPrivateRideShortcut() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { privateRide, lobby, checked } = useActiveRideContext(
    user?.role === "customer" ? user.id : null,
  );

  const currentPath = location.pathname.replace(/\/+$/, "") || "/";
  const rideType = String(privateRide?.ride_type || "").trim().toLowerCase();
  const isPrivateRide = Boolean(
    privateRide &&
      !lobby &&
      !["delivery", "shared", "share", "shared_ride"].includes(rideType),
  );
  const isCustomerPage = currentPath === "/customer" || currentPath.startsWith("/customer/");

  if (
    user?.role !== "customer" ||
    !isCustomerPage ||
    CUSTOMER_RIDE_PAGES.has(currentPath) ||
    !checked ||
    !isPrivateRide
  ) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => navigate("/customer/active-private-ride")}
      aria-label="Return to your private ride"
      title="Return to your private ride"
      className="fixed bottom-24 right-4 z-[1800] grid size-16 place-items-center rounded-full bg-[var(--primary)] text-white shadow-2xl transition-transform hover:scale-110 active:scale-95"
    >
      <span className="relative grid size-full place-items-center rounded-full">
        <span className="absolute inset-0 animate-ping rounded-full bg-[var(--primary)] opacity-20" aria-hidden="true" />
        <CarTaxiFront className="relative size-8" aria-hidden="true" />
      </span>
    </button>
  );
}
