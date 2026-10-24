import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, MapPin } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../../contexts/AuthContext";
import { useActiveRideContext, customerActiveShareLobbyStorageKey, isCustomerLobbyPassenger } from "../../../lib/rideLock";
import { supabaseHelpers } from "@/lib/supabase";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import ShareRideLobby from "./ShareRideLobby";

type MapPoint = { lat: number; lng: number } | null;

interface ShareRideBookingSeed {
  pickup: string;
  pickupAddress: string;
  dropoff: string;
  dropoffAddress: string;
  pickupCoords?: MapPoint;
  dropoffCoords?: MapPoint;
  passengerCount?: number;
  maxPassengersAllowed?: number;
  pricePerSeat?: number;
  paymentMethod?: 'COD';
  selectedTerminalId?: string | null;
  selectedRouteId?: string | null;
  routePoints?: Array<{ lat: number; lng: number }> | null;
  routeWidthM?: number | null;
}

interface ActiveShareRideRouteState {
  lobbyId?: string;
  booking?: ShareRideBookingSeed;
}

function parsePassengers(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapPoint(latValue: unknown, lngValue: unknown): MapPoint {
  if (latValue == null || lngValue == null) return null;
  const lat = Number(latValue);
  const lng = Number(lngValue);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export default function ActiveShareRidePage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = location.state as ActiveShareRideRouteState | null;
  const booking = routeState?.booking || null;
  const { lobby: liveLobby, checked: rideContextChecked } = useActiveRideContext(user?.id);
  const [lobbyId, setLobbyId] = useState<string | null>(routeState?.lobbyId || null);
  const [routeResolved, setRouteResolved] = useState(false);
  const [lobbyLoading, setLobbyLoading] = useState(false);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [lobby, setLobby] = useState<any>(null);

  useEffect(() => {
    if (!user?.id) return;

    let storedLobbyId: string | null = null;
    try {
      storedLobbyId = localStorage.getItem(customerActiveShareLobbyStorageKey(user.id));
    } catch {
      // The active ride context below still works when storage is unavailable.
    }

    const resolvedLobbyId = routeState?.lobbyId || storedLobbyId || liveLobby?.id || null;
    if (resolvedLobbyId) {
      setLobbyId(resolvedLobbyId);
      setRouteResolved(true);
      return;
    }

    if (booking || rideContextChecked) {
      setLobbyId(null);
      setRouteResolved(true);
    }
  }, [user?.id, routeState?.lobbyId, booking, liveLobby?.id, rideContextChecked, location.key]);

  useEffect(() => {
    if (!user?.id || !lobbyId) {
      setLobby(null);
      setLobbyLoading(false);
      setLobbyError(null);
      return;
    }

    let active = true;
    setLobbyLoading(true);
    setLobbyError(null);
    supabaseHelpers.getLobbyById(lobbyId).then(({ data, error }) => {
      if (!active) return;
      if (error || !data) {
        setLobbyError('This share ride is no longer available.');
        setLobby(null);
        return;
      }
      if (!isCustomerLobbyPassenger(data, user.id)) {
        setLobbyError('This share ride is not linked to your account.');
        setLobby(null);
        return;
      }
      setLobby(data);
    }).catch(() => {
      if (active) {
        setLobbyError('Unable to load this share ride. Check your connection and try again.');
        setLobby(null);
      }
    }).finally(() => {
      if (active) setLobbyLoading(false);
    });

    return () => {
      active = false;
    };
  }, [user?.id, lobbyId]);

  const lobbyDetails = useMemo(() => {
    const passengers = parsePassengers(lobby?.passengers_json);
    const ownPassengers = user?.id
      ? passengers.filter((passenger) => passenger?.id === user.id || String(passenger?.id || '').startsWith(`${user.id}_companion_`))
      : [];
    const ownPassenger = ownPassengers.find((passenger) => passenger.id === user?.id) || ownPassengers[0];

    return {
      ownPassenger,
      passengerCount: ownPassengers.length || 1,
      pickupCoords: mapPoint(lobby?.pickup_lat, lobby?.pickup_lng),
      dropoffCoords: mapPoint(
        ownPassenger?.dropoffLat ?? lobby?.dropoff_lat,
        ownPassenger?.dropoffLng ?? lobby?.dropoff_lng,
      ),
    };
  }, [lobby, user?.id]);

  const returnToCustomerHome = (status?: string) => {
    if ((status === 'completed' || status === 'cancelled') && user?.id) {
      try {
        localStorage.removeItem(customerActiveShareLobbyStorageKey(user.id));
      } catch {
        // The completed/cancelled lobby is still handled by its database state.
      }
    }
    navigate('/customer', { replace: true, state: { customerHomeTab: true } });
  };

  const goBack = () => returnToCustomerHome();

  if (!user?.id || !routeResolved || lobbyLoading || (lobbyId && !lobby && !lobbyError)) {
    return (
      <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[var(--background)] p-6">
        <div className="text-center">
          <LoaderCircle className="mx-auto mb-3 size-9 animate-spin text-[var(--primary)]" aria-hidden="true" />
          <p className="text-sm font-medium text-[var(--muted-foreground)]">Opening your share ride…</p>
        </div>
      </div>
    );
  }

  if (lobbyError) {
    return (
      <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[var(--background)] p-4">
        <Card className="w-full max-w-sm p-6 text-center">
          <h1 className="mb-2 text-lg font-bold text-[var(--ink)]">Share ride unavailable</h1>
          <p className="mb-5 text-sm text-[var(--muted-foreground)]">{lobbyError}</p>
          <Button onClick={goBack} className="w-full bg-[var(--primary)] text-white">
            Back to rides
          </Button>
        </Card>
      </div>
    );
  }

  if (!lobbyId && !booking) {
    return (
      <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[var(--background)] p-4">
        <Card className="w-full max-w-sm p-6 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
            <MapPin className="size-7" aria-hidden="true" />
          </div>
          <h1 className="mb-2 text-lg font-bold text-[var(--ink)]">No active share ride</h1>
          <p className="mb-5 text-sm text-[var(--muted-foreground)]">
            Your active share ride will appear here after you join or book a lobby.
          </p>
          <Button onClick={goBack} className="w-full bg-[var(--primary)] text-white">
            Back to rides
          </Button>
        </Card>
      </div>
    );
  }

  const saveLobbyId = (id: string) => {
    if (!user?.id) return;
    try {
      localStorage.setItem(customerActiveShareLobbyStorageKey(user.id), id);
    } catch {
      // The lobby remains open for this page even if its resume hint cannot be stored.
    }
  };

  const handleLobbyMoved = (id: string) => {
    saveLobbyId(id);
    setLobbyId(id);
    navigate(location.pathname, { replace: true, state: { lobbyId: id } });
  };

  return (
    <ShareRideLobby
      lobbyId={lobbyId || undefined}
      presentation="page"
      pickup={booking?.pickup || lobby?.pickup_location || ''}
      pickupAddress={booking?.pickupAddress || lobby?.pickup_address || ''}
      dropoff={booking?.dropoff || lobbyDetails.ownPassenger?.dropoff || lobby?.dropoff_location || ''}
      dropoffAddress={booking?.dropoffAddress || lobbyDetails.ownPassenger?.dropoffAddress || lobby?.dropoff_address || ''}
      pickupCoords={booking?.pickupCoords ?? lobbyDetails.pickupCoords}
      dropoffCoords={booking?.dropoffCoords ?? lobbyDetails.dropoffCoords}
      passengerCount={booking?.passengerCount ?? lobbyDetails.passengerCount}
      maxPassengersAllowed={booking?.maxPassengersAllowed ?? lobby?.max_seats}
      pricePerSeat={booking?.pricePerSeat ?? lobby?.price_per_seat}
      paymentMethod={booking?.paymentMethod ?? lobby?.payment_method ?? 'COD'}
      selectedTerminalId={booking?.selectedTerminalId ?? lobby?.terminal_id ?? null}
      selectedRouteId={booking?.selectedRouteId ?? lobbyDetails.ownPassenger?.route_id ?? null}
      routePoints={booking?.routePoints ?? null}
      routeWidthM={booking?.routeWidthM ?? null}
      onLobbyLoaded={saveLobbyId}
      onDriverFound={saveLobbyId}
      onLobbyMoved={handleLobbyMoved}
      onClose={returnToCustomerHome}
    />
  );
}
