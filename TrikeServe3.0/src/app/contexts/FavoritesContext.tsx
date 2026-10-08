import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { useAuth } from "./AuthContext";

export interface FavoriteRestaurant {
  id: number | string;
  name: string;
  image: string;
  rating: number;
  reviews: number;
  distance: string;
  estimatedTime: string;
  category: string;
  priceRange?: string;
}

export interface FavoriteMenuItem {
  id: number | string;
  restaurantId: string;
  restaurantName: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
}

interface FavoritesContextType {
  // Restaurant favorites
  favorites: FavoriteRestaurant[];
  toggleFavorite: (restaurant: FavoriteRestaurant) => void;
  isFavorite: (restaurantId: number | string) => boolean;
  getTotalFavorites: () => number;

  // Menu item favorites
  favoriteItems: FavoriteMenuItem[];
  toggleFavoriteItem: (item: FavoriteMenuItem) => void;
  isFavoriteItem: (itemId: number | string) => boolean;
  getTotalFavoriteItems: () => number;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteRestaurant[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<FavoriteMenuItem[]>([]);

  /*
   * Whose favourites these are, taken from the auth context.
   *
   * This used to re-read `trikeserve_current_user` from localStorage on a 1-second
   * poll. That key is shared by every tab on this origin, so a second tab
   * signing in as somebody else repointed this one at their account -- and the
   * save effects below then wrote the *first* account's favourites under the
   * second account's key, quietly destroying them. The context user is this tab's
   * own account and only changes when this tab's identity changes.
   */
  const userEmail = user?.email ?? null;

  // Which account the in-memory lists were loaded for. The save effects check
  // this, because on an account switch the lists still hold the previous
  // account's rows for one render -- saving those under the new key is the exact
  // corruption this guards against.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Load this account's favourites, and only this account's.
  useEffect(() => {
    if (!userEmail) {
      setFavorites([]);
      setFavoriteItems([]);
      setLoadedFor(null);
      return;
    }

    try {
      const savedFavorites = localStorage.getItem(`favorites_${userEmail}`);
      setFavorites(savedFavorites ? JSON.parse(savedFavorites) : []);

      const savedItemFavorites = localStorage.getItem(`favorite_items_${userEmail}`);
      setFavoriteItems(savedItemFavorites ? JSON.parse(savedItemFavorites) : []);
    } catch (error) {
      console.error('Error loading favorites:', error);
      setFavorites([]);
      setFavoriteItems([]);
    }

    setLoadedFor(userEmail);
  }, [userEmail]);

  // Save restaurant favorites to localStorage whenever they change
  useEffect(() => {
    if (userEmail && loadedFor === userEmail) {
      localStorage.setItem(`favorites_${userEmail}`, JSON.stringify(favorites));
    }
  }, [favorites, userEmail, loadedFor]);

  // Save menu item favorites to localStorage whenever they change
  useEffect(() => {
    if (userEmail && loadedFor === userEmail) {
      localStorage.setItem(`favorite_items_${userEmail}`, JSON.stringify(favoriteItems));
    }
  }, [favoriteItems, userEmail, loadedFor]);

  // --- Restaurant favorites ---
  const toggleFavorite = (restaurant: FavoriteRestaurant) => {
    setFavorites((prev) => {
      const exists = prev.find((item) => item.id === restaurant.id);
      if (exists) {
        // Remove from favorites
        return prev.filter((item) => item.id !== restaurant.id);
      } else {
        // Add to favorites
        return [...prev, restaurant];
      }
    });
  };

  const isFavorite = (restaurantId: number | string) => {
    return favorites.some((item) => item.id === restaurantId);
  };

  const getTotalFavorites = () => {
    return favorites.length;
  };

  // --- Menu item favorites ---
  const toggleFavoriteItem = (item: FavoriteMenuItem) => {
    setFavoriteItems((prev) => {
      const exists = prev.find((fi) => fi.id === item.id);
      if (exists) {
        return prev.filter((fi) => fi.id !== item.id);
      } else {
        return [...prev, item];
      }
    });
  };

  const isFavoriteItem = (itemId: number | string) => {
    return favoriteItems.some((item) => item.id === itemId);
  };

  const getTotalFavoriteItems = () => {
    return favoriteItems.length;
  };

  return (
    <FavoritesContext.Provider value={{
      favorites,
      toggleFavorite,
      isFavorite,
      getTotalFavorites,
      favoriteItems,
      toggleFavoriteItem,
      isFavoriteItem,
      getTotalFavoriteItems,
    }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (context === undefined) {
    throw new Error("useFavorites must be used within a FavoritesProvider");
  }
  return context;
}