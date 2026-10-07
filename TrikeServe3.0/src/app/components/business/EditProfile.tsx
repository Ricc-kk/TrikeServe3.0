import { useState } from "react";

import { useAuth } from "../../contexts/AuthContext";
import EditProfileScreen from "../ui/EditProfileScreen";

/**
 * Business owner edit profile.
 *
 * Only the owner's own details live here — name, phone, photo. The shop's name,
 * address and cuisine stay on the Shop screen, because those are staged for
 * Super Admin review rather than written straight through, and duplicating
 * that flow here would quietly let a shop skip approval.
 */
export default function BusinessEditProfile() {
  const { user } = useAuth();

  return (
    <EditProfileScreen
      backTo="/business/account"
      navVariant="business"
      extraNote="Your shop name, address, and what you serve are on the Shop tab — those need Super Admin approval before customers see them."
      extraFields={[]}
    />
  );
}