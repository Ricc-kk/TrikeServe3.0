import { useState } from "react";
import { GoogleMap, MarkerF } from "@react-google-maps/api";
import { ChevronLeft, Loader2, Pencil } from "lucide-react";
import { useLocation, useNavigate } from "react-router";

import useMapLoader from "@/lib/mapLoader";
import { describeAddressSaveError } from "@/lib/addressErrors";
import type { LatLng } from "@/lib/distance";

import { useDeliveryAddress } from "../../contexts/useDeliveryAddress";
import {
  FALLBACK_CENTER,
  clearAddressDraft,
  hasPin,
  readAddressDraft,
  streetOf,
  type AddressDraft,
} from "./addressFlowState";

/**
 * Name the chosen pin and keep it.
 *
 * Split from the map on purpose. The map is where you decide *where*; this is
 * where you say *what to call it*, and that is a different kind of task — it
 * needs two text fields and a stable save button, which on a map screen would
 * sit under a draggable sheet and move around while being typed into.
 *
 * Both fields are prefilled and both are editable. The name is pre-filled with
 * the street so "Save address" is reachable immediately — making someone type a
 * name they have already been shown is friction, not confirmation. The address
 * stays editable because the reverse geocoder is occasionally a block out, and
 * the customer knows better than it does.
 */
export default function SaveAddressPage() {
  const navigate = useNavigate();
  const routeState = useLocation().state as { draft?: AddressDraft } | null;
  const delivery = useDeliveryAddress();

  const incoming = routeState?.draft ?? readAddressDraft();

  const [name, setName] = useState(() =>
    incoming.address ? streetOf(incoming.address) : "",
  );
  const [address, setAddress] = useState(() => incoming.address ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isLoaded: isMapsLoaded, loadError, blocked, apiKeyPresent } = useMapLoader();
  const mapUnavailable = !apiKeyPresent || Boolean(loadError) || Boolean(blocked);

  const pin = hasPin(incoming);
  const center: LatLng = pin
    ? { lat: incoming.latitude as number, lng: incoming.longitude as number }
    : FALLBACK_CENTER;

  const canSave = name.trim().length > 0 && address.trim().length > 0 && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const result = await delivery.saveAddress({
        label: name.trim(),
        address: address.trim(),
        latitude: incoming.latitude,
        longitude: incoming.longitude,
      });

      // `saveAddress` reports failures in its return value rather than throwing.
      // Ignoring that is how a failed write ends up looking like a success with
      // the customer sent back to a list that does not contain their address.
      if (result?.error) throw result.error;

      clearAddressDraft();
      navigate("/customer/delivery-address");
    } catch (err) {
      // The reason, not just the fact. A bare "could not save" left the
      // customer unable to tell a retryable network blip from an expired
      // session, so they retried into the same failure.
      setError(describeAddressSaveError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-line bg-[var(--surface)] px-3 py-3 sm:px-5">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/customer/delivery-address/pin", { state: { draft: incoming } })}
            aria-label="Back to map"
            className="grid size-11 flex-shrink-0 place-items-center rounded-xl hover:bg-[var(--muted)]"
          >
            <ChevronLeft className="size-5 text-[var(--ink)]" aria-hidden="true" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-[var(--ink)]">
            Add to saved places
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4 pb-12">
        {/* Shown at a fixed size rather than full screen: the pin is not
            adjustable here, so a map that filled the viewport would invite taps
            that silently do nothing. */}
        <div className="h-56 overflow-hidden rounded-2xl border border-line">
          {mapUnavailable ? (
            <div className="grid size-full place-items-center bg-[var(--muted)] px-6 text-center text-sm text-[var(--muted-foreground)]">
              The map is unavailable right now.
            </div>
          ) : isMapsLoaded ? (
            <GoogleMap
              mapContainerClassName="size-full"
              center={center}
              zoom={17}
              options={{
                disableDefaultUI: true,
                draggable: false,
                scrollwheel: false,
                keyboardShortcuts: false,
              }}
            >
              {pin && <MarkerF position={center} />}
            </GoogleMap>
          ) : (
            <div className="grid size-full place-items-center bg-[var(--muted)] text-[var(--muted-foreground)]">
              <Loader2 className="size-6 animate-spin" aria-hidden="true" />
            </div>
          )}
        </div>

        {!pin && (
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            No pin was set, so this address will be saved without a map position.
          </p>
        )}

        <div className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="save-place-name"
              className="mb-2 block text-sm font-bold text-[var(--ink)]"
            >
              Name
            </label>
            <input
              id="save-place-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Home, Mama's place"
              className="min-h-13 w-full rounded-2xl border border-line bg-[var(--surface)] px-4 text-base text-[var(--ink)] outline-none focus:border-[var(--primary)]"
            />
          </div>

          <div>
            <label
              htmlFor="save-place-address"
              className="mb-2 block text-sm font-bold text-[var(--ink)]"
            >
              Address
            </label>
            <textarea
              id="save-place-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              placeholder="Street, barangay, city"
              className="w-full resize-none rounded-2xl border border-line bg-[var(--surface)] px-4 py-3 text-base text-[var(--ink)] outline-none focus:border-[var(--primary)]"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-[var(--error)]">
            {error}
          </p>
        )}
      </main>

      {/* Pinned to the bottom rather than left in the scroll: this is the point
          of the screen, and on a phone it should not need a scroll to reach. */}
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-[var(--surface)] px-4 py-4 pb-safe">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={submit}
            disabled={!canSave}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-5 text-base font-bold text-[var(--primary-foreground)] disabled:opacity-50"
          >
            <Pencil className="size-4" aria-hidden="true" />
            {saving ? "Saving…" : "Save address"}
          </button>
        </div>
      </div>
    </div>
  );
}