import { createContext, useContext, useState, ReactNode, useEffect } from "react";

export interface CustomizationSelection {
  groupId: number;
  groupName: string;
  optionId: number;
  optionName: string;
  price: number;
}

export interface CartItem {
  id: number;
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
}

interface CartContextType {
  cartRestaurants: CartRestaurant[];
  addToCart: (restaurantData: { id: string; name: string; location: string; distance: string; time: string; image: string; deliveryFee: number }, item: CartItem) => void;
  updateItemQuantity: (restaurantId: string, itemId: number, change: number) => void;
  removeItem: (restaurantId: string, itemId: number) => void;
  removeRestaurant: (restaurantId: string) => void;
  clearCart: () => void;
  getTotalItems: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartRestaurants, setCartRestaurants] = useState<CartRestaurant[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // Load cart from localStorage on mount and when user changes
  useEffect(() => {
    const loadCart = () => {
      const currentUserData = localStorage.getItem('trikeserve_current_user');
      if (currentUserData) {
        try {
          const currentUser = JSON.parse(currentUserData);
          const userEmail = currentUser.email;
          setCurrentUserEmail(userEmail);
          
          // Load user-specific cart
          const cartKey = `cart_${userEmail}`;
          const savedCart = localStorage.getItem(cartKey);
          if (savedCart) {
            setCartRestaurants(JSON.parse(savedCart));
          } else {
            setCartRestaurants([]);
          }
        } catch (error) {
          console.error('Error loading cart:', error);
          setCartRestaurants([]);
        }
      } else {
        setCartRestaurants([]);
        setCurrentUserEmail(null);
      }
    };

    loadCart();

    // Poll for user changes (in case user switches accounts)
    const interval = setInterval(loadCart, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (currentUserEmail) {
      const cartKey = `cart_${currentUserEmail}`;
      localStorage.setItem(cartKey, JSON.stringify(cartRestaurants));
    }
  }, [cartRestaurants, currentUserEmail]);

  const addToCart = (
    restaurantData: { id: string; name: string; location: string; distance: string; time: string; image: string; deliveryFee: number },
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
        };

        return [...prev, newRestaurant];
      }
    });
  };

  const updateItemQuantity = (restaurantId: string, itemId: number, change: number) => {
    setCartRestaurants((prev) =>
      prev.map((restaurant) => {
        if (restaurant.id === restaurantId) {
          return {
            ...restaurant,
            items: restaurant.items
              .map((item) =>
                item.id === itemId
                  ? { ...item, quantity: Math.max(0, item.quantity + change) }
                  : item
              )
              .filter((item) => item.quantity > 0), // Remove items with 0 quantity
          };
        }
        return restaurant;
      }).filter((restaurant) => restaurant.items.length > 0) // Remove restaurants with no items
    );
  };

  const removeItem = (restaurantId: string, itemId: number) => {
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