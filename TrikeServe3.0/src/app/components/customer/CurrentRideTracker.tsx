import React, { useEffect, useState } from 'react';
import { AlertCircle, MapPin, Clock, Car, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

interface RideUpdate {
  status: 'on-the-way' | 'arrived' | 'pickup' | 'drop-off' | 'completed';
  message: string;
  timestamp: number;
  driverName?: string;
  driverPlate?: string;
  driverRating?: string;
}

interface CurrentRideTrackerProps {
  rideId?: string;
  driverName?: string;
  driverPlate?: string;
  onClose: () => void;
}

const statusIcons: Record<string, string> = {
  'on-the-way': '🚗',
  'arrived': '📍',
  'pickup': '🚀',
  'drop-off': '🏁',
  'completed': '🎉'
};

const statusLabels: Record<string, string> = {
  'on-the-way': 'Driver On The Way',
  'arrived': 'Driver Arrived',
  'pickup': 'Picked Up!',
  'drop-off': 'At Destination',
  'completed': 'Ride Completed'
};

const statusColors: Record<string, string> = {
  'on-the-way': 'bg-blue-50 border-blue-200',
  'arrived': 'bg-yellow-50 border-yellow-200',
  'pickup': 'bg-purple-50 border-purple-200',
  'drop-off': 'bg-orange-50 border-orange-200',
  'completed': 'bg-green-50 border-green-200'
};

export const CurrentRideTracker: React.FC<CurrentRideTrackerProps> = ({
  rideId,
  driverName,
  driverPlate,
  onClose
}) => {
  const [rideUpdate, setRideUpdate] = useState<RideUpdate | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);

  // Listen for ride status updates
  useEffect(() => {
    if (!rideId) return;

    const checkStatus = () => {
      const statusKey = `driver_status_${rideId}`;
      const statusData = localStorage.getItem(statusKey);

      if (statusData) {
        try {
          const status = JSON.parse(statusData);
          setRideUpdate({
            status: status.status,
            message: status.message,
            timestamp: status.timestamp || Date.now(),
            driverName: status.driverName || driverName,
            driverPlate: status.driverPlate || driverPlate
          });

          console.log('🔄 Ride status updated:', status.status);
        } catch (error) {
          console.error('Error parsing ride status:', error);
        }
      }
    };

    // Check immediately
    checkStatus();

    // Poll every 1 second (more responsive)
    const interval = setInterval(checkStatus, 1000);

    // Listen for storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith('driver_status_')) {
        checkStatus();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [rideId, driverName, driverPlate]);

  if (!rideUpdate) {
    return null;
  }

  // Minimized view
  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 z-[999] w-16 h-16 bg-gradient-to-br from-[#E11D48] to-[#BE123C] rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform"
      >
        <div className="text-2xl">{statusIcons[rideUpdate.status]}</div>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-[999] max-w-sm">
      <Card className={`border-2 rounded-xl p-5 ${statusColors[rideUpdate.status]}`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="text-3xl">{statusIcons[rideUpdate.status]}</div>
            <div>
              <h3 className="text-lg font-bold text-[#121212]">
                {statusLabels[rideUpdate.status]}
              </h3>
              <p className="text-sm text-[#64748B]">
                {new Date(rideUpdate.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1.5 hover:bg-white/50 rounded-lg transition-colors"
            >
              <div className="w-5 h-5 text-[#64748B]">−</div>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/50 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-[#64748B]" />
            </button>
          </div>
        </div>

        {/* Message */}
        <p className="text-sm text-[#121212] mb-4 font-medium">
          {rideUpdate.message}
        </p>

        {/* Driver Info (if available) */}
        {rideUpdate.driverName && (
          <div className="space-y-2 pt-4 border-t border-current/10">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#64748B] font-semibold">DRIVER</span>
              <span className="text-sm font-bold text-[#121212]">{rideUpdate.driverName}</span>
            </div>
            {rideUpdate.driverPlate && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#64748B] font-semibold">PLATE</span>
                <span className="text-sm font-bold text-[#121212]">{rideUpdate.driverPlate}</span>
              </div>
            )}
          </div>
        )}

        {/* Status Progress Indicator */}
        <div className="mt-4 space-y-2">
          <div className="flex gap-1">
            {['on-the-way', 'arrived', 'pickup', 'drop-off', 'completed'].map((s, i) => {
              const statuses = ['on-the-way', 'arrived', 'pickup', 'drop-off', 'completed'];
              const currentIndex = statuses.indexOf(rideUpdate.status);
              const isCompleted = i <= currentIndex;

              return (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full transition-all ${
                    isCompleted
                      ? 'bg-[#E11D48]'
                      : 'bg-gray-300'
                  }`}
                />
              );
            })}
          </div>
          <p className="text-xs text-[#64748B] text-right">
            {Math.round(((['on-the-way', 'arrived', 'pickup', 'drop-off', 'completed'].indexOf(rideUpdate.status) + 1) / 5) * 100)}% Complete
          </p>
        </div>
      </Card>
    </div>
  );
};

