import { createContext, useContext, useState, ReactNode, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "@/lib/supabase";

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

type FavoriteMutation = {
  userId: string;
  kind: "restaurant" | "menu-item";
  id: string;
  shouldFavorite: boolean;
  snapshot?: FavoriteRestaurant | FavoriteMenuItem;
  sequence: number;
  version: string;
};

type AccountFavorites = {
  synced: boolean;
  restaurants: FavoriteRestaurant[];
  menuItems: FavoriteMenuItem[];
  error: unknown | null;
};

const uuidPattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const favoriteWriteQueues = new Map<string, Promise<boolean>>();

function isUuid(value: string | null | undefined): value is string {
  return !!value && uuidPattern.test(value);
}

function readLocalFavorites<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function readPendingFavoriteMutations(userId: string): FavoriteMutation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(`favorite_sync_pending_${userId}`) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((mutation: any) =>
      mutation?.userId === userId &&
      (mutation.kind === "restaurant" || mutation.kind === "menu-item") &&
      typeof mutation.id === "string" &&
      typeof mutation.shouldFavorite === "boolean" &&
      typeof mutation.sequence === "number" &&
      typeof mutation.version === "string",
    ) as FavoriteMutation[];
  } catch {
    return [];
  }
}

function writePendingFavoriteMutations(userId: string, mutations: FavoriteMutation[]): void {
  try {
    localStorage.setItem(`favorite_sync_pending_${userId}`, JSON.stringify(mutations));
  } catch {
    // The visible favorite remains usable even when local storage is unavailable.
  }
}

function rememberPendingFavoriteMutation(mutation: FavoriteMutation): void {
  const current = readPendingFavoriteMutations(mutation.userId);
  const key = `${mutation.kind}:${mutation.id}`;
  writePendingFavoriteMutations(mutation.userId, [
    ...current.filter((item) => `${item.kind}:${item.id}` !== key),
    mutation,
  ]);
}

function clearPendingFavoriteMutation(mutation: FavoriteMutation): void {
  const current = readPendingFavoriteMutations(mutation.userId);
  writePendingFavoriteMutations(
    mutation.userId,
    current.filter((item) =>
      item.kind !== mutation.kind || item.id !== mutation.id || item.version !== mutation.version,
    ),
  );
}

async function persistFavoriteMutation(mutation: FavoriteMutation): Promise<boolean> {
  if (!isUuid(mutation.userId) || !isUuid(mutation.id)) return false;
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || authData.user?.id !== mutation.userId) return false;

    if (mutation.kind === "restaurant") {
      const result = mutation.shouldFavorite
        ? await supabase.from("favorites").upsert({
            customer_id: mutation.userId,
            restaurant_id: mutation.id,
            restaurant_snapshot: mutation.snapshot,
          }, { onConflict: "customer_id,restaurant_id" })
        : await supabase.from("favorites").delete()
            .eq("customer_id", mutation.userId)
            .eq("restaurant_id", mutation.id);
      return !result.error;
    }

    const result = mutation.shouldFavorite
      ? await supabase.from("favorite_menu_items").upsert({
          customer_id: mutation.userId,
          menu_item_id: mutation.id,
          item_snapshot: mutation.snapshot,
        }, { onConflict: "customer_id,menu_item_id" })
      : await supabase.from("favorite_menu_items").delete()
          .eq("customer_id", mutation.userId)
          .eq("menu_item_id", mutation.id);
    return !result.error;
  } catch {
    return false;
  }
}

function enqueueFavoriteMutation(mutation: FavoriteMutation): Promise<boolean> {
  const queueKey = `${mutation.userId}:${mutation.kind}:${mutation.id}`;
  const previous = favoriteWriteQueues.get(queueKey);
  const pending = (previous ? previous.catch(() => false) : Promise.resolve(true))
    .then(() => persistFavoriteMutation(mutation));
  favoriteWriteQueues.set(queueKey, pending);
  void pending.then(
    () => { if (favoriteWriteQueues.get(queueKey) === pending) favoriteWriteQueues.delete(queueKey); },
    () => { if (favoriteWriteQueues.get(queueKey) === pending) favoriteWriteQueues.delete(queueKey); },
  );
  return pending;
}

async function persistFavoriteMutationWithRetry(mutation: FavoriteMutation): Promise<boolean> {
  rememberPendingFavoriteMutation(mutation);
  const synced = await enqueueFavoriteMutation(mutation);
  if (synced) clearPendingFavoriteMutation(mutation);
  return synced;
}

function mergeById<T extends { id: number | string }>(
  local: T[],
  remote: T[],
): T[] {
  const merged = new Map<string, T>();
  remote.forEach((item) => merged.set(String(item.id), item));
  local.forEach((item) => merged.set(String(item.id), item));
  return [...merged.values()];
}

