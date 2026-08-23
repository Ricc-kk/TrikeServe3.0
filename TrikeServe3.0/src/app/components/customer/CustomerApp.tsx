import { useState, useEffect } from "react";
import { ArrowLeft, Search, Bike, ShoppingBag, Users, User as UserIcon, MapPin, Clock, Star } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { supabase } from "../../../utils/supabase";

interface Restaurant {
  id: string;
  name: string;
  category: string;
  distance: string;
  rating: number;
  deliveryFee: number;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  restaurant: string;
}

export default function CustomerApp() {
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<MenuItem[]>([]);
  const [rideType, setRideType] = useState<'shared' | 'private' | null>(null);
  const [sharedPrice, setSharedPrice] = useState(15); // Default until admin rates load
  const [privatePrice, setPrivatePrice] = useState(50); // Default until admin rates load

  // Load admin-set ride rates so the booking cards always show the admin price
  useEffect(() => {
    const loadRates = async () => {
      try {
        const { data, error } = await supabase
          .from('admin_settings')
          .select('setting_value')
          .eq('setting_key', 'rates')
          .single();

        if (error) {
          console.warn('Error loading pricing from Supabase:', error);
          return;
        }

        if (data?.setting_value) {
          const settings = JSON.parse(data.setting_value);
          setSharedPrice(settings.sharedRide || 15);
          setPrivatePrice(settings.privateRide || 50);
        }
      } catch (error) {
        console.error('Error parsing pricing settings:', error);
      }
    };
    loadRates();
  }, []);

  const restaurants: Restaurant[] = [
    { id: '1', name: "Kuya J's Eatery", category: 'Filipino', distance: '0.8km', rating: 4.5, deliveryFee: 35 },
    { id: '2', name: 'Gen T Deleon Carinderia', category: 'Filipino', distance: '1.2km', rating: 4.3, deliveryFee: 40 },
    { id: '3', name: 'Mang Tomas BBQ', category: 'BBQ & Grill', distance: '0.5km', rating: 4.7, deliveryFee: 30 },
  ];

  const popularItems: MenuItem[] = [
    { id: '1', name: 'Lechon Kawali', price: 120, restaurant: "Kuya J's Eatery" },
    { id: '2', name: 'Sisig', price: 95, restaurant: "Kuya J's Eatery" },
    { id: '3', name: 'BBQ Combo', price: 150, restaurant: 'Mang Tomas BBQ' },
    { id: '4', name: 'Pancit Canton', price: 80, restaurant: 'Gen T Deleon Carinderia' },
  ];

  const addToCart = (item: MenuItem) => {
    setCart([...cart, item]);
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price, 0);

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#E11D48] to-[#BE123C] px-4 py-4 sticky top-0 z-50 shadow-lg">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Link to="/">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-2xl font-extrabold text-white flex-1" style={{ letterSpacing: '-0.02em' }}>
              TrikeServe
            </h1>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
              <UserIcon className="w-5 h-5" />
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
            <Input
              placeholder="Search food or destinations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-0 shadow-lg"
            />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4">
        {/* Service Type Cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Dialog>
            <DialogTrigger asChild>
              <Card className="p-6 cursor-pointer hover:shadow-xl transition-all border-2 border-[#CBD5E1] hover:border-[#E11D48]">
                <div className="w-14 h-14 bg-gradient-to-br from-[#E11D48] to-[#BE123C] rounded-2xl flex items-center justify-center mb-3 mx-auto">
                  <Bike className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-bold text-center text-[#121212]">Book a Ride</h3>
                <p className="text-xs text-center text-[#64748B] mt-1">Shared or Private</p>
              </Card>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Choose Ride Type</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-4">
                <Card className="p-5 cursor-pointer hover:shadow-lg border-2 border-[#CBD5E1] hover:border-[#E11D48]">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                        <Users className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-bold text-[#121212]">Shared (Sasabay)</h4>
                        <p className="text-xs text-[#64748B]">Split the cost</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-[#E11D48]">₱{sharedPrice}</p>
                      <p className="text-xs text-[#64748B]">per person</p>
                    </div>
                  </div>
                  <Badge className="bg-green-500 mb-2">2 seats available</Badge>
                  <p className="text-xs text-[#64748B] mb-3">May wait for other passengers</p>
                  <Button className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase">
                    BOOK SHARED RIDE
                  </Button>
                </Card>

                <Card className="p-5 cursor-pointer hover:shadow-lg border-2 border-[#CBD5E1] hover:border-[#E11D48]">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                        <UserIcon className="w-6 h-6 text-purple-600" />
                      </div>
                      <div>
                        <h4 className="font-bold text-[#121212]">Special</h4>
                        <p className="text-xs text-[#64748B]">Special ride</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-[#E11D48]">₱{privatePrice}</p>
                      <p className="text-xs text-[#64748B]">fixed</p>
                    </div>
                  </div>
                  <Badge className="bg-blue-500 mb-2">Instant pickup</Badge>
                  <p className="text-xs text-[#64748B] mb-3">Direct to destination</p>
                  <Button className="w-full bg-[#121212] hover:bg-[#2a2a2a] uppercase">
                    BOOK PRIVATE RIDE
                  </Button>
                </Card>
              </div>
            </DialogContent>
          </Dialog>

          <Card className="p-6 cursor-pointer hover:shadow-xl transition-all border-2 border-[#CBD5E1] hover:border-[#E11D48]">
            <div className="w-14 h-14 bg-gradient-to-br from-[#121212] to-[#2a2a2a] rounded-2xl flex items-center justify-center mb-3 mx-auto">
              <ShoppingBag className="w-7 h-7 text-white" />
            </div>
            <h3 className="font-bold text-center text-[#121212]">Order Food</h3>
            <p className="text-xs text-center text-[#64748B] mt-1">Local delivery</p>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="food" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="food">Food Delivery</TabsTrigger>
            <TabsTrigger value="history">Order History</TabsTrigger>
          </TabsList>

          {/* Food Tab */}
          <TabsContent value="food" className="space-y-6">
            {/* Popular Items */}
            <div>
              <h2 className="text-xl font-bold text-[#121212] mb-4">Popular Items</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {popularItems.map((item) => (
                  <Card key={item.id} className="p-4 border-2 border-[#CBD5E1] hover:border-[#E11D48] transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-bold text-lg text-[#121212] tracking-tight mb-1">
                          {item.name}
                        </h3>
                        <p className="text-xs text-[#64748B]">{item.restaurant}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-[#64748B]">₱</p>
                        <p className="text-xl font-bold text-[#E11D48]">{item.price.toFixed(2)}</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => addToCart(item)}
                      size="sm"
                      className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase mt-2"
                    >
                      ADD TO CART
                    </Button>
                  </Card>
                ))}
              </div>
            </div>

            {/* Restaurants */}
            <div>
              <h2 className="text-xl font-bold text-[#121212] mb-4">Restaurants Near You</h2>
              <div className="space-y-3">
                {restaurants.map((restaurant) => (
                  <Card key={restaurant.id} className="p-5 border-2 border-[#CBD5E1] hover:border-[#E11D48] transition-colors cursor-pointer">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-bold text-lg text-[#121212] mb-1">{restaurant.name}</h3>
                        <div className="flex items-center gap-3 text-sm text-[#64748B] mb-2">
                          <div className="flex items-center gap-1">
                            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                            <span>{restaurant.rating}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            <span>{restaurant.distance}</span>
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-[#F8F9FA]">{restaurant.category}</Badge>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[#64748B]">Delivery</p>
                        <p className="font-bold text-[#E11D48]">₱{restaurant.deliveryFee}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-4">
            <Card className="p-5 border-2 border-[#CBD5E1]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-[#121212]">Lechon Kawali + Rice</h4>
                  <p className="text-sm text-[#64748B]">Kuya J's Eatery</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-[#E11D48]">₱150</p>
                  <p className="text-xs text-[#64748B]">Today, 11:30 AM</p>
                </div>
              </div>
              <Badge className="bg-green-500">Delivered</Badge>
              <Button variant="outline" size="sm" className="w-full mt-3">
                ORDER AGAIN
              </Button>
            </Card>

            <Card className="p-5 border-2 border-[#CBD5E1]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Bike className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-[#121212]">Shared Ride</h4>
                  <p className="text-sm text-[#64748B]">Gen T Deleon Terminal → Barangay Hall</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-[#E11D48]">₱15</p>
                  <p className="text-xs text-[#64748B]">Yesterday</p>
                </div>
              </div>
              <Badge className="bg-gray-500">Completed</Badge>
              <Button variant="outline" size="sm" className="w-full mt-3">
                RIDE AGAIN
              </Button>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Floating Cart */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-50 max-w-6xl mx-auto">
          <Card className="p-4 bg-white shadow-2xl border-2 border-[#E11D48]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#64748B]">{cart.length} item(s)</p>
                <p className="text-xl font-bold text-[#E11D48]">₱{cartTotal.toFixed(2)}</p>
              </div>
              <Button className="bg-[#E11D48] hover:bg-[#BE123C] uppercase px-8">
                VIEW CART
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
