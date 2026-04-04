import { useState, useEffect } from "react";
import { ArrowLeft, Heart, Users, Calendar, Share2, Clock, Star, MapPin, ChevronDown, ChevronRight, Home as HomeIcon, ShoppingCart, MessageCircle, ClipboardList, User, Search, BadgeCheck, X, Check } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { useCart } from "../../contexts/CartContext";
import { useFavorites } from "../../contexts/FavoritesContext";
import CustomizationModal, { MenuItem as CustomizableMenuItem, CustomizationGroup } from "./CustomizationModal";

interface MenuItem extends CustomizableMenuItem {
  available: boolean;
}

interface Review {
  id: number;
  author: string;
  rating: number;
  text: string;
  date: string;
  helpful: number;
}

interface RestaurantData {
  name: string;
  subtitle: string;
  logo: string;
  image: string;
  heroImage: string;
  rating: number;
  ratingCount: number;
  deliveryFee: number;
  originalFee: number;
  deliveryTime: string;
  verified: boolean;
  goodService: boolean;
  categories: { id: string; name: string }[];
  menuItems: MenuItem[];
  reviews: Review[];
}

export default function RestaurantDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const restaurantId = searchParams.get("id");
  const restaurantName = searchParams.get("name") || "Restaurant";
  const { addToCart: addItemToCart, getTotalItems } = useCart();
  const { toggleFavorite, isFavorite: checkIsFavorite } = useFavorites();
  
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showRatingsModal, setShowRatingsModal] = useState(false);
  const [showCustomizationModal, setShowCustomizationModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  // Scroll detection
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 200);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Restaurant-specific data - Load from localStorage
  const getRestaurantData = (name: string): RestaurantData => {
    // Find business user by ID (email) or name
    const usersData = localStorage.getItem('trikeserve_users');
    if (usersData) {
      try {
        const users = JSON.parse(usersData);
        // First try to find by ID (email) if restaurantId is provided
        let business = restaurantId 
          ? users.find((u: any) => u.role === 'business' && u.isVerified && u.email === restaurantId)
          : null;
        
        // Fallback to finding by name if ID not found
        if (!business) {
          business = users.find((u: any) => 
            u.role === 'business' && 
            u.isVerified && 
            (u.businessName === name || u.name === name)
          );
        }
        
        if (business) {
          // Load restaurant data
          const restaurantDataKey = `restaurantData_${business.email}`;
          const savedRestaurantData = localStorage.getItem(restaurantDataKey);
          const restaurantData = savedRestaurantData ? JSON.parse(savedRestaurantData) : {};
          
          // Load menu items
          const menuItemsKey = `menuItems_${business.email}`;
          const savedMenuItems = localStorage.getItem(menuItemsKey);
          const menuItems = savedMenuItems ? JSON.parse(savedMenuItems) : [];
          
          // Extract unique categories from menu items
          const categoriesSet = new Set(menuItems.map((item: any) => item.category));
          const categories = [
            { id: "all", name: "All Items" },
            ...Array.from(categoriesSet).map((cat: any) => ({ id: cat, name: cat }))
          ];
          
          return {
            name: restaurantData.name || business.businessName || name,
            subtitle: restaurantData.subtitle || business.businessAddress || "Tagalag",
            logo: restaurantData.logo || "🍽️",
            image: restaurantData.heroImage || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800",
            heroImage: restaurantData.heroImage || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800",
            rating: restaurantData.rating || 0,
            ratingCount: restaurantData.ratingCount || 0,
            deliveryFee: restaurantData.deliveryFee || 35,
            originalFee: 70,
            deliveryTime: restaurantData.deliveryTime || "25-35 min",
            verified: true,
            goodService: true,
            categories,
            menuItems: menuItems.map((item: any) => ({
              ...item,
              badge: item.badge || undefined
            })),
            reviews: []
          };
        }
      } catch (error) {
        console.error('Error loading restaurant data:', error);
      }
    }
    
    // Fallback to dummy data map if business not found
    const restaurantDataMap: { [key: string]: RestaurantData } = {
      "Jollibee": {
        name: "Jollibee",
        subtitle: "Valenzuela Branch",
        logo: "🍔",
        image: "https://images.unsplash.com/photo-1688912740203-2c595a6f7429?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYXN0JTIwZm9vZCUyMGJ1cmdlciUyMGZyaWVzfGVufDF8fHx8MTc3Mzc3ODE0Mnww&ixlib=rb-4.1.0&q=80&w=1080",
        heroImage: "https://images.unsplash.com/photo-1561758033-d89a9ad46330?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYXN0JTIwZm9vZCUyMGZyaWVzfGVufDF8fHx8MTc3Mzc3ODE0Mnww&ixlib=rb-4.1.0&q=80&w=1080",
        rating: 4.7,
        ratingCount: 9000,
        deliveryFee: 29.00,
        originalFee: 70.00,
        deliveryTime: "20-30 min",
        verified: true,
        goodService: true,
        categories: [
          { id: "all", name: "All Items" },
          { id: "snacks", name: "Royal SNACKulitan" },
          { id: "meals", name: "Family Super Meals" },
          { id: "breakfast", name: "Breakfast" },
          { id: "burgers", name: "Burgers & Sandwiches" },
          { id: "chicken", name: "Chickenjoy" },
          { id: "drinks", name: "Drinks & Desserts" }
        ],
        menuItems: [
          {
            id: 1,
            name: "Yumburger Solo",
            description: "Classic beef burger with special dressing",
            price: 49.00,
            image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxidXJnZXIlMjBzb2xvfGVufDF8fHx8MTczNzU1MDAwMHww&ixlib=rb-4.1.0&q=80&w=400",
            category: "burgers",
            badge: "most-ordered",
            available: true,
            customizationGroups: [
              {
                id: 1,
                name: "Choose your Drink - Pick 1",
                required: true,
                minSelections: 1,
                maxSelections: 1,
                options: [
                  { id: 1, name: "Coke", price: 0 },
                  { id: 2, name: "Sprite", price: 0 },
                  { id: 3, name: "Royal", price: 0 },
                  { id: 4, name: "Pineapple Juice", price: 10 },
                  { id: 5, name: "Iced Tea", price: 5 }
                ]
              },
              {
                id: 2,
                name: "Add Extras",
                required: false,
                minSelections: 0,
                maxSelections: 3,
                options: [
                  { id: 6, name: "Extra Patty", price: 25 },
                  { id: 7, name: "Cheese", price: 15 },
                  { id: 8, name: "Bacon", price: 20 },
                  { id: 9, name: "Egg", price: 15 }
                ]
              }
            ]
          },
          {
            id: 2,
            name: "8 - pc. Chickenjoy Solo",
            description: "8 pieces of crispy fried chicken",
            price: 662.00,
            image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmcmllZCUyMGNoaWNrZW4lMjBidWNrZXR8ZW58MXx8fHwxNzM3NTUwMDAwfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "chicken",
            badge: "most-liked",
            available: true
          },
          {
            id: 3,
            name: "6 - pc. Chickenjoy Solo",
            description: "6 pieces of crispy fried chicken",
            price: 522.00,
            image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmcmllZCUyMGNoaWNrZW4lMjBidWNrZXR8ZW58MXx8fHwxNzM3NTUwMDAwfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "chicken",
            badge: "most-liked",
            available: true
          },
          {
            id: 4,
            name: "6 - pc. Chickenjoy w/ Rice, Jolly Spaghetti & Drinks",
            description: "Complete family meal combo",
            price: 802.00,
            image: "https://images.unsplash.com/photo-1632778149955-e80f8ceca2e8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYW1pbHklMjBtZWFsJTIwY2hpY2tlbnxlbnwxfHx8fDE3Mzc1NTAwMDB8MA&ixlib=rb-4.1.0&q=80&w=400",
            category: "meals",
            available: true
          },
          {
            id: 5,
            name: "1 - pc. Chickenjoy w/ Rice",
            description: "Single piece chicken with rice",
            price: 105.00,
            image: "https://images.unsplash.com/photo-1598103442097-8b74394b95c6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmcmllZCUyMGNoaWNrZW4lMjByaWNlfGVufDF8fHx8MTczNzU1MDAwMHww&ixlib=rb-4.1.0&q=80&w=400",
            category: "meals",
            badge: "most-ordered",
            available: true,
            customizationGroups: [
              {
                id: 3,
                name: "Choose your Drink 1/3 - Pick 1",
                required: true,
                minSelections: 1,
                maxSelections: 1,
                options: [
                  { id: 10, name: "Coke", price: 0 },
                  { id: 11, name: "Sprite", price: 0 },
                  { id: 12, name: "Pineapple Juice", price: 10 }
                ]
              },
              {
                id: 4,
                name: "Add Side Dish",
                required: false,
                minSelections: 0,
                maxSelections: 2,
                options: [
                  { id: 13, name: "Jolly Spaghetti", price: 45 },
                  { id: 14, name: "Fries", price: 35 },
                  { id: 15, name: "Mashed Potato", price: 30 }
                ]
              }
            ]
          },
          {
            id: 6,
            name: "Jolly Spaghetti",
            description: "Sweet-style spaghetti with hotdog slices",
            price: 65.00,
            image: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzcGFnaGV0dGklMjBwaWxpcGlubyUyMHN3ZWV0fGVufDF8fHx8MTczNzU1MDAwMHww&ixlib=rb-4.1.0&q=80&w=400",
            category: "snacks",
            available: true
          },
          {
            id: 7,
            name: "Peach Mango Pie",
            description: "Crispy pie filled with peach mango",
            price: 35.00,
            image: "https://images.unsplash.com/photo-1587241321921-91a834d82ffc?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYW5nbyUyMHBpZXxlbnwxfHx8fDE3Mzc1NTAwMDB8MA&ixlib=rb-4.1.0&q=80&w=400",
            category: "snacks",
            badge: "signature",
            available: true
          },
          {
            id: 8,
            name: "Amazing Aloha Burger",
            description: "Burger with pineapple and special sauce",
            price: 89.00,
            image: "https://images.unsplash.com/photo-1571091718767-18b5b1457add?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaW5lYXBwbGUlMjBidXJnZXJ8ZW58MXx8fHwxNzM3NTUwMDAwfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "burgers",
            badge: "signature",
            available: true
          }
        ],
        reviews: [
          {
            id: 1,
            author: "rajanee n.",
            rating: 5,
            text: "super malaki yung mga chicken. and super bilis ng delivery wala pa sa estimated time. thank you 💯",
            date: "2 days ago",
            helpful: 12
          }
        ]
      },
      "Mang Inasal": {
        name: "Mang Inasal",
        subtitle: "Tagalag Center",
        logo: "🍗",
        image: "https://images.unsplash.com/photo-1646809156467-6e825869b29f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGNoaWNrZW4lMjBpbmFzYWwlMjBncmlsbGVkfGVufDF8fHx8MTc3MzgzMDk3MXww&ixlib=rb-4.1.0&q=80&w=1080",
        heroImage: "https://images.unsplash.com/photo-1646809156467-6e825869b29f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGNoaWNrZW4lMjBpbmFzYWwlMjBncmlsbGVkfGVufDF8fHx8MTc3MzgzMDk3MXww&ixlib=rb-4.1.0&q=80&w=1080",
        rating: 4.8,
        ratingCount: 7500,
        deliveryFee: 35.00,
        originalFee: 80.00,
        deliveryTime: "18-25 min",
        verified: true,
        goodService: true,
        categories: [
          { id: "all", name: "All Items" },
          { id: "chicken", name: "Chicken Inasal" },
          { id: "pork", name: "Pork BBQ" },
          { id: "meals", name: "Combo Meals" },
          { id: "sides", name: "Sides & Extras" },
          { id: "drinks", name: "Drinks" }
        ],
        menuItems: [
          {
            id: 1,
            name: "Chicken Inasal - Paa (Leg)",
            description: "Grilled marinated chicken leg with unlimited rice",
            price: 135.00,
            image: "https://images.unsplash.com/photo-1646809156467-6e825869b29f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGNoaWNrZW4lMjBpbmFzYWwlMjBncmlsbGVkfGVufDF8fHx8MTc3MzgzMDk3MXww&ixlib=rb-4.1.0&q=80&w=400",
            category: "chicken",
            badge: "most-ordered",
            available: true
          },
          {
            id: 2,
            name: "Chicken Inasal - Pecho (Breast)",
            description: "Grilled marinated chicken breast with unlimited rice",
            price: 155.00,
            image: "https://images.unsplash.com/photo-1646809156467-6e825869b29f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGNoaWNrZW4lMjBpbmFzYWwlMjBncmlsbGVkfGVufDF8fHx8MTc3MzgzMDk3MXww&ixlib=rb-4.1.0&q=80&w=400",
            category: "chicken",
            badge: "most-liked",
            available: true
          },
          {
            id: 3,
            name: "Pork BBQ - 2 sticks",
            description: "Grilled pork barbecue skewers with rice",
            price: 120.00,
            image: "https://images.unsplash.com/photo-1663436298724-d8244e27688b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGloYXclMjBncmlsbGVkJTIwYmFyYmVjdWV8ZW58MXx8fHwxNzczODMyMDExfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "pork",
            available: true
          },
          {
            id: 4,
            name: "Palabok Family Size",
            description: "Filipino-style noodles with shrimp sauce",
            price: 245.00,
            image: "https://images.unsplash.com/photo-1612224331030-a68a5f0d4b6a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaGlsaXBwaW5lJTIwbm9vZGxlc3xlbnwxfHx8fDE3Mzc1NTAwMDB8MA&ixlib=rb-4.1.0&q=80&w=400",
            category: "sides",
            available: true
          },
          {
            id: 5,
            name: "PM1 - Paa with Drinks",
            description: "Chicken inasal leg with rice and softdrinks",
            price: 165.00,
            image: "https://images.unsplash.com/photo-1646809156467-6e825869b29f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGNoaWNrZW4lMjBpbmFzYWwlMjBncmlsbGVkfGVufDF8fHx8MTc3MzgzMDk3MXww&ixlib=rb-4.1.0&q=80&w=400",
            category: "meals",
            badge: "most-ordered",
            available: true
          },
          {
            id: 6,
            name: "Halo-Halo",
            description: "Classic Filipino dessert with mixed ingredients",
            price: 55.00,
            image: "https://images.unsplash.com/photo-1752245055475-8b7c3b4756ac?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGRlc3NlcnQlMjBzd2VldHxlbnwxfHx8fDE3NzM4MzIwMTV8MA&ixlib=rb-4.1.0&q=80&w=400",
            category: "drinks",
            badge: "signature",
            available: true
          }
        ],
        reviews: [
          {
            id: 1,
            author: "Maria S.",
            rating: 5,
            text: "Ang sarap ng inasal! Lasa mo talaga yung grill marks. Busog na busog kami sa unlimited rice!",
            date: "1 day ago",
            helpful: 15
          }
        ]
      },
      "Tapsihan ni Kuya": {
        name: "Tapsihan ni Kuya",
        subtitle: "Tagalag Specialties",
        logo: "🥩",
        image: "https://images.unsplash.com/photo-1642208238991-d13e9f25d4b3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMHNpbG9nJTIwYnJlYWtmYXN0JTIwdGFwYXxlbnwxfHx8fDE3NzM4MzIwMTB8MA&ixlib=rb-4.1.0&q=80&w=1080",
        heroImage: "https://images.unsplash.com/photo-1642208238991-d13e9f25d4b3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMHNpbG9nJTIwYnJlYWtmYXN0JTIwdGFwYXxlbnwxfHx8fDE3NzM4MzIwMTB8MA&ixlib=rb-4.1.0&q=80&w=1080",
        rating: 4.9,
        ratingCount: 3200,
        deliveryFee: 25.00,
        originalFee: 60.00,
        deliveryTime: "15-22 min",
        verified: true,
        goodService: true,
        categories: [
          { id: "all", name: "All Items" },
          { id: "tapsilog", name: "Tapsilog Meals" },
          { id: "breakfast", name: "Silog Meals" },
          { id: "merienda", name: "Merienda" },
          { id: "drinks", name: "Drinks" }
        ],
        menuItems: [
          {
            id: 1,
            name: "Tapsilog Special",
            description: "Beef tapa with garlic rice and fried egg",
            price: 95.00,
            image: "https://images.unsplash.com/photo-1642208238991-d13e9f25d4b3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMHNpbG9nJTIwYnJlYWtmYXN0JTIwdGFwYXxlbnwxfHx8fDE3NzM4MzIwMTB8MA&ixlib=rb-4.1.0&q=80&w=400",
            category: "tapsilog",
            badge: "most-ordered",
            available: true
          },
          {
            id: 2,
            name: "Longsilog",
            description: "Filipino sausage with garlic rice and egg",
            price: 85.00,
            image: "https://images.unsplash.com/photo-1626200419199-391ae4be7a41?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmaWxpcGlubyUyMGxvbmdhbmlzYSUyMHNhdXNhZ2V8ZW58MXx8fHwxNzM3NTUwMDAwfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "breakfast",
            badge: "most-liked",
            available: true
          },
          {
            id: 3,
            name: "Tocilog",
            description: "Sweet cured pork with garlic rice and egg",
            price: 90.00,
            image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaGlsaXBwaW5lJTIwdG9jaW5vfGVufDF8fHx8MTczNzU1MDAwMHww&ixlib=rb-4.1.0&q=80&w=400",
            category: "breakfast",
            available: true
          },
          {
            id: 4,
            name: "Bangsilog",
            description: "Fried milkfish with garlic rice and egg",
            price: 110.00,
            image: "https://images.unsplash.com/photo-1559847844-5315695dadae?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmaWxpcGlubyUyMGZyaWVkJTIwZmlzaCUyMGJhbmd1c3xlbnwxfHx8fDE3Mzc1NTAwMDB8MA&ixlib=rb-4.1.0&q=80&w=400",
            category: "breakfast",
            badge: "signature",
            available: true
          },
          {
            id: 5,
            name: "Sisigsilog",
            description: "Sizzling sisig with garlic rice and egg",
            price: 105.00,
            image: "https://images.unsplash.com/photo-1626200409628-b4a99da3090a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmaWxpcGlubyUyMHNpc2lnfGVufDF8fHx8MTczNzU1MDAwMHww&ixlib=rb-4.1.0&q=80&w=400",
            category: "tapsilog",
            badge: "most-liked",
            available: true
          },
          {
            id: 6,
            name: "Barako Coffee",
            description: "Strong local black coffee",
            price: 35.00,
            image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxibGFjayUyMGNvZmZlZXxlbnwxfHx8fDE3Mzc1NTAwMDB8MA&ixlib=rb-4.1.0&q=80&w=400",
            category: "drinks",
            available: true
          }
        ],
        reviews: [
          {
            id: 1,
            author: "John R.",
            rating: 5,
            text: "Ang sarap ng tapa! Hindi matapang, soft and flavorful. Sulit na sulit!",
            date: "3 days ago",
            helpful: 20
          }
        ]
      },
      "Ihaw-Ihaw Express": {
        name: "Ihaw-Ihaw Express",
        subtitle: "Grilled Favorites",
        logo: "🍢",
        image: "https://images.unsplash.com/photo-1663436298724-d8244e27688b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGloYXclMjBncmlsbGVkJTIwYmFyYmVjdWV8ZW58MXx8fHwxNzczODMyMDExfDA&ixlib=rb-4.1.0&q=80&w=1080",
        heroImage: "https://images.unsplash.com/photo-1663436298724-d8244e27688b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGloYXclMjBncmlsbGVkJTIwYmFyYmVjdWV8ZW58MXx8fHwxNzczODMyMDExfDA&ixlib=rb-4.1.0&q=80&w=1080",
        rating: 4.6,
        ratingCount: 4200,
        deliveryFee: 40.00,
        originalFee: 85.00,
        deliveryTime: "25-35 min",
        verified: true,
        goodService: true,
        categories: [
          { id: "all", name: "All Items" },
          { id: "bbq", name: "BBQ & Grills" },
          { id: "seafood", name: "Seafood" },
          { id: "combos", name: "Combo Meals" },
          { id: "sides", name: "Sides" }
        ],
        menuItems: [
          {
            id: 1,
            name: "Pork BBQ - 3 sticks",
            description: "Grilled pork skewers with special sauce",
            price: 150.00,
            image: "https://images.unsplash.com/photo-1663436298724-d8244e27688b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGloYXclMjBncmlsbGVkJTIwYmFyYmVjdWV8ZW58MXx8fHwxNzczODMyMDExfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "bbq",
            badge: "most-ordered",
            available: true
          },
          {
            id: 2,
            name: "Chicken Inasal",
            description: "Grilled chicken marinated in local spices",
            price: 130.00,
            image: "https://images.unsplash.com/photo-1646809156467-6e825869b29f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGNoaWNrZW4lMjBpbmFzYWwlMjBncmlsbGVkfGVufDF8fHx8MTc3MzgzMDk3MXww&ixlib=rb-4.1.0&q=80&w=400",
            category: "bbq",
            badge: "most-liked",
            available: true
          },
          {
            id: 3,
            name: "Liempo - 300g",
            description: "Grilled pork belly with unlimited rice",
            price: 180.00,
            image: "https://images.unsplash.com/photo-1600891964599-f61ba0e24092?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxncmlsbGVkJTIwcG9yayUyMGJlbGx5fGVufDF8fHx8MTczNzU1MDAwMHww&ixlib=rb-4.1.0&q=80&w=400",
            category: "bbq",
            badge: "signature",
            available: true
          },
          {
            id: 4,
            name: "Grilled Bangus",
            description: "Whole grilled milkfish stuffed with tomatoes",
            price: 160.00,
            image: "https://images.unsplash.com/photo-1559847844-5315695dadae?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmaWxpcGlubyUyMGZyaWVkJTIwZmlzaCUyMGJhbmd1c3xlbnwxfHx8fDE3Mzc1NTAwMDB8MA&ixlib=rb-4.1.0&q=80&w=400",
            category: "seafood",
            available: true
          },
          {
            id: 5,
            name: "Ihaw-Ihaw Platter",
            description: "Mixed grill platter - pork, chicken & seafood",
            price: 350.00,
            image: "https://images.unsplash.com/photo-1544025162-d76694265947?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxncmlsbCUyMHBsYXR0ZXJ8ZW58MXx8fHwxNzM3NTUwMDAwfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "combos",
            badge: "most-ordered",
            available: true
          }
        ],
        reviews: [
          {
            id: 1,
            author: "Carlo M.",
            rating: 5,
            text: "Ang laki ng serving! Sulit na sulit. Sarap ng liempo!",
            date: "5 days ago",
            helpful: 18
          }
        ]
      },
      "Kape Alley": {
        name: "Kape Alley",
        subtitle: "Specialty Coffee & Pastries",
        logo: "☕",
        image: "https://images.unsplash.com/photo-1676089774710-08c4e747b024?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGNvZmZlZSUyMHNob3B8ZW58MXx8fHwxNzczODMyNDAxfDA&ixlib=rb-4.1.0&q=80&w=1080",
        heroImage: "https://images.unsplash.com/photo-1676089774710-08c4e747b024?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGNvZmZlZSUyMHNob3B8ZW58MXx8fHwxNzczODMyNDAxfDA&ixlib=rb-4.1.0&q=80&w=1080",
        rating: 4.5,
        ratingCount: 2800,
        deliveryFee: 30.00,
        originalFee: 65.00,
        deliveryTime: "10-18 min",
        verified: true,
        goodService: true,
        categories: [
          { id: "all", name: "All Items" },
          { id: "coffee", name: "Coffee" },
          { id: "iced", name: "Iced Drinks" },
          { id: "pastries", name: "Pastries" },
          { id: "breakfast", name: "Breakfast" }
        ],
        menuItems: [
          {
            id: 1,
            name: "Barako Coffee",
            description: "Strong local coffee from Batangas",
            price: 75.00,
            image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxibGFjayUyMGNvZmZlZXxlbnwxfHx8fDE3Mzc1NTAwMDB8MA&ixlib=rb-4.1.0&q=80&w=400",
            category: "coffee",
            badge: "signature",
            available: true
          },
          {
            id: 2,
            name: "Spanish Latte",
            description: "Creamy sweet latte with condensed milk",
            price: 95.00,
            image: "https://images.unsplash.com/photo-1517487881594-2787fef5ebf7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzcGFuaXNoJTIwbGF0dGV8ZW58MXx8fHwxNzM3NTUwMDAwfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "coffee",
            badge: "most-ordered",
            available: true
          },
          {
            id: 3,
            name: "Ube Latte",
            description: "Filipino purple yam latte",
            price: 110.00,
            image: "https://images.unsplash.com/photo-1610889556528-9a770e32642f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx1YmUlMjBsYXR0ZXxlbnwxfHx8fDE3Mzc1NTAwMDB8MA&ixlib=rb-4.1.0&q=80&w=400",
            category: "iced",
            badge: "most-liked",
            available: true
          },
          {
            id: 4,
            name: "Ensaymada",
            description: "Buttery brioche with cheese topping",
            price: 55.00,
            image: "https://images.unsplash.com/photo-1608481337062-4093bf3ed404?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaWxpcGlubyUyMHBhc3RyeXxlbnwxfHx8fDE3Mzc1NTAwMDB8MA&ixlib=rb-4.1.0&q=80&w=400",
            category: "pastries",
            available: true
          },
          {
            id: 5,
            name: "Pandesal & Coffee Set",
            description: "4pcs pandesal with brewed coffee",
            price: 85.00,
            image: "https://images.unsplash.com/photo-1595507059318-baf4e186c77f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGJha2VyeSUyMHBhbmRlc2FsfGVufDF8fHx8MTc3MzgzMjQwMXww&ixlib=rb-4.1.0&q=80&w=400",
            category: "breakfast",
            badge: "most-ordered",
            available: true
          }
        ],
        reviews: [
          {
            id: 1,
            author: "Angela P.",
            rating: 5,
            text: "Best coffee in Tagalag! Ang sarap ng ube latte nila. Will order again!",
            date: "1 day ago",
            helpful: 22
          }
        ]
      },
      "Karinderya ni Aling Nena": {
        name: "Karinderya ni Aling Nena",
        subtitle: "Lutong Bahay Daily",
        logo: "🍲",
        image: "https://images.unsplash.com/photo-1658713064117-51f51ecfaf69?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMHJlc3RhdXJhbnQlMjBmb29kfGVufDF8fHx8MTc3MzgzMjQwMnww&ixlib=rb-4.1.0&q=80&w=1080",
        heroImage: "https://images.unsplash.com/photo-1658713064117-51f51ecfaf69?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMHJlc3RhdXJhbnQlMjBmb29kfGVufDF8fHx8MTc3MzgzMjQwMnww&ixlib=rb-4.1.0&q=80&w=1080",
        rating: 4.8,
        ratingCount: 5600,
        deliveryFee: 20.00,
        originalFee: 55.00,
        deliveryTime: "12-20 min",
        verified: true,
        goodService: true,
        categories: [
          { id: "all", name: "All Items" },
          { id: "ulam", name: "Ulam" },
          { id: "sabaw", name: "Sabaw/Soup" },
          { id: "rice", name: "Rice Meals" },
          { id: "merienda", name: "Merienda" }
        ],
        menuItems: [
          {
            id: 1,
            name: "Adobong Manok",
            description: "Classic chicken adobo with rice",
            price: 75.00,
            image: "https://images.unsplash.com/photo-1626200409628-b4a99da3090a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmaWxpcGlubyUyMHNpc2lnfGVufDF8fHx8MTczNzU1MDAwMHww&ixlib=rb-4.1.0&q=80&w=400",
            category: "ulam",
            badge: "most-ordered",
            available: true
          },
          {
            id: 2,
            name: "Sinigang na Baboy",
            description: "Pork in sour tamarind soup",
            price: 85.00,
            image: "https://images.unsplash.com/photo-1612224331030-a68a5f0d4b6a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaGlsaXBwaW5lJTIwbm9vZGxlc3xlbnwxfHx8fDE3Mzc1NTAwMDB8MA&ixlib=rb-4.1.0&q=80&w=400",
            category: "sabaw",
            badge: "most-liked",
            available: true
          },
          {
            id: 3,
            name: "Ginisang Monggo",
            description: "Sautéed mung beans with pork",
            price: 65.00,
            image: "https://images.unsplash.com/photo-1546833998-877b37c2e5c6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiZWFucyUyMHN0ZXd8ZW58MXx8fHwxNzM3NTUwMDAwfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "ulam",
            available: true
          },
          {
            id: 4,
            name: "Menudo",
            description: "Pork & liver in tomato sauce",
            price: 80.00,
            image: "https://images.unsplash.com/photo-1658713064117-51f51ecfaf69?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMHJlc3RhdXJhbnQlMjBmb29kfGVufDF8fHx8MTc3MzgzMjQwMnww&ixlib=rb-4.1.0&q=80&w=400",
            category: "ulam",
            badge: "signature",
            available: true
          },
          {
            id: 5,
            name: "Tinola",
            description: "Chicken ginger soup with papaya",
            price: 70.00,
            image: "https://images.unsplash.com/photo-1612224331030-a68a5f0d4b6a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaGlsaXBwaW5lJTIwbm9vZGxlc3xlbnwxfHx8fDE3Mzc1NTAwMDB8MA&ixlib=rb-4.1.0&q=80&w=400",
            category: "sabaw",
            available: true
          }
        ],
        reviews: [
          {
            id: 1,
            author: "Elena R.",
            rating: 5,
            text: "Lasang luto ng nanay! Sobrang authentic ng lasa. Highly recommended!",
            date: "2 days ago",
            helpful: 25
          }
        ]
      },
      "Panaderia Tagalag": {
        name: "Panaderia Tagalag",
        subtitle: "Fresh Pandesal & Pan de Coco",
        logo: "🥐",
        image: "https://images.unsplash.com/photo-1595507059318-baf4e186c77f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGJha2VyeSUyMHBhbmRlc2FsfGVufDF8fHx8MTc3MzgzMjQwMXww&ixlib=rb-4.1.0&q=80&w=1080",
        heroImage: "https://images.unsplash.com/photo-1595507059318-baf4e186c77f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGJha2VyeSUyMHBhbmRlc2FsfGVufDF8fHx8MTc3MzgzMjQwMXww&ixlib=rb-4.1.0&q=80&w=1080",
        rating: 4.9,
        ratingCount: 4100,
        deliveryFee: 15.00,
        originalFee: 50.00,
        deliveryTime: "8-15 min",
        verified: true,
        goodService: true,
        categories: [
          { id: "all", name: "All Items" },
          { id: "bread", name: "Bread" },
          { id: "pastries", name: "Pastries" },
          { id: "cakes", name: "Cakes" }
        ],
        menuItems: [
          {
            id: 1,
            name: "Pandesal - 10pcs",
            description: "Fresh Filipino bread rolls",
            price: 40.00,
            image: "https://images.unsplash.com/photo-1595507059318-baf4e186c77f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGJha2VyeSUyMHBhbmRlc2FsfGVufDF8fHx8MTc3MzgzMjQwMXww&ixlib=rb-4.1.0&q=80&w=400",
            category: "bread",
            badge: "most-ordered",
            available: true
          },
          {
            id: 2,
            name: "Pan de Coco - 5pcs",
            description: "Sweet coconut-filled buns",
            price: 60.00,
            image: "https://images.unsplash.com/photo-1608481337062-4093bf3ed404?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaWxpcGlubyUyMHBhc3RyeXxlbnwxfHx8fDE3Mzc1NTAwMDB8MA&ixlib=rb-4.1.0&q=80&w=400",
            category: "bread",
            badge: "most-liked",
            available: true
          },
          {
            id: 3,
            name: "Ensaymada - 3pcs",
            description: "Butter brioche with cheese & sugar",
            price: 75.00,
            image: "https://images.unsplash.com/photo-1608481337062-4093bf3ed404?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaWxpcGlubyUyMHBhc3RyeXxlbnwxfHx8fDE3Mzc1NTAwMDB8MA&ixlib=rb-4.1.0&q=80&w=400",
            category: "pastries",
            badge: "signature",
            available: true
          },
          {
            id: 4,
            name: "Ube Cheese Pandesal - 6pcs",
            description: "Purple yam & cheese pandesal",
            price: 55.00,
            image: "https://images.unsplash.com/photo-1595507059318-baf4e186c77f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGJha2VyeSUyMHBhbmRlc2FsfGVufDF8fHx8MTc3MzgzMjQwMXww&ixlib=rb-4.1.0&q=80&w=400",
            category: "bread",
            available: true
          },
          {
            id: 5,
            name: "Mini Ube Cake Slice",
            description: "Purple yam sponge cake",
            price: 85.00,
            image: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx1YmUlMjBjYWtlfGVufDF8fHx8MTczNzU1MDAwMHww&ixlib=rb-4.1.0&q=80&w=400",
            category: "cakes",
            badge: "most-liked",
            available: true
          }
        ],
        reviews: [
          {
            id: 1,
            author: "Rosa T.",
            rating: 5,
            text: "Fresh pandesal every morning! Mainit pa pagdating. Perfect with coffee!",
            date: "Today",
            helpful: 30
          }
        ]
      },
      "Tusok-Tusok Street Eats": {
        name: "Tusok-Tusok Street Eats",
        subtitle: "Fishball, Kwek-Kwek & More",
        logo: "🍢",
        image: "https://images.unsplash.com/photo-1593870682262-8c9f6a9bb225?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMHN0cmVldCUyMGZvb2R8ZW58MXx8fHwxNzczODMyNDAyfDA&ixlib=rb-4.1.0&q=80&w=1080",
        heroImage: "https://images.unsplash.com/photo-1593870682262-8c9f6a9bb225?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMHN0cmVldCUyMGZvb2R8ZW58MXx8fHwxNzczODMyNDAyfDA&ixlib=rb-4.1.0&q=80&w=1080",
        rating: 4.4,
        ratingCount: 3400,
        deliveryFee: 25.00,
        originalFee: 50.00,
        deliveryTime: "10-15 min",
        verified: true,
        goodService: false,
        categories: [
          { id: "all", name: "All Items" },
          { id: "tusok", name: "Tusok-Tusok" },
          { id: "pica", name: "Pica-Pica" },
          { id: "combos", name: "Combo Meals" }
        ],
        menuItems: [
          {
            id: 1,
            name: "Fishball - 10pcs",
            description: "Classic fishballs with sweet & spicy sauce",
            price: 30.00,
            image: "https://images.unsplash.com/photo-1593870682262-8c9f6a9bb225?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMHN0cmVldCUyMGZvb2R8ZW58MXx8fHwxNzczODMyNDAyfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "tusok",
            badge: "most-ordered",
            available: true
          },
          {
            id: 2,
            name: "Kwek-Kwek - 8pcs",
            description: "Deep-fried quail eggs in orange batter",
            price: 35.00,
            image: "https://images.unsplash.com/photo-1593870682262-8c9f6a9bb225?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMHN0cmVldCUyMGZvb2R8ZW58MXx8fHwxNzczODMyNDAyfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "tusok",
            badge: "most-liked",
            available: true
          },
          {
            id: 3,
            name: "Kikiam - 5pcs",
            description: "Ground pork and vegetables wrapped",
            price: 40.00,
            image: "https://images.unsplash.com/photo-1593870682262-8c9f6a9bb225?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMHN0cmVldCUyMGZvb2R8ZW58MXx8fHwxNzczODMyNDAyfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "tusok",
            available: true
          },
          {
            id: 4,
            name: "Street Food Combo",
            description: "Fishball, kwek-kwek, kikiam & squidballs",
            price: 75.00,
            image: "https://images.unsplash.com/photo-1593870682262-8c9f6a9bb225?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMHN0cmVldCUyMGZvb2R8ZW58MXx8fHwxNzczODMyNDAyfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "combos",
            badge: "most-ordered",
            available: true
          },
          {
            id: 5,
            name: "Isaw - 5 sticks",
            description: "Grilled chicken intestines",
            price: 50.00,
            image: "https://images.unsplash.com/photo-1593870682262-8c9f6a9bb225?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMHN0cmVldCUyMGZvb2R8ZW58MXx8fHwxNzczODMyNDAyfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "pica",
            badge: "signature",
            available: true
          }
        ],
        reviews: [
          {
            id: 1,
            author: "Mark L.",
            rating: 4,
            text: "Sulit! Lasang kanto talaga. Ang sarap ng vinegar nila!",
            date: "4 days ago",
            helpful: 12
          }
        ]
      },
      "McDonald's Valenzuela": {
        name: "McDonald's Valenzuela",
        subtitle: "Fast Food Favorites",
        logo: "🍟",
        image: "https://images.unsplash.com/photo-1561758033-d89a9ad46330?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYXN0JTIwZm9vZCUyMGZyaWVzfGVufDF8fHx8MTc3Mzc3ODE0Mnww&ixlib=rb-4.1.0&q=80&w=1080",
        heroImage: "https://images.unsplash.com/photo-1561758033-d89a9ad46330?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYXN0JTIwZm9vZCUyMGZyaWVzfGVufDF8fHx8MTc3Mzc3ODE0Mnww&ixlib=rb-4.1.0&q=80&w=1080",
        rating: 4.6,
        ratingCount: 12000,
        deliveryFee: 35.00,
        originalFee: 75.00,
        deliveryTime: "22-32 min",
        verified: true,
        goodService: true,
        categories: [
          { id: "all", name: "All Items" },
          { id: "burgers", name: "Burgers" },
          { id: "chicken", name: "Chicken" },
          { id: "breakfast", name: "Breakfast" },
          { id: "sides", name: "Sides & Drinks" }
        ],
        menuItems: [
          {
            id: 1,
            name: "Big Mac",
            description: "Two all-beef patties, special sauce, lettuce",
            price: 175.00,
            image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxidXJnZXIlMjBzb2xvfGVufDF8fHx8MTczNzU1MDAwMHww&ixlib=rb-4.1.0&q=80&w=400",
            category: "burgers",
            badge: "most-ordered",
            available: true
          },
          {
            id: 2,
            name: "6-pc Chicken McNuggets",
            description: "Crispy chicken nuggets with dipping sauce",
            price: 150.00,
            image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmcmllZCUyMGNoaWNrZW4lMjBidWNrZXR8ZW58MXx8fHwxNzM3NTUwMDAwfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "chicken",
            badge: "most-liked",
            available: true
          },
          {
            id: 3,
            name: "Quarter Pounder with Cheese",
            description: "Quarter pound beef patty with cheese",
            price: 180.00,
            image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxidXJnZXIlMjBzb2xvfGVufDF8fHx8MTczNzU1MDAwMHww&ixlib=rb-4.1.0&q=80&w=400",
            category: "burgers",
            available: true
          },
          {
            id: 4,
            name: "Large Fries",
            description: "World famous McDonald's fries",
            price: 85.00,
            image: "https://images.unsplash.com/photo-1561758033-d89a9ad46330?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYXN0JTIwZm9vZCUyMGZyaWVzfGVufDF8fHx8MTc3Mzc3ODE0Mnww&ixlib=rb-4.1.0&q=80&w=400",
            category: "sides",
            badge: "signature",
            available: true
          },
          {
            id: 5,
            name: "Sausage McMuffin with Egg",
            description: "Sausage patty and egg on English muffin",
            price: 120.00,
            image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxibGFjayUyMGNvZmZlZXxlbnwxfHx8fDE3Mzc1NTAwMDB8MA&ixlib=rb-4.1.0&q=80&w=400",
            category: "breakfast",
            badge: "most-ordered",
            available: true
          }
        ],
        reviews: [
          {
            id: 1,
            author: "Kenneth V.",
            rating: 5,
            text: "Fast delivery! Food still hot. Fries are crispy!",
            date: "1 day ago",
            helpful: 16
          }
        ]
      },
      "Chowking Tagalag": {
        name: "Chowking Tagalag",
        subtitle: "Chinese Filipino Food",
        logo: "🍜",
        image: "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjaGluZXNlJTIwbm9vZGxlcyUyMHNvdXB8ZW58MXx8fHwxNzczODMyNDAyfDA&ixlib=rb-4.1.0&q=80&w=1080",
        heroImage: "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjaGluZXNlJTIwbm9vZGxlcyUyMHNvdXB8ZW58MXx8fHwxNzczODMyNDAyfDA&ixlib=rb-4.1.0&q=80&w=1080",
        rating: 4.5,
        ratingCount: 6800,
        deliveryFee: 32.00,
        originalFee: 70.00,
        deliveryTime: "20-28 min",
        verified: true,
        goodService: true,
        categories: [
          { id: "all", name: "All Items" },
          { id: "noodles", name: "Noodles" },
          { id: "dimsum", name: "Dimsum" },
          { id: "rice", name: "Rice Meals" },
          { id: "congee", name: "Congee" }
        ],
        menuItems: [
          {
            id: 1,
            name: "Beef Wanton Mami",
            description: "Noodle soup with beef and wontons",
            price: 110.00,
            image: "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjaGluZXNlJTIwbm9vZGxlcyUyMHNvdXB8ZW58MXx8fHwxNzczODMyNDAyfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "noodles",
            badge: "most-ordered",
            available: true
          },
          {
            id: 2,
            name: "Pork Chao Fan",
            description: "Chinese-style fried rice with pork",
            price: 95.00,
            image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmcmllZCUyMHJpY2V8ZW58MXx8fHwxNzM3NTUwMDAwfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "rice",
            badge: "most-liked",
            available: true
          },
          {
            id: 3,
            name: "Siomai - 4pcs",
            description: "Steamed pork dumplings",
            price: 65.00,
            image: "https://images.unsplash.com/photo-1563245372-3823e5540e2f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkaW1zdW0lMjBkdW1wbGluZ3N8ZW58MXx8fHwxNzM3NTUwMDAwfDA&ixlib=rb-4.1.0&q=80&w=400",
            category: "dimsum",
            badge: "signature",
            available: true
          },
          {
            id: 4,
            name: "Sweet & Sour Pork",
            description: "Crispy pork in sweet and sour sauce",
            price: 140.00,
            image: "https://images.unsplash.com/photo-1626200409628-b4a99da3090a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmaWxpcGlubyUyMHNpc2lnfGVufDF8fHx8MTczNzU1MDAwMHww&ixlib=rb-4.1.0&q=80&w=400",
            category: "rice",
            available: true
          },
          {
            id: 5,
            name: "Lugaw with Tokwa't Baboy",
            description: "Rice porridge with tofu and pork",
            price: 75.00,
            image: "https://images.unsplash.com/photo-1612224331030-a68a5f0d4b6a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaGlsaXBwaW5lJTIwbm9vZGxlc3xlbnwxfHx8fDE3Mzc1NTAwMDB8MA&ixlib=rb-4.1.0&q=80&w=400",
            category: "congee",
            badge: "most-ordered",
            available: true
          }
        ],
        reviews: [
          {
            id: 1,
            author: "Patricia G.",
            rating: 5,
            text: "Always reliable! Ang sarap ng siomai at ang daming serving!",
            date: "2 days ago",
            helpful: 19
          }
        ]
      }
    };

    return restaurantDataMap[name] || restaurantDataMap["Jollibee"];
  };

  const restaurantData = getRestaurantData(restaurantName);

  // Ensure restaurantData has a reviews array
  if (!restaurantData.reviews) {
    restaurantData.reviews = [];
  }

  const handleAddToCart = (item: MenuItem) => {
    // If item has customization groups, show the customization modal
    if (item.customizationGroups && item.customizationGroups.length > 0) {
      setSelectedItem(item);
      setShowCustomizationModal(true);
    } else {
      // Add directly to cart without customizations
      addToCartWithCustomizations(item, 1, []);
    }
  };

  const addToCartWithCustomizations = (item: MenuItem, quantity: number, customizations: any[]) => {
    const restaurantInfo = {
      id: restaurantId || restaurantData.name, // Use business email as ID
      name: restaurantData.name,
      location: restaurantData.subtitle,
      distance: "1.2 km",
      time: restaurantData.deliveryTime,
      image: restaurantData.image,
      deliveryFee: restaurantData.deliveryFee
    };

    // Calculate total price with customizations
    let itemPrice = item.price;
    customizations.forEach((customization: any) => {
      itemPrice += customization.price;
    });

    addItemToCart(restaurantInfo, {
      id: item.id,
      name: item.name,
      description: item.description,
      price: itemPrice,
      quantity: quantity,
      image: item.image,
      category: item.category,
      badge: item.badge,
      customizations: customizations
    });
  };

  const filteredItems = restaurantData.menuItems.filter(item => {
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    const matchesSearch = searchQuery === "" || 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesCategory && matchesSearch;
  });

  const selectedCategoryName = restaurantData.categories.find(cat => cat.id === selectedCategory)?.name || "All Items";

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-20">
      {/* Hero Image */}
      <div className="relative h-64 bg-gradient-to-b from-[#121212] to-[#2a2a2a]">
        <ImageWithFallback
          src={restaurantData.heroImage}
          alt={restaurantData.name}
          className="w-full h-full object-cover opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        
        {/* Header Overlay */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-4">
          <button 
            onClick={() => navigate(-1)}
            className="w-11 h-11 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all"
          >
            <ArrowLeft className="w-6 h-6 text-[#121212]" />
          </button>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                toggleFavorite({
                  id: restaurantId || restaurantName,
                  name: restaurantData.name,
                  image: restaurantData.heroImage,
                  rating: restaurantData.rating,
                  reviews: restaurantData.ratingCount,
                  distance: restaurantData.subtitle,
                  estimatedTime: restaurantData.deliveryTime,
                  category: "restaurant",
                  priceRange: `₱${restaurantData.deliveryFee}`
                });
              }}
              className="w-11 h-11 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all"
            >
              <Heart className={`w-6 h-6 ${checkIsFavorite(restaurantId || restaurantName) ? 'fill-[#E11D48] text-[#E11D48]' : 'text-[#121212]'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Restaurant Info Card */}
      <div className="bg-white mx-5 -mt-6 relative z-10 rounded-3xl shadow-2xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#E11D48] to-[#BE123C] flex items-center justify-center shadow-lg flex-shrink-0">
            <span className="text-4xl">{restaurantData.logo}</span>
          </div>
          
          <div className="flex-1">
            <div className="flex items-start justify-between mb-2">
              <div>
                {restaurantData.goodService && (
                  <div className="flex items-center gap-1 text-[#18B5A4] mb-1">
                    <BadgeCheck className="w-4 h-4" />
                    <span className="text-xs font-bold">Good Service</span>
                    <ChevronRight className="w-3 h-3" />
                  </div>
                )}
                <h1 className="text-2xl font-bold text-[#121212]">{restaurantData.name}</h1>
                <p className="text-sm text-[#64748B]">- {restaurantData.subtitle}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-[#FFC107] text-[#FFC107]" />
                <span className="text-sm font-bold text-[#121212]">{restaurantData.rating}</span>
                <span className="text-xs text-[#64748B]">({restaurantData.ratingCount.toLocaleString()}+)</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#E11D48] font-bold">
                <span className="text-xs">₱</span>{restaurantData.deliveryFee.toFixed(2)}
              </span>
              <span className="text-[#94A3B8] line-through text-xs">
                <span className="text-[10px]">₱</span>{restaurantData.originalFee.toFixed(2)}
              </span>
              <span className="text-[#64748B]">• From {restaurantData.deliveryTime}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Category Header */}
      <div className={`sticky top-0 z-40 bg-white transition-all mt-4 ${isScrolled ? 'shadow-lg' : ''}`}>
        <div className="px-5 py-4 flex items-center gap-3">
          <div className="relative flex-1">
            <button
              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
              className="w-full bg-white border-2 border-[#E2E8F0] rounded-2xl px-4 py-3 flex items-center justify-between active:scale-98 transition-all"
            >
              <span className="font-bold text-[#121212] text-sm truncate">{selectedCategoryName}</span>
              <ChevronDown className={`w-5 h-5 text-[#64748B] transition-transform ${showCategoryDropdown ? 'rotate-180' : ''}`} />
            </button>
            
            {showCategoryDropdown && (
              <>
                <div 
                  className="fixed inset-0 z-40"
                  onClick={() => setShowCategoryDropdown(false)}
                />
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-[#E2E8F0] rounded-2xl shadow-2xl max-h-64 overflow-y-auto z-50">
                  {restaurantData.categories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => {
                        setSelectedCategory(category.id);
                        setShowCategoryDropdown(false);
                      }}
                      className={`w-full px-4 py-3 text-left hover:bg-[#F8F9FA] transition-colors ${
                        selectedCategory === category.id ? 'bg-[#FEF2F2] text-[#E11D48] font-bold' : 'text-[#121212]'
                      }`}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button 
            onClick={() => setShowSearchModal(true)}
            className="bg-white border-2 border-[#E2E8F0] rounded-2xl w-11 h-11 flex items-center justify-center active:scale-95 transition-all"
          >
            <Search className="w-5 h-5 text-[#121212]" />
          </button>
        </div>
      </div>

      {/* What People Say */}
      {restaurantData.reviews && restaurantData.reviews.length > 0 && (
        <div className="px-5 py-4">
          <button 
            onClick={() => setShowRatingsModal(true)}
            className="w-full text-left"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-[#121212]">What people say</h2>
              <ChevronRight className="w-6 h-6 text-[#64748B]" />
            </div>
            
            <div className="bg-white rounded-2xl p-4 shadow-sm border-2 border-[#F1F5F9] active:bg-[#F8F9FA] transition-colors">
              <p className="text-[#121212] text-sm mb-2 line-clamp-2">{restaurantData.reviews[0].text}</p>
              <div className="flex items-center gap-2">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className={`w-4 h-4 ${star <= restaurantData.reviews[0].rating ? 'fill-[#FFC107] text-[#FFC107]' : 'text-[#E2E8F0]'}`} />
                  ))}
                </div>
                <span className="text-xs text-[#64748B]">• {restaurantData.reviews[0].author}</span>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Menu Items */}
      <div className="px-5 pb-6">
        <h2 className="text-xl font-bold text-[#121212] mb-4">
          {selectedCategory === "all" ? "For You" : selectedCategoryName}
        </h2>
        
        {filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#64748B] text-lg">No items found</p>
            <p className="text-[#94A3B8] text-sm mt-2">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => (
              <Card key={item.id} className="overflow-hidden border-0 shadow-lg rounded-2xl bg-white">
                <div className="flex items-center gap-4 p-4">
                  <div className="relative w-24 h-24 flex-shrink-0 rounded-2xl overflow-hidden">
                    <ImageWithFallback
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                    {item.badge && (
                      <div className={`absolute top-2 left-2 px-2 py-1 rounded-full text-[10px] font-bold text-white ${
                        item.badge === "most-ordered" ? "bg-[#E11D48]" :
                        item.badge === "most-liked" ? "bg-[#18B5A4]" :
                        "bg-[#121212]"
                      }`}>
                        {item.badge === "most-ordered" ? "Most ordered" :
                         item.badge === "most-liked" ? "Most liked" :
                         "Signature dish"}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[#121212] text-base mb-1 line-clamp-1">{item.name}</h3>
                    {item.description && (
                      <p className="text-xs text-[#64748B] mb-2 line-clamp-2">{item.description}</p>
                    )}
                    <p className="text-lg font-bold text-[#121212]">
                      <span className="text-sm">₱</span>{item.price.toFixed(2)}
                    </p>
                  </div>

                  <button
                    onClick={() => handleAddToCart(item)}
                    className="w-11 h-11 bg-gradient-to-br from-[#E11D48] to-[#BE123C] rounded-full flex items-center justify-center shadow-lg shadow-[#E11D48]/30 active:scale-90 transition-all flex-shrink-0"
                  >
                    <span className="text-white text-2xl font-bold leading-none">+</span>
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#E2E8F0] px-4 py-3 z-50">
        <div className="max-w-6xl mx-auto grid grid-cols-5 gap-2">
          <Link to="/customer/food" className="flex flex-col items-center gap-1">
            <HomeIcon className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Home</span>
          </Link>
          <Link to="/customer/cart" className="flex flex-col items-center gap-1 relative">
            <ShoppingCart className="w-6 h-6 text-[#64748B]" />
            {getTotalItems() > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#E11D48] rounded-full flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">{getTotalItems()}</span>
              </div>
            )}
            <span className="text-xs text-[#64748B]">Cart</span>
          </Link>
          <Link to="/customer/messages" className="flex flex-col items-center gap-1">
            <MessageCircle className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Messages</span>
          </Link>
          <Link to="/customer/activity" className="flex flex-col items-center gap-1">
            <ClipboardList className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Activity</span>
          </Link>
          <Link to="/customer/account" className="flex flex-col items-center gap-1">
            <User className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Account</span>
          </Link>
        </div>
      </nav>

      {/* Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
          <div className="w-full bg-white rounded-t-3xl max-h-[85vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#E2E8F0]">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
                <input
                  type="text"
                  placeholder="Search menu items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-[#F8F9FA] rounded-2xl text-base text-[#121212] placeholder:text-[#94A3B8] border-2 border-transparent focus:border-[#E11D48] outline-none"
                  autoFocus
                />
              </div>
              <button 
                onClick={() => {
                  setShowSearchModal(false);
                  setSearchQuery("");
                }}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#F8F9FA] active:scale-90 transition-all"
              >
                <X className="w-6 h-6 text-[#64748B]" />
              </button>
            </div>
            <div className="p-5">
              <button
                onClick={() => setShowSearchModal(false)}
                className="w-full py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r from-[#E11D48] to-[#BE123C] hover:shadow-xl active:scale-95 transition-all shadow-lg shadow-[#E11D48]/30 uppercase text-sm tracking-wide"
              >
                Search
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ratings and Reviews Modal */}
      {showRatingsModal && (
        <div className="fixed inset-0 bg-white z-[2000] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-[#E2E8F0] px-5 py-4 flex items-center gap-4 z-10">
            <button 
              onClick={() => setShowRatingsModal(false)}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#F8F9FA] active:scale-90 transition-all"
            >
              <X className="w-6 h-6 text-[#121212]" />
            </button>
            <h2 className="text-xl font-bold text-[#121212]">Ratings and reviews</h2>
          </div>

          {/* Rating Summary */}
          <div className="px-5 py-6">
            <div className="bg-white border-2 border-[#E2E8F0] rounded-3xl p-6">
              <div className="flex items-start gap-6">
                {/* Overall Rating */}
                <div className="flex flex-col items-center">
                  <div className="text-5xl font-bold text-[#121212] mb-2">{restaurantData.rating}</div>
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star key={star} className={`w-5 h-5 ${star <= Math.floor(restaurantData.rating) ? 'fill-[#FFC107] text-[#FFC107]' : star <= restaurantData.rating ? 'fill-[#FFC107]/50 text-[#FFC107]/50' : 'fill-[#E2E8F0] text-[#E2E8F0]'}`} />
                    ))}
                  </div>
                  <div className="text-sm text-[#64748B]">{restaurantData.ratingCount.toLocaleString()} ratings</div>
                </div>

                {/* Rating Breakdown */}
                <div className="flex-1 space-y-2">
                  {[5, 4, 3, 2, 1].map((rating) => {
                    const percentage = rating === 5 ? 75 : rating === 4 ? 15 : rating === 3 ? 5 : rating === 2 ? 3 : 2;
                    return (
                      <div key={rating} className="flex items-center gap-2">
                        <span className="text-sm text-[#64748B] w-3">{rating}</span>
                        <div className="flex-1 h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${rating === 5 ? 'bg-[#FFC107]' : 'bg-[#E2E8F0]'}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Top Picks */}
          <div className="px-5 pb-6">
            <h3 className="text-lg font-bold text-[#121212] mb-4">Top picks</h3>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5">
              {restaurantData.menuItems.filter(item => item.badge).slice(0, 4).map((item) => (
                <div key={item.id} className="flex-shrink-0 w-32">
                  <div className="relative w-32 h-32 rounded-2xl overflow-hidden mb-2">
                    <ImageWithFallback
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex items-center gap-1 mb-1">
                    {item.badge === "most-ordered" && (
                      <>
                        <div className="w-4 h-4 bg-[#18B5A4] rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-xs font-bold text-[#18B5A4]">Most ordered</span>
                      </>
                    )}
                    {item.badge === "most-liked" && (
                      <>
                        <div className="w-4 h-4 bg-[#18B5A4] rounded-full flex items-center justify-center">
                          <Heart className="w-2.5 h-2.5 fill-white text-white" />
                        </div>
                        <span className="text-xs font-bold text-[#18B5A4]">Most liked</span>
                      </>
                    )}
                    {item.badge === "signature" && (
                      <>
                        <div className="w-4 h-4 bg-[#18B5A4] rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-xs font-bold text-[#18B5A4]">Signature dish</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm font-bold text-[#121212] line-clamp-2">{item.name}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Reviews Section */}
          <div className="px-5 pb-6">
            <h3 className="text-lg font-bold text-[#121212] mb-4">Reviews</h3>
            
            {/* AI Summary */}
            <div className="bg-[#F8F9FA] rounded-2xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-[#121212]">Summarised by AI</span>
                <div className="w-5 h-5 bg-[#18B5A4] rounded-full flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </div>
              </div>
              <p className="text-sm text-[#64748B] mb-3">
                Customers enjoy tasty, fresh food; some note order accuracy and portion size issues.
              </p>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <span className="text-sm font-bold text-[#121212]">• Taste:</span>
                  <span className="text-sm text-[#64748B]">Many enjoy the delicious taste, cheesy burgers, and crispy fries.</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-sm font-bold text-[#121212]">• Freshness:</span>
                  <span className="text-sm text-[#64748B]">Food is often fresh, with hot meals and fresh buns appreciated.</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-sm font-bold text-[#121212]">• Order accuracy:</span>
                  <span className="text-sm text-[#64748B]">Orders are sometimes incomplete or incorrect; check items upon receipt.</span>
                </div>
              </div>
            </div>

            {/* Filter Buttons */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
              <button className="px-4 py-2 bg-white border-2 border-[#18B5A4] text-[#18B5A4] rounded-full font-bold text-sm flex items-center gap-2 whitespace-nowrap">
                <span>↑↓</span>
                Most relevant
              </button>
              <button className="px-4 py-2 bg-white border-2 border-[#E2E8F0] text-[#121212] rounded-full font-bold text-sm flex items-center gap-2 whitespace-nowrap">
                Topics
                <ChevronDown className="w-4 h-4" />
              </button>
              <button className="px-4 py-2 bg-white border-2 border-[#E2E8F0] text-[#121212] rounded-full font-bold text-sm whitespace-nowrap">
                Photos
              </button>
              <button className="px-4 py-2 bg-white border-2 border-[#E2E8F0] text-[#121212] rounded-full font-bold text-sm whitespace-nowrap">
                Order type
              </button>
            </div>

            {/* Individual Reviews */}
            <div className="space-y-4">
              {restaurantData.reviews && restaurantData.reviews.length > 0 ? restaurantData.reviews.map((review) => (
                <div key={review.id} className="bg-white border-2 border-[#E2E8F0] rounded-2xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-[#E11D48] to-[#BE123C] rounded-full flex items-center justify-center text-white font-bold">
                        {review.author.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-[#121212]">{review.author}</p>
                        <div className="flex items-center gap-2">
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star key={star} className={`w-4 h-4 ${star <= review.rating ? 'fill-[#FFC107] text-[#FFC107]' : 'text-[#E2E8F0]'}`} />
                            ))}
                          </div>
                          <span className="text-xs text-[#64748B]">{review.date}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-[#121212] mb-3">{review.text}</p>
                  <button className="text-sm text-[#64748B] flex items-center gap-2">
                    <span>👍</span>
                    Helpful?
                  </button>
                </div>
              )) : (
                <div className="text-center py-12">
                  <p className="text-[#64748B]">No reviews yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Customization Modal */}
      {selectedItem && (
        <CustomizationModal
          item={selectedItem}
          isOpen={showCustomizationModal}
          onClose={() => {
            setShowCustomizationModal(false);
            setSelectedItem(null);
          }}
          onAddToCart={addToCartWithCustomizations}
        />
      )}
    </div>
  );
}
