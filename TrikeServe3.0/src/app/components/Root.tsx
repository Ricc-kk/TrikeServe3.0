import { Outlet } from "react-router";
import { AuthProvider } from "../contexts/AuthContext";
import { CartProvider } from "../contexts/CartContext";
import { OrderProvider } from "../contexts/OrderContext";
import { FavoritesProvider } from "../contexts/FavoritesContext";
import { NotificationProvider, useNotification } from "../contexts/NotificationContext";
import Toast from "./ui/Toast";
import LocationPermissionPrompt from "./LocationPermissionPrompt";
import BusinessScrollBehavior from "./business/BusinessScrollBehavior";
import GlobalChatHead from "./chat/GlobalChatHead";
import { ChatHeadVisibilityProvider } from "../contexts/ChatHeadVisibilityContext";
import DevModeSettings from "./ui/DevModeSettings";

function NotificationToasts() {
  const { notifications, removeNotification } = useNotification();
  return (
    <>
      {notifications.map((n, i) => (
        <Toast
          key={n.id}
          message={n.message}
          variant={n.type}
          onClose={() => removeNotification(n.id)}
          action={n.action}
          style={{ top: `${24 + i * 80}px` }}
        />
      ))}
    </>
  );
}

export default function Root() {
  return (
    <AuthProvider>
      <ChatHeadVisibilityProvider>
        <FavoritesProvider>
          <CartProvider>
            <OrderProvider>
              <NotificationProvider>
                <NotificationToasts />
                <LocationPermissionPrompt />
                <BusinessScrollBehavior />
                <div className="min-h-screen">
                  <Outlet />
                </div>
                <DevModeSettings />
                <GlobalChatHead />
              </NotificationProvider>
            </OrderProvider>
          </CartProvider>
        </FavoritesProvider>
      </ChatHeadVisibilityProvider>
    </AuthProvider>
  );
}
