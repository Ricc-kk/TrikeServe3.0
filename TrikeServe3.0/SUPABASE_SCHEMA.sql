-- TrikeServe3.0 Supabase Database Schema
-- Execute this SQL in your Supabase project's SQL Editor
-- After this schema, run CUSTOMER_LEAVE_RIDE_RLS_FIX.sql for customer leave/cancel RPCs.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('customer', 'rider', 'business', 'admin')),
  original_role VARCHAR(50) CHECK (original_role IN ('customer', 'rider', 'business', 'admin')),
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Admin specific
  admin_type VARCHAR(50) CHECK (admin_type IN ('admin', 'rider')),

  -- Rider specific
  toda_plate VARCHAR(50),
  license_number VARCHAR(50),
  pickup_location VARCHAR(255),
  dropoff_location VARCHAR(255),

  -- Business specific
  business_name VARCHAR(255),
  business_address VARCHAR(255),

  -- Customer specific
  address VARCHAR(255),
  profile_photo_url VARCHAR(500)
);

-- Create index on email for faster lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Ride Requests Table
CREATE TABLE IF NOT EXISTS ride_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  order_id UUID,
  order_number VARCHAR(20),
  pickup_location VARCHAR(255) NOT NULL,
  dropoff_location VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'in_progress', 'completed', 'cancelled')),
  ride_type VARCHAR(50) NOT NULL CHECK (ride_type IN ('share', 'special')),
  route_id TEXT,
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('COD', 'GCASH')),
  amount DECIMAL(10, 2) NOT NULL,
  passenger_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.ride_requests
  ADD COLUMN IF NOT EXISTS accepted_driver_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX idx_ride_requests_customer ON ride_requests(customer_id);
CREATE INDEX idx_ride_requests_driver ON ride_requests(driver_id);
CREATE INDEX idx_ride_requests_status ON ride_requests(status);

-- Shared Ride Lobbies Table
CREATE TABLE IF NOT EXISTS shared_ride_lobbies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pickup_location VARCHAR(255) NOT NULL,
  dropoff_location VARCHAR(255) NOT NULL,
  pickup_address VARCHAR(500),
  dropoff_address VARCHAR(500),
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  dropoff_lat DOUBLE PRECISION,
  dropoff_lng DOUBLE PRECISION,
  terminal_id UUID,
  status VARCHAR(50) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'driver_found', 'in_progress', 'completed', 'cancelled')),
  passengers TEXT[] NOT NULL DEFAULT '{}',
  passengers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  max_seats INTEGER NOT NULL DEFAULT 3,
  price_per_seat DECIMAL(10, 2) DEFAULT 15,
  driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  driver_name VARCHAR(255),
  driver_plate VARCHAR(50),
  driver_rating VARCHAR(10),
  payment_method VARCHAR(50),
  driver_status VARCHAR(50),
  driver_status_message TEXT,
  driver_status_updated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lobbies_status ON shared_ride_lobbies(status);
CREATE INDEX idx_lobbies_driver ON shared_ride_lobbies(driver_id);
CREATE INDEX idx_lobbies_customer ON shared_ride_lobbies(customer_id);

-- Driver Ratings Table
CREATE TABLE IF NOT EXISTS driver_ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID REFERENCES users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  lobby_id UUID,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_driver_ratings_driver ON driver_ratings(driver_id);
CREATE INDEX idx_driver_ratings_customer ON driver_ratings(customer_id);

-- Delivery Notifications Table
CREATE TABLE IF NOT EXISTS delivery_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID,
  order_number VARCHAR(20),
  restaurant_name VARCHAR(255),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'delivery',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_delivery_notifications_recipient
  ON delivery_notifications(recipient_id, read, created_at DESC);

-- Business Ratings Table
CREATE TABLE IF NOT EXISTS business_ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES users(id) ON DELETE CASCADE,
  restaurant_id UUID,
  customer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_business_ratings_business ON business_ratings(business_id);
CREATE INDEX idx_business_ratings_customer ON business_ratings(customer_id);

-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_type VARCHAR(50) NOT NULL CHECK (sender_type IN ('customer', 'driver', 'business')),
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_receiver ON messages(receiver_id);
CREATE INDEX idx_messages_created ON messages(created_at);

-- Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES users(id) ON DELETE CASCADE,
  order_number VARCHAR(20) NOT NULL UNIQUE,
  restaurant_email VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20),
  items JSONB NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  delivery_fee DECIMAL(10, 2) NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'payment-confirmed', 'confirmed', 'preparing', 'ready', 'picked_up', 'on-the-way', 'delivered', 'cancelled')),
  -- GCash proof for the food. The delivery fee is collected in cash by the
  -- rider instead, which is why the two halves of the bill are stored apart:
  -- a single total cannot say which part has been paid yet.
  -- See ADD_ORDER_PAYMENT_AND_DELIVERY_PROOF.sql.
  payment_proof_url TEXT,
  payment_proof_uploaded_at TIMESTAMPTZ,
  gcash_amount DECIMAL(10, 2),
  delivery_fee_cash DECIMAL(10, 2),
  payment_confirmed_at TIMESTAMPTZ,
  payment_confirmed_by TEXT,
  -- The restaurant's photo of the packed order, shown to the rider before pickup.
  restaurant_package_photo_url TEXT,
  -- The rider's photo at handover.
  delivery_proof_url TEXT,
  delivery_proof_uploaded_at TIMESTAMPTZ,
  delivery_mode VARCHAR(20) NOT NULL,
  payment_method VARCHAR(20) NOT NULL,
  address TEXT,
  estimated_time VARCHAR(50),
  needs_cutlery BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_business ON orders(business_id);
CREATE INDEX idx_orders_status ON orders(status);
-- The shop's payment queue: orders awaiting a payment decision.
CREATE INDEX idx_orders_awaiting_payment ON orders(status) WHERE payment_confirmed_at IS NULL;

-- Restaurants Table
CREATE TABLE IF NOT EXISTS restaurants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  business_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  address VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  rating DECIMAL(3, 2) DEFAULT 5.0,
  is_open BOOLEAN DEFAULT true,
  banner_image VARCHAR(500),
  logo_image VARCHAR(500),
  subtitle VARCHAR(255),
  delivery_time VARCHAR(50),
  operating_hours VARCHAR(100),
  -- Business-declared cuisine buckets driving the customer food filters.
  -- Added by ADD_RESTAURANT_CUISINE_AND_LOCATION.sql.
  cuisine TEXT[] DEFAULT '{}',
  -- What the customer should do before paying: which GCash number, under whose
  -- name, what to put in the reference. Free text, set by the business from the
  -- Shop tab. Added by ADD_ORDER_PAYMENT_AND_DELIVERY_PROOF.sql.
  payment_instructions TEXT,
  -- Trading hours. `operating_hours` above is free text nothing reads; these
  -- three are what the storefront checks to decide whether the shop is open.
  -- NULL open_time means no schedule configured and the shop falls back to the
  -- manual is_open switch. Added by ADD_SHOP_HOURS.sql.
  open_time TEXT,
  close_time TEXT,
  open_days TEXT[] DEFAULT '{}',
  -- Pinned by the business; NULL until then, which sorts the shop last in
  -- distance rankings instead of hiding it.
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_restaurants_business_user ON restaurants(business_user_id);
CREATE INDEX idx_restaurants_name ON restaurants(name);
CREATE INDEX idx_restaurants_cuisine ON restaurants USING GIN (cuisine);

-- Menu Items Table
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  category VARCHAR(100) NOT NULL,
  image_url VARCHAR(500),
  is_available BOOLEAN DEFAULT true,
  -- Where the dish sits in the menu, lowest first. Dragging reorders by
  -- rewriting this. Added by ADD_MENU_ITEM_SORT_ORDER.sql.
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX idx_menu_items_category ON menu_items(category);

-- Saved / recent delivery addresses
-- Added by ADD_USER_ADDRESSES_AND_SEARCH.sql. Owner-only via RLS.
CREATE TABLE IF NOT EXISTS user_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(80) NOT NULL,
  address VARCHAR(255) NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_addresses_user ON user_addresses(user_id);

-- Search terms customers actually typed, powering "popular searches".
-- Append-only: an insert/select-only RLS policy keeps the ranking honest.
CREATE TABLE IF NOT EXISTS restaurant_searches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  term VARCHAR(120) NOT NULL,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_restaurant_searches_term ON restaurant_searches(term);
CREATE INDEX idx_restaurant_searches_created ON restaurant_searches(created_at DESC);

-- Favorites Table
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  restaurant_snapshot JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, restaurant_id)
);

CREATE INDEX idx_favorites_customer ON favorites(customer_id);

