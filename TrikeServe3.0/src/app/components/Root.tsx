import { Outlet } from "react-router";
import { AuthProvider } from "../contexts/AuthContext";
import { CartProvider } from "../contexts/CartContext";
import { OrderProvider } from "../contexts/OrderContext";
import { FavoritesProvider } from "../contexts/FavoritesContext";
import { NotificationProvider } from "../contexts/NotificationContext";
import Toast from "./ui/Toast";

export default function Root() {
  return (
    <AuthProvider>
      <FavoritesProvider>
        <CartProvider>
          <OrderProvider>
            <NotificationProvider>
              <Toast />
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