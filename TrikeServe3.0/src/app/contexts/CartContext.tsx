import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { useAuth } from "./AuthContext";

export interface CustomizationSelection {
  groupId: number;
  groupName: string;
  optionId: number;
  optionName: string;
  price: number;
}

export interface CartItem {
  id: number | string;
  name: string;
  description: string;
  price: number;
  quantity: number;
  image: string;
  category: string;
  badge?: "most-ordered" | "most-liked" | "signature";
  customizations?: CustomizationSelection[];
}

export interface CartRestaurant {
  id: string; // Changed from number to string to store business email
  name: string;
  location: string;
  distance: string;
  estimatedTime: string;
  image: string;
  items: CartItem[];
  deliveryFee: number;
  businessUserId?: string; // Business user ID for order notifications
  supabaseRestaurantId?: string; // Supabase restaurant UUID
}

interface CartContextType {
  cartRestaurants: CartRestaurant[];
  addToCart: (restaurantData: { id: string; name: string; location: string; distance: string; time: string; image: string; deliveryFee: number; businessUserId?: string; supabaseRestaurantId?: string }, item: CartItem) => void;
  updateItemQuantity: (restaurantId: string, itemId: number | string, change: number) => void;
  removeItem: (restaurantId: string, itemId: number | string) => void;
  removeRestaurant: (restaurantId: string) => void;
  clearCart: () => void;
  getTotalItems: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cartRestaurants, setCartRestaurants] = useState<CartRestaurant[]>([]);

  /*
   * Whose cart this is, taken from the auth context.
   *
   * This used to re-read `trikeserve_current_user` from localStorage on a
   * 1-second poll. That key is shared by every tab on this origin, so a second
   * tab signing in as somebody else repointed this one at their account -- and
   * the save effect below then wrote the *first* account's cart under the second
   * account's key, so one person's cart silently overwrote another's.
   */
  const userEmail = user?.email ?? null;

  // Which account the in-memory cart was loaded for. The save effect checks
  // this, because on an account switch the cart still holds the previous
  // account's items for one render -- saving those under the new key is the
  // exact corruption this guards against.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Load this account's cart, and only this account's.
  useEffect(() => {
    if (!userEmail) {
      setCartRestaurants([]);
      setLoadedFor(null);
      return;
    }

    try {
      const savedCart = localStorage.getItem(`cart_${userEmail}`);
      setCartRestaurants(savedCart ? JSON.parse(savedCart) : []);
    } catch (error) {
      console.error('Error loading cart:', error);
      setCartRestaurants([]);
    }

    setLoadedFor(userEmail);
  }, [userEmail]);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (userEmail && loadedFor === userEmail) {
      localStorage.setItem(`cart_${userEmail}`, JSON.stringify(cartRestaurants));
    }
  }, [cartRestaurants, userEmail, loadedFor]);

  const addToCart = (
    restaurantData: { id: string; name: string; location: string; distance: string; time: string; image: string; deliveryFee: number; businessUserId?: string; supabaseRestaurantId?: string },
    item: CartItem
  ) => {
    setCartRestaurants((prev) => {
      // Find if restaurant already exists
      const existingRestaurantIndex = prev.findIndex(
        (r) => r.name === restaurantData.name
      );

      if (existingRestaurantIndex !== -1) {
        // Restaurant exists, check if item exists
        const updatedRestaurants = [...prev];
        const restaurant = updatedRestaurants[existingRestaurantIndex];
        const existingItemIndex = restaurant.items.findIndex(
          (i) => i.id === item.id
        );

        if (existingItemIndex !== -1) {
          // Item exists, increase quantity
          restaurant.items[existingItemIndex].quantity += 1;
        } else {
          // Item doesn't exist, add it
          restaurant.items.push({ ...item, quantity: 1 });
        }

        return updatedRestaurants;
      } else {
        // Restaurant doesn't exist, create new entry
        const newRestaurant: CartRestaurant = {
          id: restaurantData.id, // Simple ID generation
          name: restaurantData.name,
          location: restaurantData.location,
          distance: restaurantData.distance,
          estimatedTime: restaurantData.time,
          image: restaurantData.image,
          items: [{ ...item, quantity: 1 }],
          deliveryFee: restaurantData.deliveryFee,
          businessUserId: restaurantData.businessUserId,
          supabaseRestaurantId: restaurantData.supabaseRestaurantId,
        };

        return [...prev, newRestaurant];
      }
    });
  };

  const updateItemQuantity = (restaurantId: string, itemId: number | string, change: number) => {
    setCartRestaurants((prev) =>
      prev.map((restaurant) => {
        if (restaurant.id === restaurantId) {
          return {
            ...restaurant,
            items: restaurant.items
              .map((item) =>
                item.id === itemId
                  ? { ...item, quantity: Math.max(0, Math.min(50, item.quantity + change)) }
                  : item
              )
              .filter((item) => item.quantity > 0), // Remove items with 0 quantity
          };
        }
        return restaurant;
      }).filter((restaurant) => restaurant.items.length > 0) // Remove restaurants with no items
    );
  };

  const removeItem = (restaurantId: string, itemId: number | string) => {
    setCartRestaurants((prev) =>
      prev
        .map((restaurant) => {
          if (restaurant.id === restaurantId) {
            return {
              ...restaurant,
              items: restaurant.items.filter((item) => item.id !== itemId),
            };
          }
          return restaurant;
        })
        .filter((restaurant) => restaurant.items.length > 0)
    );
  };

  const removeRestaurant = (restaurantId: string) => {
    setCartRestaurants((prev) => prev.filter((r) => r.id !== restaurantId));
  };

  const clearCart = () => {
    setCartRestaurants([]);
  };

  const getTotalItems = () => {
    return cartRestaurants.reduce(
      (total, restaurant) =>
        total + restaurant.items.reduce((sum, item) => sum + item.quantity, 0),
      0
    );
  };

  return (
    <CartContext.Provider
      value={{
        cartRestaurants,
        addToCart,
        updateItemQuantity,
        removeItem,
        removeRestaurant,
        clearCart,
        getTotalItems,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}