-- Saved menu-item favorites. Snapshot data keeps the Favorites screen useful
-- even when the customer's local browser cache is cleared.
CREATE TABLE IF NOT EXISTS favorite_menu_items (
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  item_snapshot JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id, menu_item_id)
);

CREATE INDEX idx_favorite_menu_items_customer ON favorite_menu_items(customer_id);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_ride_lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_searches ENABLE ROW LEVEL SECURITY;

-- Restaurant names, menus and locations are storefront data customers need to
-- browse. RLS must include a SELECT policy as well as table-level privileges.
GRANT SELECT ON TABLE public.restaurants TO authenticated;
DROP POLICY IF EXISTS "Customers can view restaurants" ON public.restaurants;
CREATE POLICY "Customers can view restaurants" ON public.restaurants
  FOR SELECT TO authenticated
  USING (true);

-- Shared ride customers can browse waiting lobbies, create their own lobby,
-- join by adding their passenger row, and leave lobbies they already joined.
GRANT SELECT, INSERT, UPDATE ON public.shared_ride_lobbies TO authenticated;

CREATE OR REPLACE FUNCTION public.lobby_json_contains_passenger(passenger_list JSONB, user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT $2 IS NOT NULL AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof($1) = 'array' THEN $1 ELSE '[]'::jsonb END
    ) AS passenger(value)
    WHERE passenger.value->>'id' = $2::text
       OR passenger.value->>'id' ~ ('^' || $2::text || '_companion_[0-9]+$')
  );
$$;
REVOKE ALL ON FUNCTION public.lobby_json_contains_passenger(JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lobby_json_contains_passenger(JSONB, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_lobby_passenger(lobby_id UUID, user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shared_ride_lobbies AS lobby
    WHERE lobby.id = $1
      AND $2 IS NOT NULL
      AND $2 = auth.uid()
      AND public.lobby_json_contains_passenger(lobby.passengers_json, $2)
  );
$$;
REVOKE ALL ON FUNCTION public.is_lobby_passenger(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_lobby_passenger(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_verified_lobby_rider(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT $1 IS NOT NULL
     AND $1 = auth.uid()
     AND EXISTS (
       SELECT 1 FROM public.users AS rider
       WHERE rider.id = $1
         AND rider.role = 'rider'
         AND rider.is_verified IS TRUE
     );
$$;
REVOKE ALL ON FUNCTION public.is_verified_lobby_rider(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_verified_lobby_rider(UUID) TO authenticated;

DROP POLICY IF EXISTS "Customers can view waiting lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Customers can view waiting lobbies" ON public.shared_ride_lobbies
  FOR SELECT TO authenticated USING (status = 'waiting');
DROP POLICY IF EXISTS "Customers can view own lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Customers can view own lobbies" ON public.shared_ride_lobbies
  FOR SELECT TO authenticated USING (auth.uid() = customer_id);
DROP POLICY IF EXISTS "Customers can view joined lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Customers can view joined lobbies" ON public.shared_ride_lobbies
  FOR SELECT TO authenticated USING (public.is_lobby_passenger(id, auth.uid()));
DROP POLICY IF EXISTS "Drivers can view assigned lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Drivers can view assigned lobbies" ON public.shared_ride_lobbies
  FOR SELECT TO authenticated USING (auth.uid() = driver_id);

DROP POLICY IF EXISTS "Customers can create lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Customers can create lobbies" ON public.shared_ride_lobbies
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);
DROP POLICY IF EXISTS "Customers can update own lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Customers can update own lobbies" ON public.shared_ride_lobbies
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = customer_id
    OR public.is_lobby_passenger(id, auth.uid())
  )
  WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Any user can update waiting lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Any user can update waiting lobbies" ON public.shared_ride_lobbies
  FOR UPDATE TO authenticated
  USING (status = 'waiting' AND driver_id IS NULL AND auth.uid() IS NOT NULL)
  WITH CHECK (
    status = 'waiting'
    AND driver_id IS NULL
    AND public.lobby_json_contains_passenger(passengers_json, auth.uid())
  );
DROP POLICY IF EXISTS "Drivers can update assigned lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Drivers can update assigned lobbies" ON public.shared_ride_lobbies
  FOR UPDATE TO authenticated USING (auth.uid() = driver_id);
DROP POLICY IF EXISTS "Verified riders can accept waiting lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Verified riders can accept waiting lobbies" ON public.shared_ride_lobbies
  FOR UPDATE TO authenticated
  USING (
    status = 'waiting'
    AND driver_id IS NULL
    AND public.is_verified_lobby_rider(auth.uid())
  )
  WITH CHECK (
    status = 'driver_found'
    AND driver_id = auth.uid()
    AND public.is_verified_lobby_rider(auth.uid())
  );

-- Customers can book a private ride only for their authenticated account.
-- The booking client uses INSERT ... RETURNING, so customers also need to
-- select their own newly-created row.
GRANT INSERT, SELECT, UPDATE ON public.ride_requests TO authenticated;
DROP POLICY IF EXISTS "Anyone can insert ride requests" ON public.ride_requests;
DROP POLICY IF EXISTS "Users can insert their own ride requests" ON public.ride_requests;
DROP POLICY IF EXISTS "Customers can create own private ride requests" ON public.ride_requests;
CREATE POLICY "Customers can create own private ride requests" ON public.ride_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND ride_type = 'special'
    AND status = 'pending'
    AND driver_id IS NULL
  );

-- Businesses can post an open delivery request only for one of their own
-- delivery orders. This keeps business order dispatch separate from customer
-- private-ride booking and driver shared-ride history.
DROP POLICY IF EXISTS "Businesses can create delivery requests for own orders" ON public.ride_requests;
CREATE POLICY "Businesses can create delivery requests for own orders" ON public.ride_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    order_id IS NOT NULL
    AND ride_type = 'special'
    AND status = 'pending'
    AND driver_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.users AS business_user
      WHERE business_user.id = auth.uid()
        AND business_user.role = 'business'
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders AS business_order
      WHERE business_order.id = ride_requests.order_id
        AND business_order.customer_id = ride_requests.customer_id
        AND (
          ride_requests.order_number IS NULL
          OR business_order.order_number = ride_requests.order_number
        )
        AND lower(business_order.delivery_mode) = 'delivery'
        AND lower(business_order.status) IN ('payment-confirmed', 'preparing', 'ready', 'confirmed')
        AND (
          business_order.business_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.restaurants AS shop
            WHERE shop.business_user_id = auth.uid()
              AND business_order.restaurant_email = shop.id::text
          )
        )
    )
  );

