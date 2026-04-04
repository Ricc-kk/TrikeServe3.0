import { Outlet } from "react-router";
import { AuthProvider } from "../contexts/AuthContext";
import { CartProvider } from "../contexts/CartContext";
import { OrderProvider } from "../contexts/OrderContext";
import { FavoritesProvider } from "../contexts/FavoritesContext";

export default function Root() {
  return (
    <AuthProvider>
      <FavoritesProvider>
        <CartProvider>
          <OrderProvider>
            <div className="min-h-screen">
              <Outlet />
            </div>
          </OrderProvider>
        </CartProvider>
      </FavoritesProvider>
    </AuthProvider>
  );
}