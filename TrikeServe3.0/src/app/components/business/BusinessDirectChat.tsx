import { useEffect, useState } from "react";
import { useParams } from "react-router";
import ChatHub from "../chat/ChatHub";
import { supabase } from "../../../lib/supabase";

interface PeerInfo {
  name: string;
  emoji: string;
}

export default function BusinessDirectChat() {
  const { customerId, driverId } = useParams();
  const [peerInfo, setPeerInfo] = useState<PeerInfo>({ name: "User", emoji: "👤" });

  const peerId = customerId || driverId;
  const peerRole = customerId ? "customer" : "rider";

  useEffect(() => {
    if (!peerId) return;

    const loadPeerInfo = async () => {
      try {
        if (customerId) {
          // Load customer info from users table
          const { data: customer } = await supabase
            .from("users")
            .select("name")
            .eq("id", customerId)
            .single();

          if (customer) {
            setPeerInfo({ name: customer.name || "Customer", emoji: "👤" });
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
        console.error("[BusinessDirectChat] Error loading peer info:", error);
      }
    };

    loadPeerInfo();
  }, [customerId, driverId]);

  if (!peerId) return null;

  return (
    <ChatHub
      title={customerId ? "Chat with Customer" : "Chat with Driver"}
      backPath="/business/orders"
      basePath="/business/messages"
      directPeerId={peerId}
      directPeerRole={peerRole as any}
      directPeerName={peerInfo.name}
      directPeerAvatar={peerInfo.emoji}
      contextType="order"
    />
  );
}