-- Let a business read delivery requests for its own orders so the order sheet
-- can show the assigned driver's profile without exposing other businesses'
-- delivery locations or rider details.
DROP POLICY IF EXISTS "Businesses can view delivery requests for own orders" ON public.ride_requests;
CREATE POLICY "Businesses can view delivery requests for own orders" ON public.ride_requests
  FOR SELECT TO authenticated
  USING (
    ride_type = 'special'
    AND order_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.users AS business_user
      WHERE business_user.id = auth.uid()
        AND business_user.role = 'business'
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders AS business_order
      WHERE business_order.id = ride_requests.order_id
        AND business_order.customer_id = ride_requests.customer_id
        AND (
          ride_requests.order_number IS NULL
          OR business_order.order_number = ride_requests.order_number
        )
        AND lower(business_order.delivery_mode) = 'delivery'
        AND (
          business_order.business_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.restaurants AS shop
            WHERE shop.business_user_id = auth.uid()
              AND business_order.restaurant_email = shop.id::text
          )
        )
    )
  );

DROP POLICY IF EXISTS "Riders can record completed shared rides" ON public.ride_requests;
CREATE POLICY "Riders can record completed shared rides" ON public.ride_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    ride_type = 'share'
    AND status = 'completed'
    AND driver_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users AS rider
      WHERE rider.id = auth.uid()
        AND rider.role = 'rider'
        AND rider.is_verified IS TRUE
    )
  );

DROP POLICY IF EXISTS "Customers can view own ride requests" ON public.ride_requests;
CREATE POLICY "Customers can view own ride requests" ON public.ride_requests
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Customers can cancel own private ride requests" ON public.ride_requests;
CREATE POLICY "Customers can cancel own private ride requests" ON public.ride_requests
  FOR UPDATE TO authenticated
  USING (
    customer_id = auth.uid()
    AND ride_type = 'special'
    AND status IN ('pending', 'accepted', 'in_progress')
  )
  WITH CHECK (
    customer_id = auth.uid()
    AND ride_type = 'special'
    AND status = 'cancelled'
  );

DROP POLICY IF EXISTS "Riders can view assigned ride requests" ON public.ride_requests;
CREATE POLICY "Riders can view assigned ride requests" ON public.ride_requests
  FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON favorites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON favorite_menu_items TO authenticated;

