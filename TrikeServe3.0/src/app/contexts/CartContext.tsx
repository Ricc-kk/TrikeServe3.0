import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { useAuth } from "./AuthContext";

export interface CustomizationSelection {
  groupId: number;
  groupName: string;
  optionId: number;
  optionName: string;
  price: number;
  /** Number of this add-on selected; omitted values from old carts mean one. */
  quantity?: number;
}

export interface CartItem {
  id: number | string;
  name: string;
  description: string;
  /** Base price of one dish; add-on pricing is kept in `customizationTotal`. */
  price: number;
  quantity: number;
  /** Selected add-ons for this cart row, charged once independent of dish quantity. */
  customizationTotal?: number;
  image: string;
  category: string;
  badge?: "most-ordered" | "most-liked" | "signature";
  customizations?: CustomizationSelection[];
  /**
   * The customer's own words for the kitchen, written while choosing the dish.
   *
   * Kept per cart row rather than per order: "less sweet" applies to the one dish
   * it was written for, and folding it into a single order-wide note would put it
   * against every item on the ticket.
   *
   * Part of the row's identity, so the same dish with and without a note is two
   * rows -- otherwise adding it a second time with a different note would bump the
   * quantity of the first and lose what the customer said.
   */
  note?: string;
  /**
   * What makes this row one row.
   *
   * The same dish with a different drink is a different thing to order, so the
   * cart has to be able to hold two of them. Rows used to be identified by the
   * menu item id alone, which quietly assumed one dish could only be in the cart
   * one way -- true until items had options. After they did, adding "Silog
   * Tocilog with Coke" to a cart already holding "Silog Tocilog with Iced Tea"
   * merged into the existing row and threw the new drink away: the customer got
   * two of the drink they had not chosen. The quantity buttons and the remove
   * button had the same problem, acting on whichever row came first.
   *
   * Derived rather than stored randomly, so the same dish with the same choices
   * always lands on the same row, wherever the cart was loaded from.
   */
  lineKey?: string;
}

/**
 * The identity of a cart row: the dish, plus exactly what was chosen for it.
 *
 * Order-independent, so re-picking the same options in a different order is
 * recognised as the same row rather than a second copy of it.
 */
export const cartLineKey = (
  itemId: number | string,
  customizations?: CustomizationSelection[],
  note?: string,
): string => {
  const choices = (customizations ?? [])
    .map((c) => `${c.groupId}:${c.optionId}${(c.quantity ?? 1) > 1 ? `x${c.quantity}` : ""}`)
    .sort()
    .join(",");
  // The note is part of the key. Two rows for the same dish that differ only in
  // what the customer asked the kitchen to do are genuinely different orders.
  const said = (note ?? "").trim();
  return said ? `${itemId}#${choices}#${said}` : `${itemId}#${choices}`;
};

/**
 * Fall back for a row saved before `lineKey` existed.
 *
 * Carts are persisted in localStorage, so a real customer's cart can arrive from
 * a previous version without the field. Treating those as "no choices" keeps them
 * working instead of dropping the whole cart on a missing property.
 */
const keyOf = (item: CartItem): string =>
  item.lineKey ?? cartLineKey(item.id, item.customizations, item.note);

const customizationTotalFor = (customizations?: CustomizationSelection[]) =>
  (customizations ?? []).reduce(
    (total, customization) =>
      total + Number(customization.price || 0) * Number(customization.quantity ?? 1),
    0,
  );

/** Total for a cart/order row: dish price times quantity plus one add-on total. */
export const cartItemTotal = (
  item: Pick<CartItem, "price" | "quantity" | "customizationTotal">,
) => Number(item.price || 0) * Number(item.quantity ?? 1) + Number(item.customizationTotal ?? 0);

/** Convert a cart row saved before add-on pricing became a one-time line amount. */
const normalizeCartItem = (item: CartItem): CartItem => {
  const price = Number(item.price) || 0;
  if (item.customizationTotal != null) {
    return { ...item, price, customizationTotal: Number(item.customizationTotal) || 0 };
  }

  const customizationTotal = customizationTotalFor(item.customizations);
  return {
    ...item,
    price: Math.max(0, price - customizationTotal),
    customizationTotal,
  };
};

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
      const savedRestaurants: CartRestaurant[] = savedCart ? JSON.parse(savedCart) : [];
      setCartRestaurants(savedRestaurants.map((restaurant) => ({
        ...restaurant,
        items: (restaurant.items ?? []).map((item) => {
          const normalized = normalizeCartItem(item);
          return { ...normalized, lineKey: keyOf(normalized) };
        }),
      })));
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
        const addedQuantity = Math.max(1, Math.min(50, Math.floor(Number(item.quantity) || 1)));
        const normalizedItem = normalizeCartItem(item);
        const incoming = { ...normalizedItem, quantity: addedQuantity, lineKey: keyOf(normalizedItem) };
        const existingItemIndex = restaurant.items.findIndex(
          (i) => keyOf(i) === incoming.lineKey
        );

        if (existingItemIndex !== -1) {
          // Same dish and choices: adding quantity changes the dish count while
          // the row's selected add-ons remain a single line amount.
          restaurant.items[existingItemIndex].quantity = Math.min(
            50,
            restaurant.items[existingItemIndex].quantity + incoming.quantity,
          );
        } else {
          // A different set of choices is a different order, not more of this one
          restaurant.items.push(incoming);
        }

        return updatedRestaurants;
      } else {
        // Restaurant doesn't exist, create new entry
        const normalizedItem = normalizeCartItem(item);
        const addedQuantity = Math.max(1, Math.min(50, Math.floor(Number(item.quantity) || 1)));
        const newRestaurant: CartRestaurant = {
          id: restaurantData.id, // Simple ID generation
          name: restaurantData.name,
          location: restaurantData.location,
          distance: restaurantData.distance,
          estimatedTime: restaurantData.time,
          image: restaurantData.image,
          items: [{ ...normalizedItem, lineKey: keyOf(normalizedItem), quantity: addedQuantity }],
          deliveryFee: restaurantData.deliveryFee,
          businessUserId: restaurantData.businessUserId,
          supabaseRestaurantId: restaurantData.supabaseRestaurantId,
        };

        return [...prev, newRestaurant];
      }
    });
  };

  const updateItemQuantity = (
    restaurantId: string,
    itemId: number | string,
    change: number,
  ) => {
    // The caller may pass either the line key or the bare menu item id. Falling
    // back keeps every existing call site working while they migrate.
    const itemKey =
      typeof itemId === "string" ? itemId : cartLineKey(itemId);
    setCartRestaurants((prev) =>
      prev.map((restaurant) => {
        if (restaurant.id === restaurantId) {
          return {
            ...restaurant,
            items: restaurant.items
              .map((item) =>
                keyOf(item) === itemKey
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
    const itemKey =
      typeof itemId === "string" ? itemId : cartLineKey(itemId);
    setCartRestaurants((prev) =>
      prev
        .map((restaurant) => {
          if (restaurant.id === restaurantId) {
            return {
              ...restaurant,
              // Only the row asked for. Removing by the bare menu id took out every
              // version of the dish in the cart, so "remove the one with Coke" also
              // removed the one with Iced Tea.
              items: restaurant.items.filter((item) => keyOf(item) !== itemKey),
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

/** Optional cart access for shared UI that can render outside CartProvider. */
export function useCartOptional() {
  return useContext(CartContext);
}
