import { createContext, useContext, useState, ReactNode, useEffect } from "react";

interface Restaurant {
  id: number;
  name: string;
  image: string;
  rating: number;
  reviews: number;
  distance: string;
  estimatedTime: string;
  category: string;
  priceRange?: string;
}

interface FavoritesContextType {
  favorites: Restaurant[];
  toggleFavorite: (restaurant: Restaurant) => void;
  isFavorite: (restaurantId: number) => boolean;
  getTotalFavorites: () => number;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<Restaurant[]>([]);
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
          
          // Load user-specific favorites
          const favoritesKey = `favorites_${userEmail}`;
          const savedFavorites = localStorage.getItem(favoritesKey);
          if (savedFavorites) {
            setFavorites(JSON.parse(savedFavorites));
          } else {
            setFavorites([]);
          }
        } catch (error) {
          console.error('Error loading favorites:', error);
          setFavorites([]);
        }
      } else {
        setFavorites([]);
        setCurrentUserEmail(null);
      }
    };

    loadFavorites();

    // Poll for user changes (in case user switches accounts)
    const interval = setInterval(loadFavorites, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Save to localStorage whenever favorites change
  useEffect(() => {
    if (currentUserEmail) {
      const favoritesKey = `favorites_${currentUserEmail}`;
      localStorage.setItem(favoritesKey, JSON.stringify(favorites));
    }
  }, [favorites, currentUserEmail]);

  const toggleFavorite = (restaurant: Restaurant) => {
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

  const isFavorite = (restaurantId: number) => {
    return favorites.some((item) => item.id === restaurantId);
  };

  const getTotalFavorites = () => {
    return favorites.length;
  };

  return (
    <FavoritesContext.Provider value={{ favorites, toggleFavorite, isFavorite, getTotalFavorites }}>
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