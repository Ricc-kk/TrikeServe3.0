import { Home as HomeIcon, ShoppingCart, MessageCircle, ClipboardList, User, Trash2, Plus, Minus, X, MapPin, ChevronRight, Info, Check } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { useEffect, useState } from "react";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { useCart } from "../../contexts/CartContext";
import { useOrders } from "../../contexts/OrderContext";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../../utils/supabase";
import { supabaseHelpers } from "@/lib/supabase";
import MapSelector from "./MapSelector";

export default function Cart() {
  const navigate = useNavigate();
  const { cartRestaurants, updateItemQuantity, removeRestaurant, getTotalItems } = useCart();
  const { addOrder } = useOrders();
  const { user } = useAuth();
  const [isManageMode, setIsManageMode] = useState(false);
  const [selectedRestaurants, setSelectedRestaurants] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "checkout">("list");
  const [checkoutRestaurant, setCheckoutRestaurant] = useState<any>(null);
  const [deliveryFee, setDeliveryFee] = useState(35); // Admin-set base delivery fee (default until loaded)
  const [hasSelectedAddress, setHasSelectedAddress] = useState(false);
  const [paymentMethod] = useState<"cash">("cash");
  const [needsCutlery, setNeedsCutlery] = useState(false);
  const [showOrderConfirmation, setShowOrderConfirmation] = useState(false);
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [placedOrderNumber, setPlacedOrderNumber] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState({
    name: "Select Delivery Address",
    full: "Tap to choose your delivery location",
    lat: 14.7244,
    lng: 120.9668,
  });

  // Load the delivery fee set by the admin (admin_settings > rates > deliveryBaseFee)
  useEffect(() => {
    supabaseHelpers.getAdminDeliveryFee().then(setDeliveryFee);
  }, []);

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
    setShowRemoveConfirm(true);
  };

  const confirmRemoveRestaurants = () => {
    selectedRestaurants.forEach(id => removeRestaurant(id));
    setSelectedRestaurants([]);
    setIsManageMode(false);
    setShowRemoveConfirm(false);
  };

  const openCheckout = (restaurant: any) => {
    setCheckoutRestaurant(restaurant);
    setViewMode("checkout");
  };

  const calculateSubtotal = () => {
    if (!checkoutRestaurant) return 0;
    return checkoutRestaurant.items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
  };

  const getDeliveryFee = () => deliveryFee;

  const calculateTotal = () => {
    return calculateSubtotal() + getDeliveryFee();
  };

  const handlePlaceOrder = async () => {
    if (checkoutRestaurant) {
      if (!hasSelectedAddress) {
        alert("Please select a delivery address first.");
        return;
      }
      try {
        // CRITICAL: Get the actual Supabase restaurant.id for RLS isolation
        let businessUserId = checkoutRestaurant.businessUserId;

        let supabaseRestaurantId = checkoutRestaurant.supabaseRestaurantId;

        // If we don't have businessUserId, look it up from the restaurant name
        if (!businessUserId && checkoutRestaurant.name) {
          console.log('[Cart] businessUserId missing, looking up by restaurant name:', checkoutRestaurant.name);
          try {
            const { data: restaurantRecord, error: fetchError } = await supabase
              .from('restaurants')
              .select('id, business_user_id')
              .ilike('name', checkoutRestaurant.name)
              .single();

            if (!fetchError && restaurantRecord) {
              businessUserId = restaurantRecord.business_user_id;
              supabaseRestaurantId = restaurantRecord.id;
              console.log('[Cart] Found businessUserId from restaurant name:', businessUserId);
            } else {
              console.warn('[Cart] Could not find restaurant by name:', fetchError);
            }
          } catch (error) {
            console.warn('[Cart] Error looking up restaurant by name:', error);
          }
        } else if (!supabaseRestaurantId && businessUserId) {
          console.log('[Cart] Fetching restaurant ID from Supabase for:', businessUserId);
          try {
            const { data: restaurantRecord, error: fetchError } = await supabase
              .from('restaurants')
              .select('id')
              .eq('business_user_id', businessUserId)
              .single();

            if (fetchError) {
              console.warn('[Cart] Could not fetch restaurant ID:', fetchError);
            } else if (restaurantRecord) {
              supabaseRestaurantId = restaurantRecord.id;
              console.log('[Cart] Got restaurant ID from Supabase:', supabaseRestaurantId);
            }
          } catch (error) {
            console.warn('[Cart] Error fetching restaurant:', error);
          }
        }

        const orderNumber = Math.random().toString(36).substring(2, 9).toUpperCase();

        // Get current user info
        const currentUserData = localStorage.getItem('trikeserve_current_user');
        const currentUser = currentUserData ? JSON.parse(currentUserData) : null;

        const order = {
          id: Date.now().toString(),
          orderNumber,
          restaurantName: checkoutRestaurant.name,
          restaurantImage: checkoutRestaurant.image,
          restaurantEmail: checkoutRestaurant.id, // This is the business email/restaurant UUID
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
          deliveryMode: "delivery" as const,
          paymentMethod,
          address: selectedAddress.lat && selectedAddress.lng
            ? `${selectedAddress.full}|${selectedAddress.lat},${selectedAddress.lng}`
            : selectedAddress.full,
          date: new Date().toLocaleString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }),
          createdAt: new Date().toISOString(),
          estimatedTime: "25 mins",
          needsCutlery,
        };

        console.log('[Cart] Order created with:', {
          orderNumber: order.orderNumber,
          restaurantEmail: order.restaurantEmail,
          supabaseRestaurantId: supabaseRestaurantId,
          customerEmail: order.customerEmail,
          customerName: order.customerName,
          total: order.total
        });

        // Save to Supabase FIRST (before localStorage)
        try {
          console.log('[Cart] ========== ORDER SAVE DEBUG ==========');
          console.log('[Cart] Saving order to Supabase:', order.orderNumber);
          console.log('[Cart] Restaurant object:', {
            id: checkoutRestaurant.id,
            name: checkoutRestaurant.name,
            businessUserId: checkoutRestaurant.businessUserId
          });
          console.log('[Cart] With customer_id:', user?.id);
          console.log('[Cart] With business_id:', businessUserId);
          console.log('[Cart] With restaurant_email:', order.restaurantEmail);
          console.log('[Cart] ======================================');

          // Map to actual Supabase columns (based on actual schema)
          const { data: savedOrder, error: insertError } = await supabase
            .from('orders')
            .insert([{
              customer_id: user?.id || null, // Connect order to authenticated customer
              business_id: businessUserId || null, // Connect order to business user/restaurant owner
              order_number: order.orderNumber,
              restaurant_email: order.restaurantEmail || null, // Restaurant identifier
              restaurant_name: order.restaurantName || null, // Restaurant name for display
              restaurant_image: order.restaurantImage || null, // Restaurant image for display
              customer_email: order.customerEmail,
              customer_name: order.customerName,
              customer_phone: order.customerPhone,
              items: JSON.stringify(order.items),
              subtotal: order.subtotal,
              delivery_fee: order.deliveryFee,
              total: order.total,
              status: order.status,
              delivery_mode: order.deliveryMode,
              payment_method: order.paymentMethod,
              address: order.address,
              estimated_time: order.estimatedTime,
              needs_cutlery: order.needsCutlery,
              created_at: order.createdAt,
            }])
            .select()
            .single();

          if (insertError) {
            console.error('[Cart] Error saving order to Supabase:', insertError);
            alert('Error saving order: ' + (insertError?.message || 'Unknown error'));
            return;
          } else {
            console.log('[Cart] ✅ Order saved successfully to Supabase:', savedOrder);

            // ONLY add to localStorage AFTER successful Supabase save
            addOrder(order);

            // Create processing record for restaurant workflow
            try {
              console.log('[Cart] Creating order processing record...');
              const processingRecord = {
                order_id: savedOrder?.id || order.id,
                restaurant_id: supabaseRestaurantId || null,
                order_number: order.orderNumber,
                customer_email: order.customerEmail,
                customer_name: order.customerName,
                status: 'received',
                estimated_prep_time: 25,
                notes: needsCutlery ? 'Needs cutlery' : '',
              };

              const { error: processingError } = await supabase
                .from('order_processing')
                .insert([processingRecord])
                .select()
                .single();

              if (processingError) {
                console.error('[Cart] Error creating processing record:', processingError);
              } else {
                console.log('[Cart] Processing record created successfully');
              }
            } catch (error) {
              console.error('[Cart] Error creating processing record:', error);
            }

            // Notify the business about the new order
            try {
              if (businessUserId) {
                console.log('[Cart] Notifying business about new order...');
                await supabaseHelpers.notifyBusinessNewOrder({
                  orderId: savedOrder?.id || order.id,
                  orderNumber: order.orderNumber,
                  restaurantName: order.restaurantName,
                  customerName: order.customerName,
                  total: order.total,
                  businessUserId: businessUserId,
                });
                console.log('[Cart] Business notification sent successfully');
              }
            } catch (notifError) {
              console.error('[Cart] Error notifying business:', notifError);
            }
          }
        } catch (error) {
          console.error('[Cart] Error saving order:', error);
          // Order is still saved locally, so continue
        }

        setPlacedOrderNumber(order.orderNumber);
        setShowOrderConfirmation(true);
      } catch (error) {
        console.error('[Cart] Unexpected error in handlePlaceOrder:', error);
      }
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
                      {restaurant.items.length} {restaurant.items.length === 1 ? 'item' : 'items'} • From {restaurant.estimatedTime}
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

        {/* Remove Confirmation Modal */}
        {showRemoveConfirm && (
          <div className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center p-4">
            <Card className="bg-white p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-[#121212] text-center mb-2">Remove Item?</h3>
              <p className="text-[#64748B] text-center mb-6">Are you sure you want to remove items from cart?</p>
              <div className="space-y-3">
                <button
                  onClick={confirmRemoveRestaurants}
                  className="w-full py-4 bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold rounded-2xl uppercase active:scale-95 transition-transform"
                >
                  Remove
                </button>
                <button
                  onClick={() => setShowRemoveConfirm(false)}
                  className="w-full py-4 bg-[#F8F9FA] text-[#64748B] font-bold rounded-2xl uppercase active:scale-95 transition-transform"
                >
                  Cancel
                </button>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  }

  // CHECKOUT VIEW
  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#E2E8F0] sticky top-0 bg-white z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setViewMode("list")}
            className="active:scale-90 transition-transform"
          >
            <X className="w-6 h-6 text-[#121212]" />
          </button>
          <h2 className="font-bold text-[#121212] text-base flex-1">{checkoutRestaurant?.name}</h2>
        </div>
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

        <div>
          {/* Address */}
          <button
            onClick={() => setShowMapSelector(true)}
            className="w-full flex items-center gap-3 p-4 bg-white border border-[#E2E8F0] rounded-xl mb-2 active:scale-[0.98] transition-transform"
          >
            <MapPin className="w-5 h-5 text-[#E11D48] flex-shrink-0" />
            <div className="flex-1 text-left">
              <p className={`font-semibold mb-0.5 ${hasSelectedAddress ? 'text-[#121212]' : 'text-[#94A3B8]'}`}>
                {selectedAddress.name}
              </p>
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

        {/* Delivery Fee (set by the admin) */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-5 h-5 text-[#F59E0B]" />
            <div>
              <h4 className="font-bold text-[#121212] text-sm">Delivery fee</h4>
              <p className="text-xs text-[#64748B]">Food delivery (base rate)</p>
            </div>
          </div>

          <div className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-[#E2E8F0] bg-white">
            <span className="font-semibold text-[#121212]">Delivery</span>
            <span className="font-bold text-[#121212]">₱{getDeliveryFee().toFixed(2)}</span>
          </div>
        </div>

        {/* Payment Details */}
        <div className="pb-6">
          <h3 className="text-lg font-bold text-[#121212] mb-3">Payment details</h3>
          <p className="text-sm text-[#64748B] mb-4">
            Pay with cash on delivery.
          </p>

          <div className="space-y-3">
            <div className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-[#10B981] bg-[#10B981]/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#10B981] rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">💵</span>
                </div>
                <span className="font-semibold text-[#121212]">Cash</span>
              </div>
              <div className="w-6 h-6 bg-[#10B981] rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
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
            <span className="font-semibold text-[#121212]">₱{getDeliveryFee().toFixed(2)}</span>
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
        <div className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center p-4">
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
            {placedOrderNumber && (
              <p className="text-sm text-[#64748B] text-center mb-8">
                Order #{placedOrderNumber}
              </p>
            )}


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

      {/* Map Selector */}
      {showMapSelector && (
        <MapSelector
          onClose={() => setShowMapSelector(false)}
          onSelectLocation={(location) => {
            setSelectedAddress({
              name: location.name,
              full: location.full,
              lat: location.lat,
              lng: location.lng,
            });
            setHasSelectedAddress(true);
            setShowMapSelector(false);
          }}
          currentLocation={selectedAddress}
        />
      )}
    </div>
  );
}
