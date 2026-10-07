import { useEffect, useState } from "react";

import { useAuth } from "../../contexts/AuthContext";
import { getPendingRiderPlateUpdate, submitRiderPlateUpdate } from "@/lib/supabase";
import EditProfileScreen from "../ui/EditProfileScreen";

/**
 * Driver edit profile.
 *
 * The driver had an inline edit toggle inside the profile screen, behind a
 * confirmation dialog. It now uses the same dedicated screen the customer got.
 *
 * The plate number is the exception to "this screen just saves". A plate is the
 * vehicle's legal identity, so it is staged for Super Admin review instead of
 * written straight through — the row keeps its current plate until it is
 * approved. Name and phone still save immediately.
 */
export default function RiderEditProfile() {
  const { user } = useAuth();
  const [todaPlate, setTodaPlate] = useState(user?.todaPlate ?? "");

  /**
   * A plate change already waiting for review.
   *
   * Tracked so the field can show the *submitted* value while the saved value
   * stays put. Without this the field would snap back to the old plate on save,
   * reading as "your change was lost" when it is actually queued.
   */
  const [pendingPlate, setPendingPlate] = useState<string | null>(null);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!user?.id) return;

    getPendingRiderPlateUpdate(user.id).then(({ request }) => {
      if (!active || !request) return;
      setPendingPlate(request.payload?.new_plate ?? null);
      setPendingRequestId(request.id ?? null);
    });

    return () => {
      active = false;
    };
  }, [user?.id]);

  return (
    <EditProfileScreen
      backTo="/rider/profile"
      navVariant="rider"
      extraHeading="Driver details"
      // Reflects the pending state rather than describing it statically, so the
      // note stops claiming a change is un-reviewed once it has been sent.
      extraNote={
        pendingPlate
          ? `Your requested plate ${pendingPlate} is waiting for Super Admin approval. Your profile still shows ${
              user?.todaPlate || "no plate"
            } until it is approved. Your terminal is assigned by the TrikeServe office.`
          : "Changing your plate number needs Super Admin approval before it takes effect. Your terminal is assigned by the TrikeServe office."
      }
      extraFields={[
        {
          key: "toda-plate",
          label: "TODA Plate Number",
          // Show what was submitted while it is under review; otherwise the
          // field would read as though the edit never took.
          value: pendingPlate ?? todaPlate,
          placeholder: "ABC 1234",
          onChange: (v) => {
            setTodaPlate(v);
            // Editing after submitting invalidates the queued request, so clear
            // it and let the next save queue the new value.
            setPendingPlate(null);
            setPendingRequestId(null);
          },
        },
      ]}
      onSaveExtra={async () => {
        if (!user?.id) return "You need to be signed in to request a plate change.";

        const requested = todaPlate.trim();
        if (!requested) return null;
        // Nothing typed means the driver only came to fix their name or phone.
        if (requested === (user.todaPlate ?? "") && !pendingRequestId) return null;

        const result = await submitRiderPlateUpdate({
          driverId: user.id,
          driverName: user.name ?? null,
          previousPlate: user.todaPlate ?? null,
          newPlate: requested,
          requestedByEmail: user.email ?? null,
        });

        if (!result.success) return result.error ?? "Could not send your plate change for approval.";

        // Queued, not applied. Show the submitted value and say so.
        setPendingPlate(requested);
        return null;
      }}
    />
  );
}