DROP POLICY IF EXISTS "Users can view own favorites" ON favorites;
CREATE POLICY "Users can view own favorites" ON favorites
  FOR SELECT TO authenticated USING (customer_id = auth.uid());
DROP POLICY IF EXISTS "Users can add own favorites" ON favorites;
CREATE POLICY "Users can add own favorites" ON favorites
  FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own favorites" ON favorites;
CREATE POLICY "Users can update own favorites" ON favorites
  FOR UPDATE TO authenticated USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());
DROP POLICY IF EXISTS "Users can delete own favorites" ON favorites;
CREATE POLICY "Users can delete own favorites" ON favorites
  FOR DELETE TO authenticated USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own favorite menu items" ON favorite_menu_items;
CREATE POLICY "Users can view own favorite menu items" ON favorite_menu_items
  FOR SELECT TO authenticated USING (customer_id = auth.uid());
DROP POLICY IF EXISTS "Users can add own favorite menu items" ON favorite_menu_items;
CREATE POLICY "Users can add own favorite menu items" ON favorite_menu_items
  FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own favorite menu items" ON favorite_menu_items;
CREATE POLICY "Users can update own favorite menu items" ON favorite_menu_items
  FOR UPDATE TO authenticated USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());
DROP POLICY IF EXISTS "Users can delete own favorite menu items" ON favorite_menu_items;
CREATE POLICY "Users can delete own favorite menu items" ON favorite_menu_items
  FOR DELETE TO authenticated USING (customer_id = auth.uid());

-- Owner-only access to saved addresses. See ADD_USER_ADDRESSES_AND_SEARCH.sql
-- for the full policy definitions, which are applied there so an existing
-- database picks them up too.
DROP POLICY IF EXISTS "Users can view own addresses" ON user_addresses;
CREATE POLICY "Users can view own addresses" ON user_addresses
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can add own addresses" ON user_addresses;
CREATE POLICY "Users can add own addresses" ON user_addresses
  FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own addresses" ON user_addresses;
CREATE POLICY "Users can update own addresses" ON user_addresses
  FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can delete own addresses" ON user_addresses;
CREATE POLICY "Users can delete own addresses" ON user_addresses
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Anyone signed in can log a search" ON restaurant_searches;
CREATE POLICY "Anyone signed in can log a search" ON restaurant_searches
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Anyone signed in can read searches" ON restaurant_searches;
CREATE POLICY "Anyone signed in can read searches" ON restaurant_searches
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- RLS Policies for users
CREATE OR REPLACE FUNCTION public.can_rider_view_active_customer_profile(p_customer_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND p_customer_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.users AS rider
      WHERE rider.id = auth.uid()
        AND rider.role = 'rider'
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.ride_requests AS ride
        WHERE ride.accepted_driver_id = auth.uid()
          AND ride.customer_id = p_customer_id
          AND lower(replace(ride.status, '_', '-')) IN (
            'accepted', 'on-the-way', 'arrived', 'in-progress',
            'picked-up', 'dropped-off', 'awaiting-payment'
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.shared_ride_lobbies AS lobby
        WHERE lobby.driver_id = auth.uid()
          AND lobby.status IN ('driver_found', 'in_progress')
          AND (
            lobby.customer_id = p_customer_id
            OR p_customer_id::TEXT = ANY(lobby.passengers)
            OR public.lobby_json_contains_passenger(lobby.passengers_json, p_customer_id)
          )
      )
    );
