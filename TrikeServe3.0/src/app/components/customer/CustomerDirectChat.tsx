import { useEffect, useState } from "react";
import { useParams } from "react-router";
import ChatHub from "../chat/ChatHub";
import { supabase } from "../../../lib/supabase";

interface PeerInfo {
  name: string;
  emoji: string;
}

export default function CustomerDirectChat() {
  const { businessId, driverId } = useParams();
  const [peerInfo, setPeerInfo] = useState<PeerInfo>({ name: "User", emoji: "💬" });

  const peerId = businessId || driverId;
  const peerRole = businessId ? "business" : "rider";

  useEffect(() => {
    if (!peerId) return;

    const loadPeerInfo = async () => {
      try {
        if (businessId) {
          // Try loading from localStorage restaurant data first
          const keys = Object.keys(localStorage).filter((key) => key.startsWith("restaurantData_"));
          for (const key of keys) {
            try {
              const data = JSON.parse(localStorage.getItem(key) || "{}");
              if (data && (data.id === businessId || key.includes(businessId))) {
                setPeerInfo({ name: data.name || "Business", emoji: data.logo || "🏪" });
                return;
              }
            } catch {
              // skip malformed entries
            }
          }

          // Fallback to Supabase
          const { data: restaurant } = await supabase
            .from("restaurants")
            .select("name")
            .eq("business_user_id", businessId)
            .maybeSingle();

          if (restaurant) {
            setPeerInfo({ name: restaurant.name || "Restaurant", emoji: "🏪" });
          }
        } else if (driverId) {
          // Load driver info from users table
          const { data: driver } = await supabase
            .from("users")
            .select("name")
            .eq("id", driverId)
            .single();

          if (driver) {
            setPeerInfo({ name: driver.name || "Driver", emoji: "🛵" });
          }
        }
      } catch (error) {
        console.error("[CustomerDirectChat] Error loading peer info:", error);
      }
    };

    loadPeerInfo();
  }, [businessId, driverId]);

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
