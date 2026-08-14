-- TrikeServe3.0 Supabase Database Schema
-- Execute this SQL in your Supabase project's SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('customer', 'rider', 'business', 'admin')),
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Admin specific
  admin_type VARCHAR(50) CHECK (admin_type IN ('business_customer', 'rider')),

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
  pickup_location VARCHAR(255) NOT NULL,
  dropoff_location VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'in_progress', 'completed', 'cancelled')),
  ride_type VARCHAR(50) NOT NULL CHECK (ride_type IN ('share', 'special')),
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('COD', 'GCASH')),
  amount DECIMAL(10, 2) NOT NULL,
  passenger_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ride_requests_customer ON ride_requests(customer_id);
CREATE INDEX idx_ride_requests_driver ON ride_requests(driver_id);
CREATE INDEX idx_ride_requests_status ON ride_requests(status);

-- Shared Ride Lobbies Table
CREATE TABLE IF NOT EXISTS shared_ride_lobbies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pickup_location VARCHAR(255) NOT NULL,
  dropoff_location VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'driver_found', 'in_progress', 'completed', 'cancelled')),
  passengers TEXT[] NOT NULL DEFAULT '{}',
  driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payment_method VARCHAR(50),
  driver_status VARCHAR(50),
  driver_status_message TEXT,
  driver_status_updated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lobbies_status ON shared_ride_lobbies(status);
CREATE INDEX idx_lobbies_driver ON shared_ride_lobbies(driver_id);

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
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled')),
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_restaurants_business_user ON restaurants(business_user_id);
CREATE INDEX idx_restaurants_name ON restaurants(name);

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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX idx_menu_items_category ON menu_items(category);

-- Favorites Table
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, restaurant_id)
);

CREATE INDEX idx_favorites_customer ON favorites(customer_id);

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

-- RLS Policies for users
CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT USING (auth.uid()::text = id::text);

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

-- Create Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('user_profiles', 'user_profiles', true),
  ('restaurants', 'restaurants', true),
  ('menu_items', 'menu_items', true)
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

