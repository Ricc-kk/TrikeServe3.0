-- Create orders table for storing customer orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES users(id) ON DELETE CASCADE,
  order_number VARCHAR(20) NOT NULL UNIQUE,
  restaurant_email VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20),
  items JSONB NOT NULL, -- Stores array of order items
  subtotal DECIMAL(10, 2) NOT NULL,
  delivery_fee DECIMAL(10, 2) NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending, preparing, ready, on-the-way, delivered, cancelled
  delivery_mode VARCHAR(20) NOT NULL, -- delivery or pickup
  payment_method VARCHAR(20) NOT NULL, -- cash or gcash
  address TEXT,
  estimated_time VARCHAR(50),
  needs_cutlery BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_business_id ON orders(business_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_email ON orders(restaurant_email);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Enable Row Level Security
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Service role can manage orders" ON orders;
DROP POLICY IF EXISTS "Anyone can read orders" ON orders;
DROP POLICY IF EXISTS "Anyone can insert orders" ON orders;
DROP POLICY IF EXISTS "Anyone can update orders" ON orders;
DROP POLICY IF EXISTS "Anyone can delete orders" ON orders;

-- Create RLS policies
CREATE POLICY "Service role can manage orders" ON orders
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Anyone can read orders" ON orders
  FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert orders" ON orders
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update orders" ON orders
  FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete orders" ON orders
  FOR DELETE
  USING (true);

-- Verify creation
SELECT table_name FROM information_schema.tables WHERE table_name = 'orders';

