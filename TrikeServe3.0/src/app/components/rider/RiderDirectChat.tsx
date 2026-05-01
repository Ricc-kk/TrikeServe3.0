import { useEffect, useState } from "react";
import { useParams } from "react-router";
import ChatHub from "../chat/ChatHub";

interface PassengerInfo {
  name: string;
  emoji: string;
}

export default function RiderDirectChat() {
  const { rideId, passengerId } = useParams();
  const [passengerInfo, setPassengerInfo] = useState<PassengerInfo>({ name: 'Passenger', emoji: '👤' });

  useEffect(() => {
    if (!rideId || !passengerId) return;

    const loadPassengerInfo = () => {
      const activeRideData = localStorage.getItem('trikeserve_active_ride');
      if (activeRideData) {
        try {
          const activeRide = JSON.parse(activeRideData);
          if (activeRide.id === rideId && activeRide.passengerDetails) {
            const passenger = activeRide.passengerDetails.find((p: any) => p.id === passengerId);
            if (passenger) {
              setPassengerInfo({ name: passenger.name, emoji: passenger.emoji });
              return;
            }
          }
        } catch (error) {
          console.error('[RiderDirectChat] Error checking active ride:', error);
        }
      }

      const historyKeys = Object.keys(localStorage).filter((key) => key.startsWith('ride_history_'));
      for (const key of historyKeys) {
        try {
          const history = JSON.parse(localStorage.getItem(key) || '[]');
          const ride = history.find((r: any) => r.id === rideId);
          if (ride?.passengerDetails) {
            const passenger = ride.passengerDetails.find((p: any) => p.id === passengerId);
            if (passenger) {
              setPassengerInfo({ name: passenger.name, emoji: passenger.emoji });
              return;
            }
          }
        } catch (error) {
          console.error('[RiderDirectChat] Error checking ride history:', error);
        }
      }
    };

    loadPassengerInfo();
  }, [rideId, passengerId]);

  if (!rideId || !passengerId) return null;

  return (
    <ChatHub
      title="Passenger Chat"
      backPath="/rider/messages"
      basePath="/rider/messages"
      directPeerId={passengerId}
      directPeerRole="customer"
      directPeerName={passengerInfo.name}
      directPeerAvatar={passengerInfo.emoji}
      contextType="ride"
      contextId={rideId}
      subject={`Ride ${rideId.substring(0, 8)}`}
    />
  );
}

