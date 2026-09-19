import { Outlet } from "react-router";
import { AuthProvider } from "../contexts/AuthContext";
import { CartProvider } from "../contexts/CartContext";
import { OrderProvider } from "../contexts/OrderContext";
import { FavoritesProvider } from "../contexts/FavoritesContext";
import { NotificationProvider, useNotification } from "../contexts/NotificationContext";
import Toast from "./ui/Toast";
import LocationGate from "./LocationGate";

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
      <FavoritesProvider>
        <CartProvider>
          <OrderProvider>
            <NotificationProvider>
              <NotificationToasts />
              <LocationGate />
              <div className="min-h-screen">
                <Outlet />
              </div>
            </NotificationProvider>
          </OrderProvider>
        </CartProvider>
      </FavoritesProvider>
    </AuthProvider>
  );
}