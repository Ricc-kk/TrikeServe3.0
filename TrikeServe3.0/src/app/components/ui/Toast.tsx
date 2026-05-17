import { useNotification } from '../../contexts/NotificationContext';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Toast() {
  const { notifications, removeNotification } = useNotification();
  const [displayedNotifications, setDisplayedNotifications] = useState(notifications);

  useEffect(() => {
    setDisplayedNotifications(notifications);
  }, [notifications]);

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-3 pointer-events-none">
      {displayedNotifications.map((notification) => (
        <div
          key={notification.id}
          className="animate-slide-in-right"
          style={{
            animation: 'slideInRight 0.3s ease-out',
          }}
        >
          <div
            className={`
              flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg
              pointer-events-auto cursor-pointer transition-all duration-300
              ${
                notification.type === 'success'
                  ? 'bg-[#10B981] text-white'
                  : notification.type === 'error'
                  ? 'bg-[#E11D48] text-white'
                  : 'bg-[#3B82F6] text-white'
              }
              hover:shadow-xl
            `}
            onClick={() => removeNotification(notification.id)}
          >
            <div className="flex items-center gap-3 flex-1">
              {notification.type === 'success' && (
                <div className="flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
              <span className="font-semibold text-sm whitespace-nowrap">{notification.message}</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeNotification(notification.id);
              }}
              className="flex-shrink-0 ml-2 hover:opacity-80 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}

      <style>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}