$function$;
REVOKE ALL ON FUNCTION public.can_rider_view_active_customer_profile(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_rider_view_active_customer_profile(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_rider_view_active_customer_profile(UUID) TO authenticated;

CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT USING (auth.uid()::text = id::text);

DROP POLICY IF EXISTS "Riders can view profiles in their active rides" ON public.users;
CREATE POLICY "Riders can view profiles in their active rides" ON public.users
  FOR SELECT TO authenticated
  USING (public.can_rider_view_active_customer_profile(id));

CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (auth.uid()::text = id::text);

-- RLS Policies for messages
CREATE POLICY "Users can view their messages" ON messages
  FOR SELECT USING (
    auth.uid()::text = sender_id::text OR auth.uid()::text = receiver_id::text
  );

CREATE POLICY "Users can create messages" ON messages
  FOR INSERT WITH CHECK (auth.uid()::text = sender_id::text);

-- RLS Policies for orders
-- Allow anyone to insert orders (validation done by app)
CREATE POLICY "Anyone can insert orders" ON orders
  FOR INSERT WITH CHECK (true);

-- Driver ratings: the app uses custom localStorage auth (anon key, no Supabase
-- Auth session), so auth.uid() is always NULL. Permissive policies keep the
-- rating feature working exactly like every other table in this project;
-- tighten to auth.uid() = customer_id/driver_id if the app moves to Supabase Auth.
CREATE POLICY "Allow read driver ratings" ON driver_ratings
  FOR SELECT USING (true);

CREATE POLICY "Allow insert driver ratings" ON driver_ratings
  FOR INSERT WITH CHECK (true);

-- Allow anyone to view orders (filtered by app)
CREATE POLICY "Anyone can view orders" ON orders
  FOR SELECT USING (true);

-- Allow anyone to update orders (validation done by app)
CREATE POLICY "Anyone can update orders" ON orders
  FOR UPDATE WITH CHECK (true);

-- Record the restaurant handoff using a scoped function instead of granting
-- rider clients direct UPDATE access to the customer's complete order row.
CREATE OR REPLACE FUNCTION public.mark_delivery_order_picked_up(
  p_order_id UUID DEFAULT NULL,
  p_order_number TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_driver_id UUID := auth.uid();
  v_order_id UUID;
BEGIN
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'A signed-in rider is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users AS rider
    WHERE rider.id = v_driver_id
      AND lower(rider.role) IN ('rider', 'driver')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only riders can mark delivery orders picked up';
  END IF;

  IF p_order_id IS NOT NULL THEN
    SELECT order_row.id
      INTO v_order_id
      FROM public.orders AS order_row
      WHERE order_row.id = p_order_id;
  END IF;

  IF v_order_id IS NULL AND p_order_number IS NOT NULL THEN
    SELECT order_row.id
      INTO v_order_id
      FROM public.orders AS order_row
      WHERE order_row.order_number = p_order_number;
  END IF;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Delivery order not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ride_requests AS ride
    WHERE ride.order_id = v_order_id
      AND ride.accepted_driver_id = v_driver_id
      AND lower(replace(coalesce(ride.status, ''), '_', '-')) NOT IN ('cancelled', 'completed')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This rider is not assigned to the delivery order';
  END IF;

  UPDATE public.orders AS order_row
    SET status = 'picked_up',
        updated_at = now()
    WHERE order_row.id = v_order_id
      AND lower(replace(coalesce(order_row.delivery_mode, ''), '_', '-')) = 'delivery'
      AND lower(replace(coalesce(order_row.status, ''), '_', '-')) NOT IN ('delivered', 'cancelled');

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This delivery order can no longer be marked picked up';
  END IF;

  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_delivery_order_picked_up(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_delivery_order_picked_up(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_delivery_order_picked_up(UUID, TEXT) TO authenticated;

-- Create Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('user_profiles', 'user_profiles', true),
  ('restaurants', 'restaurants', true),
  ('menu_items', 'menu_items', true),
  -- GCash screenshots and rider handover photos.
  ('order_proofs', 'order_proofs', true)
ON CONFLICT DO NOTHING;

-- Storage RLS Policies
CREATE POLICY "Public read access to user profiles" ON storage.objects
  FOR SELECT USING (bucket_id = 'user_profiles');

CREATE POLICY "Users can upload their own profiles" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'user_profiles' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Public read access to restaurants" ON storage.objects
  FOR SELECT USING (bucket_id = 'restaurants');

CREATE POLICY "Businesses can upload restaurant images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'restaurants');

CREATE POLICY "Businesses can update restaurant images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'restaurants')
  WITH CHECK (bucket_id = 'restaurants');

CREATE POLICY "Businesses can delete restaurant images" ON storage.objects
  FOR DELETE USING (bucket_id = 'restaurants');

-- Payment screenshots and delivery photos. See
-- ADD_ORDER_PAYMENT_AND_DELIVERY_PROOF.sql for why the writer check is any
-- signed-in user rather than the order's own customer.
CREATE POLICY "Public read access to order proofs" ON storage.objects
  FOR SELECT USING (bucket_id = 'order_proofs');

CREATE POLICY "Signed-in users can upload order proofs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'order_proofs' AND auth.uid() IS NOT NULL);

CREATE POLICY "Signed-in users can replace order proofs" ON storage.objects
  FOR UPDATE USING (bucket_id = 'order_proofs' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'order_proofs' AND auth.uid() IS NOT NULL);

