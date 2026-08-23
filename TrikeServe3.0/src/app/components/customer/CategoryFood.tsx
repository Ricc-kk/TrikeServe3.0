import { useState } from "react";
import { ArrowLeft, MapPin, Heart, Clock, Star, Shield, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { Card } from "../ui/card";
import { ImageWithFallback } from "../figma/ImageWithFallback";

export default function CategoryFood() {
  const [searchParams] = useSearchParams();
  const categoryId = searchParams.get("category") || "silugan";
  const categoryName = searchParams.get("name") || "Silugan";
  const categoryIcon = searchParams.get("icon") || "🍳";
  
  const [searchQuery, setSearchQuery] = useState("");

  // Food items by category
  const foodItems = [
    // Silugan items
    { 
      id: 1,
      category: "silugan",
      name: "Tapsilog",
      restaurant: "Tapsihan ni Kuya",
      location: "Gen T Deleon Specialties",
      price: 85,
      image: "https://images.unsplash.com/photo-1642208238991-d13e9f25d4b3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMHNpbG9nJTIwYnJlYWtmYXN0JTIwdGFwYXxlbnwxfHx8fDE3NzM4MzIwMTB8MA&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.9,
      time: "15-22 min",
      verified: true
    },
    { 
      id: 2,
      category: "silugan",
      name: "Longsilog",
      restaurant: "Tapsihan ni Kuya",
      location: "Gen T Deleon Specialties",
      price: 90,
      image: "https://images.unsplash.com/photo-1598866594230-a7c12756260f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGxvbmdhbmlzYSUyMGJyZWFrZmFzdHxlbnwxfHx8fDE3NzM4MzQxNzB8MA&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.8,
      time: "15-22 min",
      verified: true
    },
    { 
      id: 3,
      category: "silugan",
      name: "Bangsilog",
      restaurant: "Karinderya ni Aling Nena",
      location: "Lutong Bahay Daily",
      price: 75,
      image: "https://images.unsplash.com/photo-1626083764870-8bebd3b0c5bf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGZpc2glMjBmcmllZCUyMGJyZWFrZmFzdHxlbnwxfHx8fDE3NzM4MzQxNzB8MA&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.7,
      time: "12-20 min",
      verified: true
    },
    { 
      id: 4,
      category: "silugan",
      name: "Cornsilog",
      restaurant: "Tapsihan ni Kuya",
      location: "Gen T Deleon Specialties",
      price: 95,
      image: "https://images.unsplash.com/photo-1619895092538-128341789043?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb3JuZWQlMjBiZWVmJTIwYnJlYWtmYXN0fGVufDF8fHx8MTc3MzgzNDE3MHww&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.8,
      time: "15-22 min",
      verified: true
    },
    
    // Ihawan items
    { 
      id: 5,
      category: "ihawan",
      name: "Chicken Inasal",
      restaurant: "Mang Inasal",
      location: "Gen T Deleon Center",
      price: 120,
      image: "https://images.unsplash.com/photo-1646809156467-6e825869b29f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGNoaWNrZW4lMjBpbmFzYWwlMjBncmlsbGVkfGVufDF8fHx8MTc3MzgzMDk3MXww&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.8,
      time: "18-25 min",
      verified: true
    },
    { 
      id: 6,
      category: "ihawan",
      name: "Pork BBQ (5 sticks)",
      restaurant: "Ihaw-Ihaw Express",
      location: "Grilled Favorites",
      price: 85,
      image: "https://images.unsplash.com/photo-1663436298724-d8244e27688b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGloYXclMjBncmlsbGVkJTIwYmFyYmVjdWV8ZW58MXx8fHwxNzczODMyMDExfDA&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.6,
      time: "25-35 min",
      verified: true
    },
    { 
      id: 7,
      category: "ihawan",
      name: "Liempo (250g)",
      restaurant: "Ihaw-Ihaw Express",
      location: "Grilled Favorites",
      price: 150,
      image: "https://images.unsplash.com/photo-1588168333986-5078d3ae3976?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxncmlsbGVkJTIwcG9yayUyMGJlbGx5fGVufDF8fHx8MTc3MzgzNDE3MHww&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.7,
      time: "25-35 min",
      verified: true
    },
    { 
      id: 8,
      category: "ihawan",
      name: "Grilled Bangus",
      restaurant: "Ihaw-Ihaw Express",
      location: "Grilled Favorites",
      price: 130,
      image: "https://images.unsplash.com/photo-1608314320456-3f10e3a15c8c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxncmlsbGVkJTIwZmlzaCUyMGJhbmd1c3xlbnwxfHx8fDE3NzM4MzQxNzB8MA&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.6,
      time: "25-35 min",
      verified: true
    },

    // Karinderya items
    { 
      id: 9,
      category: "karinderya",
      name: "Adobo Rice Meal",
      restaurant: "Karinderya ni Aling Nena",
      location: "Lutong Bahay Daily",
      price: 65,
      image: "https://images.unsplash.com/photo-1658713064117-51f51ecfaf69?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMHJlc3RhdXJhbnQlMjBmb29kfGVufDF8fHx8MTc3MzgzMjQwMnww&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.8,
      time: "12-20 min",
      verified: true
    },
    { 
      id: 10,
      category: "karinderya",
      name: "Sinigang na Baboy",
      restaurant: "Karinderya ni Aling Nena",
      location: "Lutong Bahay Daily",
      price: 70,
      image: "https://images.unsplash.com/photo-1576866209830-589e1218c2d0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMHNpbmluYWdhbmclMjBzb3VwfGVufDF8fHx8MTc3MzgzNDE3MHww&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.9,
      time: "12-20 min",
      verified: true
    },
    { 
      id: 11,
      category: "karinderya",
      name: "Bicol Express",
      restaurant: "Karinderya ni Aling Nena",
      location: "Lutong Bahay Daily",
      price: 75,
      image: "https://images.unsplash.com/photo-1626790680787-de5e9a07bcf2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGJpY29sJTIwZXhwcmVzcyUyMHNwaWN5fGVufDF8fHx8MTc3MzgzNDE3MHww&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.7,
      time: "12-20 min",
      verified: true
    },
    { 
      id: 12,
      category: "karinderya",
      name: "Pinakbet",
      restaurant: "Karinderya ni Aling Nena",
      location: "Lutong Bahay Daily",
      price: 60,
      image: "https://images.unsplash.com/photo-1626790680787-de5e9a07bcf2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMHZlZ2V0YWJsZSUyMGRpc2h8ZW58MXx8fHwxNzczODM0MTcwfDA&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.6,
      time: "12-20 min",
      verified: true
    },

    // Kape items
    { 
      id: 13,
      category: "kape",
      name: "Barako Coffee",
      restaurant: "Kape Alley",
      location: "Specialty Coffee & Pastries",
      price: 65,
      image: "https://images.unsplash.com/photo-1676089774710-08c4e747b024?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGNvZmZlZSUyMHNob3B8ZW58MXx8fHwxNzczODMyNDAxfDA&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.5,
      time: "10-18 min",
      verified: true
    },
    { 
      id: 14,
      category: "kape",
      name: "Iced Café Latte",
      restaurant: "Kape Alley",
      location: "Specialty Coffee & Pastries",
      price: 85,
      image: "https://images.unsplash.com/photo-1517487881594-2787fef5ebf7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpY2VkJTIwY29mZmVlJTIwbGF0dGV8ZW58MXx8fHwxNzczODM0MTcwfDA&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.6,
      time: "10-18 min",
      verified: true
    },
    { 
      id: 15,
      category: "kape",
      name: "Kapeng Matamis",
      restaurant: "Kape Alley",
      location: "Specialty Coffee & Pastries",
      price: 55,
      image: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzd2VldCUyMGNvZmZlZSUyMGRyaW5rfGVufDF8fHx8MTc3MzgzNDE3MHww&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.4,
      time: "10-18 min",
      verified: true
    },

    // Merienda items
    { 
      id: 16,
      category: "merienda",
      name: "Pandesal (10 pcs)",
      restaurant: "Panaderia Gen T Deleon",
      location: "Fresh Pandesal & Pan de Coco",
      price: 35,
      image: "https://images.unsplash.com/photo-1595507059318-baf4e186c77f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGJha2VyeSUyMHBhbmRlc2FsfGVufDF8fHx8MTc3MzgzMjQwMXww&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.9,
      time: "8-15 min",
      verified: true
    },
    { 
      id: 17,
      category: "merienda",
      name: "Ensaymada (4 pcs)",
      restaurant: "Panaderia Gen T Deleon",
      location: "Fresh Pandesal & Pan de Coco",
      price: 60,
      image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGVuc2F5bWFkYSUyMGJyZWFkfGVufDF8fHx8MTc3MzgzNDE3MHww&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.8,
      time: "8-15 min",
      verified: true
    },
    { 
      id: 18,
      category: "merienda",
      name: "Halo-Halo",
      restaurant: "Halo-Halo Paradise",
      location: "Desserts & Shakes",
      price: 75,
      image: "https://images.unsplash.com/photo-1752245055475-8b7c3b4756ac?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGRlc3NlcnQlMjBzd2VldHxlbnwxfHx8fDE3NzM4MzIwMTV8MA&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.7,
      time: "15-25 min",
      verified: true
    },
    { 
      id: 19,
      category: "merienda",
      name: "Turon (3 pcs)",
      restaurant: "Panaderia Gen T Deleon",
      location: "Fresh Pandesal & Pan de Coco",
      price: 45,
      image: "https://images.unsplash.com/photo-1626790680787-de5e9a07bcf2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxGaWxpcGlubyUyMGJhbmFuYSUyMHNwcmluZyUyMHJvbGx8ZW58MXx8fHwxNzczODM0MTcwfDA&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.6,
      time: "8-15 min",
      verified: true
    },

    // Malamig items
    { 
      id: 20,
      category: "malamig",
      name: "Gulaman at Sago",
      restaurant: "Halo-Halo Paradise",
      location: "Desserts & Shakes",
      price: 35,
      image: "https://images.unsplash.com/photo-1546548970-71785318a17b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkcmluayUyMGRlc3NlcnQlMjBiZXZlcmFnZXxlbnwxfHx8fDE3NzM4MzQxNzB8MA&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.5,
      time: "15-25 min",
      verified: true
    },
    { 
      id: 21,
      category: "malamig",
      name: "Buko Juice",
      restaurant: "Halo-Halo Paradise",
      location: "Desserts & Shakes",
      price: 45,
      image: "https://images.unsplash.com/photo-1559181567-c3190ca9959b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb2NvbnV0JTIwanVpY2UlMjBkcmlua3xlbnwxfHx8fDE3NzM4MzQxNzB8MA&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.7,
      time: "15-25 min",
      verified: true
    },
    { 
      id: 22,
      category: "malamig",
      name: "Milk Tea - Wintermelon",
      restaurant: "Halo-Halo Paradise",
      location: "Desserts & Shakes",
      price: 65,
      image: "https://images.unsplash.com/photo-1525385133512-2f3bdd039054?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaWxrJTIwdGVhJTIwYnViYmxlJTIwdGVhfGVufDF8fHx8MTc3MzgzNDE3MHww&ixlib=rb-4.1.0&q=80&w=1080",
      rating: 4.6,
      time: "15-25 min",
      verified: true
    },
  ];

  // Filter food items by category and search query
  const filteredFood = foodItems.filter((food) => {
    const matchesCategory = food.category === categoryId;
    const matchesSearch = food.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         food.restaurant.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-white flex flex-col pb-20">
      {/* Header with Back Button */}
      <div className="bg-gradient-to-b from-[#E11D48] to-[#BE123C] px-5 pt-6 pb-8 shadow-xl relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-3xl -translate-y-32 translate-x-32" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <Link to="/customer/food">
              <button className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center shadow-lg active:scale-90 transition-transform">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg">
                <span className="text-3xl">{categoryIcon}</span>
              </div>
              <h1 className="text-white font-bold text-2xl drop-shadow-md">{categoryName}</h1>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
            <input
              type="text"
              placeholder={`Maghanap ng ${categoryName.toLowerCase()}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-white rounded-2xl shadow-xl border-0 text-base text-[#121212] placeholder:text-[#94A3B8]"
              style={{ outline: 'none' }}
            />
          </div>
        </div>
      </div>

      {/* Food Items List */}
      <div className="px-5 py-6">
        <p className="text-sm text-[#64748B] mb-4">
          {filteredFood.length} {filteredFood.length === 1 ? 'item' : 'items'} available
        </p>

        {filteredFood.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#64748B] text-lg">Walang makitang food items</p>
            <p className="text-[#94A3B8] text-sm mt-2">Subukan ang ibang search term</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredFood.map((food) => (
              <Card key={food.id} className="overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 border-0 rounded-3xl bg-white active:scale-[0.98]">
                <div className="flex items-center gap-0">
                  {/* Image Thumbnail */}
                  <div className="w-32 h-32 flex-shrink-0 relative overflow-hidden">
                    <ImageWithFallback 
                      src={food.image}
                      alt={food.name}
                      className="w-full h-full object-cover"
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    {/* Rating badge */}
                    <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm text-[#121212] px-2 py-1 rounded-full flex items-center gap-1 shadow-lg">
                      <Star className="w-3 h-3 fill-[#FFC107] text-[#FFC107]" />
                      <span className="text-xs font-bold">{food.rating}</span>
                    </div>
                  </div>

                  {/* Food Info */}
                  <div className="flex-1 p-4 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-[#121212] text-base truncate">
                            {food.name}
                          </h4>
                          {/* Verified Merchant Badge */}
                          {food.verified && (
                            <div className="flex-shrink-0 w-5 h-5 bg-[#121212] rounded-full flex items-center justify-center shadow-md">
                              <Shield className="w-3 h-3 text-white" fill="white" />
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-[#64748B] font-semibold mb-0.5">
                          {food.restaurant}
                        </p>
                        <p className="text-xs text-[#94A3B8] flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {food.location}
                        </p>
                      </div>
                      <button className="flex-shrink-0 ml-2 w-8 h-8 bg-[#FFF7ED] rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-md">
                        <Heart className="w-4 h-4 text-[#E11D48]" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-3">
                      <div className="flex items-center gap-2 text-xs text-[#64748B]">
                        <span className="flex items-center gap-1 bg-[#F8F9FA] px-2.5 py-1.5 rounded-lg shadow-sm">
                          <Clock className="w-3 h-3" />
                          {food.time}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-[12px] text-[#E11D48] font-bold">₱</span>
                        <span className="text-xl font-bold text-[#E11D48]">{food.price}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Add to Cart Button */}
                <div className="px-4 pb-4">
                  <button className="w-full bg-gradient-to-r from-[#E11D48] to-[#BE123C] text-white font-bold py-3.5 rounded-2xl hover:shadow-xl transition-all duration-200 active:scale-95 shadow-lg shadow-[#E11D48]/30 uppercase text-sm tracking-wide">
                    Ilagay sa Cart
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
