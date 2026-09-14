import { useEffect, useState } from "react";
import { useParams } from "react-router";
import ChatHub from "../chat/ChatHub";

interface BusinessInfo {
  name: string;
  emoji: string;
}

export default function CustomerDirectChat() {
  const { businessId } = useParams();
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>({ name: "Business", emoji: "🏪" });

  useEffect(() => {
    if (!businessId) return;

    const loadBusinessInfo = async () => {
      try {
        // Try loading from localStorage restaurant data
        const keys = Object.keys(localStorage).filter((key) => key.startsWith("restaurantData_"));
        for (const key of keys) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || "{}");
            if (data && (data.id === businessId || key.includes(businessId))) {
              setBusinessInfo({ name: data.name || "Business", emoji: data.logo || "🏪" });
              return;
            }
          } catch {
            // skip malformed entries
          }
        }
      } catch (error) {
        console.error("[CustomerDirectChat] Error loading business info:", error);
      }
    };

    loadBusinessInfo();
  }, [businessId]);

  if (!businessId) return null;

  return (
    <ChatHub
      title="Business Chat"
      backPath="/customer/messages"
      basePath="/customer/messages"
      directPeerId={businessId}
      directPeerRole="business"
      directPeerName={businessInfo.name}
      directPeerAvatar={businessInfo.emoji}
    />
  );
}
