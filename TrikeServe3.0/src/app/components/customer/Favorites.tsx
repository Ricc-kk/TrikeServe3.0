import { useState } from "react";
import { Heart, Home as HomeIcon, ShoppingCart, MessageCircle, ClipboardList, User, ArrowLeft, Star } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { usePreviousPage } from "../../hooks/usePreviousPage";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import BottomNav from "../ui/BottomNav";
import { useFavorites } from "../../contexts/FavoritesContext";
import { useCart } from "../../contexts/CartContext"

export default function Favorites() {
  const navigate = useNavigate();
  // A bare navigate(-1) walks a cold deep link straight out of the app,
  // because there is no history entry before it to return to.
  const goBack = usePreviousPage("/customer");
  const { favorites, toggleFavorite, favoriteItems, toggleFavoriteItem, getTotalFavorites, getTotalFavoriteItems } = useFavorites();
  const { getTotalItems } = useCart();
  const [activeTab, setActiveTab] = useState<"restaurants" | "items">("restaurants");

  return (
    <div className="min-h-screen bg-surface pb-20">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-3 sticky top-0 bg-surface z-50">
        <button
          onClick={goBack}
          className="active:scale-90 transition-transform"
        >
          <ArrowLeft className="w-6 h-6 text-[var(--ink)]" />
        </button>
        <h1 className="text-xl font-bold text-[var(--ink)] flex-1">My Favorites</h1>
        <div className="w-8 h-8 bg-[var(--primary)]/10 rounded-full flex items-center justify-center">
          <span className="text-sm font-bold text-[var(--primary)]">{getTotalFavorites() + getTotalFavoriteItems()}</span>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex gap-2 bg-[var(--muted)] rounded-2xl p-1.5">
          <button
            onClick={() => setActiveTab("restaurants")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === "restaurants"
                ? "bg-surface text-[var(--primary)] shadow-md"
                : "text-[var(--muted-foreground)]"
            }`}
          >
            Restaurants ({getTotalFavorites()})
          </button>
          <button
            onClick={() => setActiveTab("items")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === "items"
                ? "bg-surface text-[var(--primary)] shadow-md"
                : "text-[var(--muted-foreground)]"
            }`}
          >
            Menu Items ({getTotalFavoriteItems()})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        {/* Restaurants Tab */}
        {activeTab === "restaurants" && (
          favorites.length > 0 ? (
            <div className="space-y-4">
              {favorites.map((restaurant) => (
                <div
                  key={restaurant.id}
                  className="bg-surface border border-line rounded-2xl overflow-hidden active:scale-[0.98] transition-transform"
                >
                  {/* Restaurant Image */}
                  <div className="relative h-48">
                    <ImageWithFallback
                      src={restaurant.image}
                      alt={restaurant.name}
                      className="w-full h-full object-cover"
                    />
                    {/* Heart Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(restaurant);
                      }}
                      className="absolute top-3 right-3 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-lg"
                    >
                      <Heart className="w-5 h-5 text-[var(--primary)] fill-[var(--primary)]" />
                    </button>
                  </div>

                  {/* Restaurant Info */}
                  <button
                    onClick={() => navigate(`/customer/restaurant-detail?id=${restaurant.id}&name=${encodeURIComponent(restaurant.name)}`)}
                    className="w-full p-4 text-left"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-bold text-[var(--ink)] text-base mb-1">
                          {restaurant.name}
                        </h3>
                        <p className="text-sm text-[var(--muted-foreground)]">{restaurant.category}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-[var(--muted-foreground)]">
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 fill-[var(--amber)] text-[var(--amber)]" />
                        <span className="font-semibold text-[var(--ink)]">{restaurant.rating}</span>
                        <span>({restaurant.reviews})</span>
                      </div>
                      <span>•</span>
                      <span>{restaurant.distance}</span>
                      <span>•</span>
                      <span>{restaurant.estimatedTime}</span>
                    </div>

                    {restaurant.priceRange && (
                      <div className="mt-2">
                        <span className="text-sm font-semibold text-[var(--success)]">{restaurant.priceRange}</span>
                      </div>
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-24 h-24 bg-[var(--muted)] rounded-full flex items-center justify-center mb-4">
                <Heart className="w-12 h-12 text-[var(--border)]" />
              </div>
              <h3 className="text-xl font-bold text-[var(--ink)] mb-2">No favorite restaurants yet</h3>
              <p className="text-[var(--muted-foreground)] text-center mb-6">
                Tap the heart icon on a restaurant to save it here
              </p>
              <Link to="/customer/food">
                <button className="px-8 py-3 bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-bold rounded-full active:scale-95 transition-all">
                  Browse Restaurants
                </button>
              </Link>
            </div>
          )
        )}

        {/* Menu Items Tab */}
        {activeTab === "items" && (
          favoriteItems.length > 0 ? (
            <div className="space-y-3">
              {favoriteItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 bg-surface border border-line rounded-2xl p-3 active:scale-[0.98] transition-transform"
                >
                  {/* Item Image */}
                  <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
                    <ImageWithFallback
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Item Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[var(--ink)] text-sm mb-0.5 truncate">{item.name}</h4>
                    <p className="text-xs text-[var(--muted-foreground)] truncate">{item.restaurantName}</p>
                    {item.description && (
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5 line-clamp-1">{item.description}</p>
                    )}
                    <p className="text-sm font-bold text-[var(--ink)] mt-1">
                      <span className="text-xs">₱</span>{item.price.toFixed(2)}
                    </p>
                  </div>

                  {/* Heart Button */}
                  <button
                    onClick={() => toggleFavoriteItem(item)}
                    className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-md flex-shrink-0"
                  >
                    <Heart className="w-5 h-5 text-[var(--primary)] fill-[var(--primary)]" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-24 h-24 bg-[var(--muted)] rounded-full flex items-center justify-center mb-4">
                <Heart className="w-12 h-12 text-[var(--border)]" />
              </div>
              <h3 className="text-xl font-bold text-[var(--ink)] mb-2">No favorite items yet</h3>
              <p className="text-[var(--muted-foreground)] text-center mb-6">
                Tap the heart icon on a menu item to save it here
              </p>
              <Link to="/customer/food">
                <button className="px-8 py-3 bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-bold rounded-full active:scale-95 transition-all">
                  Browse Restaurants
                </button>
              </Link>
            </div>
          )
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
