import { Home as HomeIcon, ShoppingCart, MessageCircle, ClipboardList, User, Trash2, Plus, Minus, X, MapPin, ChevronRight, Info, Clock, Check, Search, Camera, Globe, Edit3, MoreVertical, ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { useState } from "react";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { useCart } from "../../contexts/CartContext";
import { useOrders } from "../../contexts/OrderContext";
import MapSelector from "./MapSelector";

export default function Cart() {
  const navigate = useNavigate();
  const { cartRestaurants, updateItemQuantity, removeRestaurant, getTotalItems } = useCart();
  const { addOrder } = useOrders();
  const [isManageMode, setIsManageMode] = useState(false);
  const [selectedRestaurants, setSelectedRestaurants] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "checkout">("list");
  const [checkoutRestaurant, setCheckoutRestaurant] = useState<any>(null);
  const [deliveryMode, setDeliveryMode] = useState<"delivery" | "pickup">("delivery");
  const [selectedDeliveryOption, setSelectedDeliveryOption] = useState("standard");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "gcash">("cash");
  const [needsCutlery, setNeedsCutlery] = useState(false);
  const [showOrderConfirmation, setShowOrderConfirmation] = useState(false);
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [addressSearchQuery, setAddressSearchQuery] = useState("");
  const [addressTab, setAddressTab] = useState<"recent" | "suggested" | "saved">("recent");
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState({
    name: "257, Tagalag Road, Tagalag",
    full: "Tagalag Road, Tagalag, Valenzuela City, ..."
  });

  const savedAddresses = [
    { 
      id: 1, 
      name: "257, Tagalag Road, Tagalag", 
      full: "Tagalag Road, Tagalag, Valenzuela City, Metro Manila",
      icon: "🏠",
      label: "Home"
    },
    { 
      id: 2, 
      name: "SM City North EDSA", 
      full: "North Avenue - cor EDSA, Quezon City, Metro Manila",
      icon: "🏢",
      label: "Work"
    },
    { 
      id: 3, 
      name: "Tagalag Terminal", 
      full: "Main Road, Tagalag, Valenzuela City, Metro Manila",
      icon: "📍",
      label: "Saved"
    },
    { 
      id: 4, 
      name: "Barangay Hall", 
      full: "Tagalag Center, Valenzuela City, Metro Manila",
      icon: "🏛️",
      label: "Saved"
    },
  ];

  const handleSelectAddress = (address: any) => {
    setSelectedAddress({
      name: address.name,
      full: address.full
    });
    setShowAddressPicker(false);
    setAddressSearchQuery("");
  };

  const filteredAddresses = savedAddresses.filter(address =>
    address.name.toLowerCase().includes(addressSearchQuery.toLowerCase()) ||
    address.full.toLowerCase().includes(addressSearchQuery.toLowerCase()) ||
    address.label.toLowerCase().includes(addressSearchQuery.toLowerCase())
  );

  const deliveryOptions = [
    { id: "priority", name: "Priority", time: "15 mins", price: 60, badge: "On-Time Promise" },
    { id: "standard", name: "Standard", time: "25 mins", price: 35 },
    { id: "saver", name: "Saver", time: "40 mins", price: 20 },
  ];

  const toggleRestaurantSelection = (id: number) => {
    setSelectedRestaurants(prev =>
      prev.includes(id) ? prev.filter(rid => rid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedRestaurants.length === cartRestaurants.length) {
      setSelectedRestaurants([]);
    } else {
      setSelectedRestaurants(cartRestaurants.map(r => r.id));
    }
  };

  const removeSelectedRestaurants = () => {
    selectedRestaurants.forEach(id => removeRestaurant(id));
    setSelectedRestaurants([]);
    setIsManageMode(false);
  };

  const openCheckout = (restaurant: any) => {
    setCheckoutRestaurant(restaurant);
    setViewMode("checkout");
  };

  const calculateSubtotal = () => {
    if (!checkoutRestaurant) return 0;
    return checkoutRestaurant.items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
  };

  const getDeliveryFee = () => {
    const selectedOption = deliveryOptions.find(opt => opt.id === selectedDeliveryOption);
    return selectedOption?.price || 0;
  };

  const calculateTotal = () => {
    return calculateSubtotal() + getDeliveryFee();
  };

  const handlePlaceOrder = () => {
    if (checkoutRestaurant) {
      const orderNumber = Math.random().toString(36).substring(2, 9).toUpperCase();
      const selectedOption = deliveryOptions.find(opt => opt.id === selectedDeliveryOption);
      
      // Get current user info
      const currentUserData = localStorage.getItem('trikeserve_current_user');
      const currentUser = currentUserData ? JSON.parse(currentUserData) : null;
      
      const order = {
        id: Date.now().toString(),
        orderNumber,
        restaurantName: checkoutRestaurant.name,
        restaurantImage: checkoutRestaurant.image,
        restaurantEmail: checkoutRestaurant.id, // This is the business email
        customerEmail: currentUser?.email || '',
        customerName: currentUser?.name || 'Customer',
        customerPhone: currentUser?.phone || '',
        items: checkoutRestaurant.items.map((item: any) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          quantity: item.quantity,
          image: item.image,
          category: item.category,
          customizations: item.customizations || [],
        })),
        subtotal: calculateSubtotal(),
        deliveryFee: getDeliveryFee(),
        total: calculateTotal(),
        status: "pending" as const,
        deliveryMode,
        paymentMethod,
        address: selectedAddress.full,
        date: new Date().toLocaleString('en-US', { 
          month: 'short', 
          day: '2-digit', 
          year: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        }),
        createdAt: new Date().toISOString(),
        estimatedTime: selectedOption?.time || "25 mins",
        needsCutlery,
      };
      
      addOrder(order);
      setShowOrderConfirmation(true);
    }
  };

  // LIST VIEW
  if (viewMode === "list") {
    return (
      <div className="min-h-screen bg-white pb-32">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between sticky top-0 bg-white z-50">
          <div className="flex items-center gap-3">
            <Link to="/customer/food">
              <button className="active:scale-90 transition-transform">
                <X className="w-6 h-6 text-[#121212]" />
              </button>
            </Link>
            <h1 className="text-xl font-bold text-[#121212]">My Cart</h1>
          </div>
          <button
            onClick={() => {
              setIsManageMode(!isManageMode);
              setSelectedRestaurants([]);
            }}
            className="text-base font-semibold text-[#3B82F6] active:scale-95 transition-transform"
          >
            {isManageMode ? "Cancel" : "Manage"}
          </button>
        </div>

        {/* Cart Items */}
        {cartRestaurants.length > 0 ? (
          <div className="px-5 py-4 space-y-4">
            {cartRestaurants.map((restaurant) => (
              <div
                key={restaurant.id}
                onClick={() => !isManageMode && openCheckout(restaurant)}
                className={`bg-white border-2 border-[#E2E8F0] rounded-2xl p-4 ${!isManageMode ? 'active:scale-[0.98]' : ''} transition-all`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox in manage mode */}
                  {isManageMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRestaurantSelection(restaurant.id);
                      }}
                      className="flex-shrink-0 mt-1"
                    >
                      <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                        selectedRestaurants.includes(restaurant.id)
                          ? 'bg-[#10B981] border-[#10B981]'
                          : 'border-[#CBD5E1] bg-white'
                      }`}>
                        {selectedRestaurants.includes(restaurant.id) && (
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                  )}

                  {/* Restaurant Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[#121212] text-base mb-1">{restaurant.name}</h3>
                    <p className="text-sm text-[#64748B] mb-0">
                      {restaurant.items.length} {restaurant.items.length === 1 ? 'item' : 'items'} • From {restaurant.estimatedTime} • {restaurant.distance}
                    </p>
                  </div>

                  {/* Restaurant Thumbnail */}
                  <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                    <ImageWithFallback
                      src={restaurant.image}
                      alt={restaurant.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-24 h-24 bg-[#F8F9FA] rounded-full flex items-center justify-center mb-4">
              <ShoppingCart className="w-12 h-12 text-[#CBD5E1]" />
            </div>
            <h3 className="text-xl font-bold text-[#121212] mb-2">Your cart is empty</h3>
            <p className="text-[#64748B] mb-6">Add items to get started</p>
            <Link to="/customer/food">
              <Button className="bg-[#E11D48] hover:bg-[#BE123C] uppercase">
                Browse Food
              </Button>
            </Link>
          </div>
        )}

        {/* Manage Mode Bottom Actions */}
        {isManageMode && cartRestaurants.length > 0 && (
          <div className="fixed bottom-16 left-0 right-0 bg-white border-t-2 border-[#E2E8F0] px-5 py-4 z-[1400]">
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2"
              >
                <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                  selectedRestaurants.length === cartRestaurants.length
                    ? 'bg-[#10B981] border-[#10B981]'
                    : 'border-[#CBD5E1] bg-white'
                }`}>
                  {selectedRestaurants.length === cartRestaurants.length && (
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="font-semibold text-[#121212]">Select all</span>
              </button>

              <button
                onClick={removeSelectedRestaurants}
                disabled={selectedRestaurants.length === 0}
                className={`px-8 py-3 rounded-full font-bold text-white uppercase transition-all ${
                  selectedRestaurants.length > 0
                    ? 'bg-[#E11D48] active:scale-95'
                    : 'bg-[#CBD5E1] cursor-not-allowed'
                }`}
              >
                Remove ({selectedRestaurants.length})
              </button>
            </div>
          </div>
        )}

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#E2E8F0] px-4 py-3 z-[1500]">
          <div className="max-w-6xl mx-auto grid grid-cols-5 gap-2">
            <Link to="/customer/food" className="flex flex-col items-center gap-1">
              <HomeIcon className="w-6 h-6 text-[#64748B]" />
              <span className="text-xs text-[#64748B]">Home</span>
            </Link>
            <Link to="/customer/cart" className="flex flex-col items-center gap-1 relative">
              <ShoppingCart className="w-6 h-6 text-[#E11D48]" />
              {getTotalItems() > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#E11D48] rounded-full flex items-center justify-center">
                  <span className="text-[10px] font-bold text-white">{getTotalItems()}</span>
                </div>
              )}
              <span className="text-xs font-semibold text-[#E11D48]">Cart</span>
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
        </div>
      </div>
    );
  }

  // CHECKOUT VIEW
  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#E2E8F0] sticky top-0 bg-white z-50">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => setViewMode("list")}
            className="active:scale-90 transition-transform"
          >
            <X className="w-6 h-6 text-[#121212]" />
          </button>
          <h2 className="font-bold text-[#121212] text-base flex-1">{checkoutRestaurant?.name}</h2>
        </div>
        <p className="text-xs text-[#94A3B8] pl-9">
          Delivery fee calculated at {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
        </p>
      </div>

      <div className="px-5 py-6 space-y-6">
        {/* Order Summary */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#121212]">Order summary</h3>
            <button className="text-sm font-semibold text-[#3B82F6]">Add items</button>
          </div>

          <div className="space-y-4">
            {checkoutRestaurant?.items.map((item: any) => (
              <div key={item.id} className="flex items-start gap-3">
                {/* Item Image */}
                <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                  <ImageWithFallback
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Item Details */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-[#121212] text-sm mb-1">{item.name}</h4>
                  {item.customizations && item.customizations.length > 0 && (
                    <div className="space-y-0.5 mb-2">
                      {item.customizations.map((customization: any, idx: number) => (
                        <p key={idx} className="text-xs text-[#64748B]">
                          • {customization.optionName}
                          {customization.price > 0 && <span className="text-[#E11D48]"> +₱{customization.price}</span>}
                        </p>
                      ))}
                    </div>
                  )}
                  <button className="text-sm font-semibold text-[#3B82F6]">Edit</button>
                </div>

                {/* Price and Quantity */}
                <div className="flex flex-col items-end gap-2">
                  <span className="font-semibold text-[#121212]">{item.price}.00</span>
                  <div className="w-8 h-8 rounded-full border-2 border-[#10B981] flex items-center justify-center">
                    <span className="text-sm font-semibold text-[#10B981]">{item.quantity}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cutlery */}
        <div className="flex items-center justify-between py-4 border-y border-[#E2E8F0]">
          <div>
            <h4 className="font-bold text-[#121212] mb-1">Cutlery</h4>
            <p className="text-sm text-[#64748B]">Request for cutlery only if you need it.</p>
          </div>
          <button
            onClick={() => setNeedsCutlery(!needsCutlery)}
            className="flex-shrink-0"
          >
            <div className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all ${needsCutlery ? 'border-[#10B981] bg-[#10B981]/10' : 'border-[#E2E8F0]'}`}>
              {needsCutlery && (
                <svg className="w-6 h-6 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </button>
        </div>

        {/* Delivery/Pickup Toggle */}
        <div>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setDeliveryMode("delivery")}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                deliveryMode === "delivery"
                  ? 'bg-[#DBEAFE] text-[#121212]'
                  : 'bg-white text-[#64748B] border border-[#E2E8F0]'
              }`}
            >
              Delivery
            </button>
            <button
              onClick={() => setDeliveryMode("pickup")}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                deliveryMode === "pickup"
                  ? 'bg-[#DBEAFE] text-[#121212]'
                  : 'bg-white text-[#64748B] border border-[#E2E8F0]'
              }`}
            >
              Pickup
            </button>
          </div>

          {/* Address */}
          <button
            onClick={() => setShowAddressPicker(true)}
            className="w-full flex items-center gap-3 p-4 bg-white border border-[#E2E8F0] rounded-xl mb-2 active:scale-[0.98] transition-transform"
          >
            <MapPin className="w-5 h-5 text-[#E11D48] flex-shrink-0" />
            <div className="flex-1 text-left">
              <p className="font-semibold text-[#121212] mb-0.5">{selectedAddress.name}</p>
              <p className="text-sm text-[#64748B]">{selectedAddress.full}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-[#64748B] flex-shrink-0" />
          </button>

          {/* Floor/Unit Number */}
          <div className="flex items-center gap-2 p-4 bg-white border border-[#E2E8F0] rounded-xl mb-4">
            <input
              type="text"
              placeholder="Floor / unit no."
              className="flex-1 text-sm text-[#121212] placeholder:text-[#94A3B8] outline-none"
            />
            <span className="text-sm text-[#3B82F6] font-semibold">Helps with delivery</span>
            <button className="text-sm font-semibold text-[#3B82F6]">Add</button>
          </div>
        </div>

        {/* Delivery Options */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-5 h-5 text-[#F59E0B]" />
            <div>
              <h4 className="font-bold text-[#121212] text-sm">Delivery options</h4>
              <p className="text-xs text-[#64748B]">Distance from you: {checkoutRestaurant?.distance}</p>
            </div>
          </div>

          <div className="space-y-3">
            {deliveryOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => setSelectedDeliveryOption(option.id)}
                className={`w-full p-4 rounded-xl border-2 transition-all active:scale-[0.98] ${
                  selectedDeliveryOption === option.id
                    ? 'border-[#10B981] bg-[#10B981]/5'
                    : 'border-[#E2E8F0] bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-[#121212]">{option.name}</span>
                      <span className="text-sm text-[#64748B]">• {option.time}</span>
                    </div>
                    {option.badge && (
                      <p className="text-xs font-semibold text-[#3B82F6]">{option.badge}</p>
                    )}
                  </div>
                  <span className="font-bold text-[#121212]">{option.price}.00</span>
                </div>
              </button>
            ))}
            
            <button className="w-full p-4 rounded-xl border-2 border-[#E2E8F0] bg-white text-left active:scale-[0.98] transition-all">
              <span className="font-semibold text-[#121212]">Order for later</span>
            </button>
          </div>
        </div>

        {/* Payment Details */}
        <div className="pb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-[#121212]">Payment details</h3>
            <button className="text-sm font-semibold text-[#3B82F6]">See all</button>
          </div>
          <p className="text-sm text-[#64748B] mb-4">
            For safety, riders prefer cashless orders. Go cashless to get one faster.
          </p>

          <div className="space-y-3">
            <button
              onClick={() => setPaymentMethod("gcash")}
              className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                paymentMethod === "gcash"
                  ? 'border-[#10B981] bg-[#10B981]/5'
                  : 'border-[#E2E8F0] bg-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#007DFF] rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-xs">💳</span>
                </div>
                <span className="font-semibold text-[#121212]">GCash</span>
              </div>
              {paymentMethod === "gcash" ? (
                <div className="w-6 h-6 bg-[#10B981] rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <span className="text-sm font-semibold text-[#3B82F6]">Add</span>
              )}
            </button>

            <button
              onClick={() => setPaymentMethod("cash")}
              className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                paymentMethod === "cash"
                  ? 'border-[#10B981] bg-[#10B981]/5'
                  : 'border-[#E2E8F0] bg-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#10B981] rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">💵</span>
                </div>
                <span className="font-semibold text-[#121212]">Cash</span>
              </div>
              {paymentMethod === "cash" && (
                <div className="w-6 h-6 bg-[#10B981] rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Subtotal Summary */}
        <div className="space-y-2 pt-4 border-t border-[#E2E8F0]">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#64748B]">Subtotal</span>
            <span className="font-semibold text-[#121212]">₱{calculateSubtotal()}.00</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#64748B]">Delivery fee</span>
            <span className="font-semibold text-[#121212]">₱{getDeliveryFee()}.00</span>
          </div>
        </div>
      </div>

      {/* Fixed Bottom - Total and Place Order */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#E2E8F0] px-5 py-4 z-50">
        <div className="flex items-center justify-between mb-4">
          <span className="text-lg font-bold text-[#121212]">Total</span>
          <span className="text-2xl font-bold text-[#121212]">₱{calculateTotal()}.00</span>
        </div>
        <button
          onClick={handlePlaceOrder}
          className="w-full bg-[#10B981] hover:bg-[#059669] text-white font-bold py-4 rounded-2xl transition-all active:scale-95 shadow-lg"
        >
          Place Order
        </button>
      </div>

      {/* Order Confirmation Modal */}
      {showOrderConfirmation && (
        <div className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center p-4" onClick={() => setShowOrderConfirmation(false)}>
          <Card 
            className="bg-white p-8 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Success Icon */}
            <div className="w-20 h-20 bg-[#10B981]/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <div className="w-16 h-16 bg-[#10B981] rounded-full flex items-center justify-center">
                <Check className="w-10 h-10 text-white" strokeWidth={3} />
              </div>
            </div>

            {/* Message */}
            <h3 className="text-2xl font-bold text-[#121212] text-center mb-3">
              Order Placed!
            </h3>
            <p className="text-[#64748B] text-center mb-2">
              Your order has been successfully placed and is being prepared.
            </p>
            <p className="text-sm text-[#64748B] text-center mb-8">
              Order #{Math.random().toString(36).substring(2, 9).toUpperCase()}
            </p>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowOrderConfirmation(false);
                  removeRestaurant(checkoutRestaurant.id);
                  navigate("/customer/activity");
                }}
                className="w-full py-4 bg-[#10B981] text-white font-bold rounded-2xl uppercase active:scale-95 transition-transform"
              >
                Track Order
              </button>
              <button
                onClick={() => {
                  setShowOrderConfirmation(false);
                  removeRestaurant(checkoutRestaurant.id);
                  navigate("/customer/food");
                }}
                className="w-full py-4 bg-[#F8F9FA] text-[#64748B] font-bold rounded-2xl uppercase active:scale-95 transition-transform"
              >
                Continue Shopping
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Address Picker Modal */}
      {showAddressPicker && (
        <div className="fixed inset-0 bg-white z-[3000]">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center gap-3">
            <button
              onClick={() => {
                setShowAddressPicker(false);
                setAddressSearchQuery("");
              }}
              className="active:scale-90 transition-transform"
            >
              <ArrowLeft className="w-6 h-6 text-[#121212]" />
            </button>
            <div className="w-10 h-10 bg-[#E11D48] rounded-full flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="try 'top picks'"
                value={addressSearchQuery}
                onChange={(e) => setAddressSearchQuery(e.target.value)}
                className="w-full px-4 py-2.5 pr-20 bg-white border-2 border-[#10B981] rounded-full text-sm text-[#121212] placeholder:text-[#94A3B8] outline-none"
              />
              <button className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-[#F8F9FA] rounded-full flex items-center justify-center">
                <Camera className="w-4 h-4 text-[#64748B]" />
              </button>
            </div>
            <button className="flex-shrink-0">
              <span className="text-2xl">🇵🇭</span>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-6 px-6 pt-4 pb-3 border-b border-[#E2E8F0]">
            <button
              onClick={() => setAddressTab("recent")}
              className={`pb-2 font-semibold transition-all ${
                addressTab === "recent"
                  ? 'text-[#121212] border-b-2 border-[#10B981]'
                  : 'text-[#94A3B8]'
              }`}
            >
              Recent
            </button>
            <button
              onClick={() => setAddressTab("suggested")}
              className={`pb-2 font-semibold transition-all ${
                addressTab === "suggested"
                  ? 'text-[#121212] border-b-2 border-[#10B981]'
                  : 'text-[#94A3B8]'
              }`}
            >
              Suggested
            </button>
            <button
              onClick={() => setAddressTab("saved")}
              className={`pb-2 font-semibold transition-all ${
                addressTab === "saved"
                  ? 'text-[#121212] border-b-2 border-[#10B981]'
                  : 'text-[#94A3B8]'
              }`}
            >
              Saved
            </button>
          </div>

          {/* Content */}
          <div className="px-5 py-4 space-y-4 pb-32">
            {/* Current Location */}
            <div className="flex items-start gap-3 pb-4">
              <div className="w-10 h-10 rounded-full border-2 border-[#10B981] flex items-center justify-center flex-shrink-0 mt-1">
                <MapPin className="w-5 h-5 text-[#10B981]" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-[#121212] mb-1">Current location</h4>
                <p className="text-sm text-[#64748B] leading-relaxed">
                  257, Tagalag Road, Tagalag, Tagalag Road, Tagalag, Valenzuela City, Metro Manila, 1445, National Capital...
                </p>
              </div>
              <button className="flex-shrink-0 p-2">
                <MoreVertical className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            {/* Need help? */}
            <div className="pt-4">
              <h3 className="font-bold text-[#121212] mb-4">Need help?</h3>
              <div className="space-y-3">
                <button className="w-full flex items-start gap-3 p-4 bg-white border border-[#E2E8F0] rounded-xl active:scale-[0.98] transition-transform">
                  <div className="w-10 h-10 rounded-full border-2 border-[#10B981] flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-[#10B981]" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm text-[#121212]">
                      Copy the place's Plus Code from Google Maps and search with it here.
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#64748B] flex-shrink-0 mt-1" />
                </button>

                <button className="w-full flex items-start gap-3 p-4 bg-white border border-[#E2E8F0] rounded-xl active:scale-[0.98] transition-transform">
                  <div className="w-10 h-10 rounded-full border-2 border-[#10B981] flex items-center justify-center flex-shrink-0">
                    <Globe className="w-5 h-5 text-[#10B981]" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm text-[#121212]">
                      If the place is located elsewhere, select its city, area, or country first.
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#64748B] flex-shrink-0 mt-1" />
                </button>

                <button className="w-full flex items-start gap-3 p-4 bg-white border border-[#E2E8F0] rounded-xl active:scale-[0.98] transition-transform">
                  <div className="w-10 h-10 rounded-full border-2 border-[#10B981] flex items-center justify-center flex-shrink-0">
                    <Edit3 className="w-5 h-5 text-[#10B981]" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm text-[#121212]">
                      Can't find a place or noticed incorrect details? Let us know.
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#64748B] flex-shrink-0 mt-1" />
                </button>
              </div>
            </div>

            {/* Saved Addresses (when addressTab is saved or filtered results) */}
            {(addressTab === "saved" || addressSearchQuery) && filteredAddresses.length > 0 && (
              <div className="pt-4">
                <h3 className="font-bold text-[#121212] mb-4">Saved Addresses</h3>
                <div className="space-y-3">
                  {filteredAddresses.map((address) => (
                    <button
                      key={address.id}
                      onClick={() => handleSelectAddress(address)}
                      className={`w-full p-4 rounded-xl border-2 transition-all active:scale-[0.98] text-left ${
                        selectedAddress.name === address.name
                          ? 'border-[#10B981] bg-[#10B981]/5'
                          : 'border-[#E2E8F0] bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#F8F9FA] rounded-full flex items-center justify-center">
                          <span className="text-lg">{address.icon}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-[#121212]">{address.name}</p>
                            <span className="text-xs px-2 py-0.5 bg-[#F8F9FA] text-[#64748B] rounded-full">{address.label}</span>
                          </div>
                          <p className="text-sm text-[#64748B]">{address.full}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Fixed Bottom Button */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] px-5 py-4">
            <button
              onClick={() => {
                setShowAddressPicker(false);
                setShowMapSelector(true);
              }}
              className="w-full py-4 bg-white border-2 border-[#E2E8F0] text-[#121212] font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <MapPin className="w-5 h-5" />
              Choose on TrikeServeMaps
            </button>
          </div>
        </div>
      )}

      {/* Map Selector */}
      {showMapSelector && (
        <MapSelector
          onClose={() => setShowMapSelector(false)}
          onSelectLocation={(location) => {
            setSelectedAddress({
              name: location.name,
              full: location.full,
            });
            setShowMapSelector(false);
          }}
          currentLocation={selectedAddress}
        />
      )}
    </div>
  );
}