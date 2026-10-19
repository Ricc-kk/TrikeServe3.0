import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router";
import ChatHub from "../chat/ChatHub";
import { supabase } from "../../../lib/supabase";

interface PeerInfo {
  name: string;
  emoji: string;
}

export default function CustomerDirectChat() {
  const { businessId, driverId } = useParams();
  const location = useLocation();
  const routePeerInfo = location.state as { peerName?: string; peerAvatar?: string } | null;
  const [peerInfo, setPeerInfo] = useState<PeerInfo>({ name: "User", emoji: "💬" });

  const peerId = businessId || driverId;
  const peerRole = businessId ? "business" : "rider";

  useEffect(() => {
    if (!peerId) return;

    const loadPeerInfo = async () => {
      try {
        if (businessId) {
          if (routePeerInfo?.peerName || routePeerInfo?.peerAvatar) {
            setPeerInfo((previous) => ({
              name: routePeerInfo.peerName || previous.name,
              emoji: routePeerInfo.peerAvatar || previous.emoji,
            }));
          }
          // Resolve the current restaurant identity from the shared record.
          const { data: restaurant } = await supabase
            .from("restaurants")
            .select("name, logo_image")
            .eq("business_user_id", businessId)
            .maybeSingle();

          if (restaurant) {
            setPeerInfo((previous) => ({ name: restaurant.name || previous.name || "Restaurant", emoji: restaurant.logo_image || previous.emoji }));
          }
        } else if (driverId) {
          // Load driver info from users table. avatar_url matters: this used to
          // select only the name, so the chat header fell back to a scooter emoji
          // and never showed the driver's actual profile photo.
          const { data: driver } = await supabase
            .from("users")
            .select("name, avatar_url")
            .eq("id", driverId)
            .single();

          if (driver) {
            setPeerInfo({ name: driver.name || "Driver", emoji: driver.avatar_url || "🛵" });
          }
        }
      } catch (error) {
        console.error("[CustomerDirectChat] Error loading peer info:", error);
      }
    };

    loadPeerInfo();
  }, [businessId, driverId, routePeerInfo?.peerName, routePeerInfo?.peerAvatar]);

  if (!peerId) return null;

  return (
    <ChatHub
      title={businessId ? "Chat with Restaurant" : "Chat with Driver"}
      backPath="/customer/messages"
      basePath="/customer/messages"
      directPeerId={peerId}
      directPeerRole={peerRole as any}
      directPeerName={peerInfo.name}
      directPeerAvatar={peerInfo.emoji}
      contextType="order"
    />
  );
}