function applyFavoriteMutations(
  restaurants: FavoriteRestaurant[],
  menuItems: FavoriteMenuItem[],
  mutations: FavoriteMutation[],
): { restaurants: FavoriteRestaurant[]; menuItems: FavoriteMenuItem[] } {
  let nextRestaurants = restaurants;
  let nextMenuItems = menuItems;
  for (const mutation of mutations) {
    if (mutation.kind === "restaurant") {
      nextRestaurants = nextRestaurants.filter((item) => String(item.id) !== mutation.id);
      if (mutation.shouldFavorite && mutation.snapshot) {
        nextRestaurants = [...nextRestaurants, mutation.snapshot as FavoriteRestaurant];
      }
    } else {
      nextMenuItems = nextMenuItems.filter((item) => String(item.id) !== mutation.id);
      if (mutation.shouldFavorite && mutation.snapshot) {
        nextMenuItems = [...nextMenuItems, mutation.snapshot as FavoriteMenuItem];
      }
    }
  }
  return { restaurants: nextRestaurants, menuItems: nextMenuItems };
}

async function loadAccountFavorites(userId: string): Promise<AccountFavorites> {
  const empty: AccountFavorites = { synced: false, restaurants: [], menuItems: [], error: null };
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      return authError.name === "AuthSessionMissingError"
        ? empty
        : { ...empty, error: authError };
    }
    if (authData.user?.id !== userId) return empty;

    const [restaurantResult, itemResult] = await Promise.all([
      supabase
        .from("favorites")
        .select("restaurant_id, restaurant_snapshot, created_at")
        .eq("customer_id", userId)
        .order("created_at", { ascending: true }),
      supabase
        .from("favorite_menu_items")
        .select("menu_item_id, item_snapshot, created_at")
        .eq("customer_id", userId)
        .order("created_at", { ascending: true }),
    ]);
    if (restaurantResult.error || itemResult.error) {
      return { ...empty, error: restaurantResult.error || itemResult.error };
    }

    const restaurants = (restaurantResult.data || []).flatMap((row: any) => {
      const snapshot = row.restaurant_snapshot;
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
      return [{ ...snapshot, id: String(row.restaurant_id) } as FavoriteRestaurant];
    });
    const menuItems = (itemResult.data || []).flatMap((row: any) => {
      const snapshot = row.item_snapshot;
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
      return [{ ...snapshot, id: String(row.menu_item_id) } as FavoriteMenuItem];
    });
    return { synced: true, restaurants, menuItems, error: null };
  } catch (error) {
    return { ...empty, error };
  }
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteRestaurant[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<FavoriteMenuItem[]>([]);
  const mutationSequence = useRef(0);
  const mutationJournal = useRef<FavoriteMutation[]>([]);

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

  // Load the local cache first, then reconcile it with account-synced rows.
  useEffect(() => {
    if (!userEmail) {
      setFavorites([]);
      setFavoriteItems([]);
      setLoadedFor(null);
      return;
    }

    const localRestaurants = readLocalFavorites<FavoriteRestaurant>(`favorites_${userEmail}`);
    const localItems = readLocalFavorites<FavoriteMenuItem>(`favorite_items_${userEmail}`);
    setFavorites(localRestaurants);
    setFavoriteItems(localItems);
    setLoadedFor(userEmail);

    const userId = user?.id;
    if (!isUuid(userId)) return;
    let cancelled = false;
    const sequenceAtLoad = mutationSequence.current;

    void loadAccountFavorites(userId).then(async (accountFavorites) => {
      if (cancelled) return;
      if (!accountFavorites.synced) {
        if (accountFavorites.error) {
          console.warn("[Favorites] Account sync is unavailable; keeping this device's favorites.");
        }
        return;
      }

      const migrationKey = `favorites_account_synced_v1_${userId}`;
      let alreadyMigrated = false;
      try {
        alreadyMigrated = localStorage.getItem(migrationKey) === "true";
      } catch {
        // Without local storage, the cloud copy can still be loaded.
      }

      let nextRestaurants = alreadyMigrated
        ? accountFavorites.restaurants
        : mergeById(localRestaurants, accountFavorites.restaurants);
      let nextItems = alreadyMigrated
        ? accountFavorites.menuItems
        : mergeById(localItems, accountFavorites.menuItems);

      const pending = readPendingFavoriteMutations(userId);
      const changedDuringLoad = mutationJournal.current.filter(
        (mutation) => mutation.userId === userId && mutation.sequence > sequenceAtLoad,
      );
      const recentByFavorite = new Map<string, FavoriteMutation>();
      [...pending, ...changedDuringLoad]
        .sort((a, b) => a.sequence - b.sequence)
        .forEach((mutation) => {
          recentByFavorite.set(`${mutation.kind}:${mutation.id}`, mutation);
          mutationSequence.current = Math.max(mutationSequence.current, mutation.sequence);
        });
      const recentMutations = [...recentByFavorite.values()];
      const reconciled = applyFavoriteMutations(nextRestaurants, nextItems, recentMutations);
      nextRestaurants = reconciled.restaurants;
      nextItems = reconciled.menuItems;
      setFavorites(nextRestaurants);
      setFavoriteItems(nextItems);

      const mutationsToSync = new Map<string, FavoriteMutation>();
      if (!alreadyMigrated) {
        for (const restaurant of nextRestaurants) {
          const mutation: FavoriteMutation = {
            userId,
            kind: "restaurant",
            id: String(restaurant.id),
            shouldFavorite: true,
            snapshot: restaurant,
            sequence: -1,
            version: `migration-${String(restaurant.id)}`,
          };
          if (isUuid(mutation.id)) mutationsToSync.set(`restaurant:${mutation.id}`, mutation);
        }
        for (const item of nextItems) {
          const mutation: FavoriteMutation = {
            userId,
            kind: "menu-item",
            id: String(item.id),
            shouldFavorite: true,
            snapshot: item,
            sequence: -1,
            version: `migration-${String(item.id)}`,
          };
          if (isUuid(mutation.id)) mutationsToSync.set(`menu-item:${mutation.id}`, mutation);
        }
      }
      recentMutations.forEach((mutation) => {
        mutationsToSync.set(`${mutation.kind}:${mutation.id}`, mutation);
      });

      const syncs = await Promise.all([...mutationsToSync.values()].map(async (mutation) => {
        rememberPendingFavoriteMutation(mutation);
        const synced = await enqueueFavoriteMutation(mutation);
        if (synced) clearPendingFavoriteMutation(mutation);
        return synced;
      }));

      if (!cancelled && syncs.every(Boolean)) {
        try {
          localStorage.setItem(migrationKey, "true");
        } catch {
          // Sync remains idempotent if the marker cannot be kept on this device.
        }
        const reconciledThrough = mutationSequence.current;
        mutationJournal.current = mutationJournal.current.filter(
          (mutation) => mutation.userId !== userId || mutation.sequence > reconciledThrough,
        );
      }
    });

    return () => { cancelled = true; };
  }, [user?.id, userEmail]);

  // Save restaurant favorites to localStorage whenever they change
  useEffect(() => {
    if (userEmail && loadedFor === userEmail) {
      try {
        localStorage.setItem(`favorites_${userEmail}`, JSON.stringify(favorites));
      } catch {
        // Keep favorite toggles responsive if storage is temporarily unavailable.
      }
    }
  }, [favorites, userEmail, loadedFor]);

  // Save menu item favorites to localStorage whenever they change
  useEffect(() => {
    if (userEmail && loadedFor === userEmail) {
      try {
        localStorage.setItem(`favorite_items_${userEmail}`, JSON.stringify(favoriteItems));
      } catch {
        // Keep favorite toggles responsive if storage is temporarily unavailable.
      }
    }
  }, [favoriteItems, userEmail, loadedFor]);

  const recordFavoriteChange = (
    kind: FavoriteMutation["kind"],
    id: number | string,
    shouldFavorite: boolean,
    snapshot?: FavoriteRestaurant | FavoriteMenuItem,
  ) => {
    const userId = user?.id;
    const favoriteId = String(id);
    if (!isUuid(userId) || !isUuid(favoriteId)) return;
    const sequence = ++mutationSequence.current;
    const mutation: FavoriteMutation = {
      userId,
      kind,
      id: favoriteId,
      shouldFavorite,
      snapshot,
      sequence,
      version: `${Date.now()}-${sequence}`,
    };
    mutationJournal.current = [...mutationJournal.current, mutation].slice(-100);
    void persistFavoriteMutationWithRetry(mutation);
  };

  // --- Restaurant favorites ---
  const toggleFavorite = (restaurant: FavoriteRestaurant) => {
    const exists = favorites.some((item) => String(item.id) === String(restaurant.id));
    const next = exists
      ? favorites.filter((item) => String(item.id) !== String(restaurant.id))
      : [...favorites, restaurant];
    setFavorites(next);
    recordFavoriteChange("restaurant", restaurant.id, !exists, restaurant);
  };

  const isFavorite = (restaurantId: number | string) => {
    return favorites.some((item) => String(item.id) === String(restaurantId));
  };

  const getTotalFavorites = () => {
    return favorites.length;
  };

  // --- Menu item favorites ---
  const toggleFavoriteItem = (item: FavoriteMenuItem) => {
    const exists = favoriteItems.some((favorite) => String(favorite.id) === String(item.id));
    const next = exists
      ? favoriteItems.filter((favorite) => String(favorite.id) !== String(item.id))
      : [...favoriteItems, item];
    setFavoriteItems(next);
    recordFavoriteChange("menu-item", item.id, !exists, item);
  };

  const isFavoriteItem = (itemId: number | string) => {
    return favoriteItems.some((item) => String(item.id) === String(itemId));
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
