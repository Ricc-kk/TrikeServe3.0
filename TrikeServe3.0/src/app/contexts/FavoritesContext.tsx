import { createContext, useContext, useState, ReactNode, useEffect } from "react";

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
  const [favorites, setFavorites] = useState<FavoriteRestaurant[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<FavoriteMenuItem[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // Load favorites from localStorage on mount and when user changes
  useEffect(() => {
    const loadFavorites = () => {
      const currentUserData = localStorage.getItem('trikeserve_current_user');
      if (currentUserData) {
        try {
          const currentUser = JSON.parse(currentUserData);
          const userEmail = currentUser.email;
          setCurrentUserEmail(userEmail);
          
          // Load user-specific restaurant favorites
          const favoritesKey = `favorites_${userEmail}`;
          const savedFavorites = localStorage.getItem(favoritesKey);
          if (savedFavorites) {
            setFavorites(JSON.parse(savedFavorites));
          } else {
            setFavorites([]);
          }

          // Load user-specific menu item favorites
          const itemFavoritesKey = `favorite_items_${userEmail}`;
          const savedItemFavorites = localStorage.getItem(itemFavoritesKey);
          if (savedItemFavorites) {
            setFavoriteItems(JSON.parse(savedItemFavorites));
          } else {
            setFavoriteItems([]);
          }
        } catch (error) {
          console.error('Error loading favorites:', error);
          setFavorites([]);
          setFavoriteItems([]);
        }
      } else {
        setFavorites([]);
        setFavoriteItems([]);
        setCurrentUserEmail(null);
      }
    };

    loadFavorites();

    // Poll for user changes (in case user switches accounts)
    const interval = setInterval(loadFavorites, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Save restaurant favorites to localStorage whenever they change
  useEffect(() => {
    if (currentUserEmail) {
      const favoritesKey = `favorites_${currentUserEmail}`;
      localStorage.setItem(favoritesKey, JSON.stringify(favorites));
    }
  }, [favorites, currentUserEmail]);

  // Save menu item favorites to localStorage whenever they change
  useEffect(() => {
    if (currentUserEmail) {
      const itemFavoritesKey = `favorite_items_${currentUserEmail}`;
      localStorage.setItem(itemFavoritesKey, JSON.stringify(favoriteItems));
    }
  }, [favoriteItems, currentUserEmail]);

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