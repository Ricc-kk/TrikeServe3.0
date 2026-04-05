-- Order Processing Workflow Table
-- Track detailed processing steps for each order

CREATE TABLE IF NOT EXISTS order_processing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,

  -- Order tracking
  order_number VARCHAR(20) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,

  -- Processing status workflow
  status VARCHAR(50) NOT NULL DEFAULT 'received' CHECK (
    status IN (
      'received',           -- Order just received
      'confirmed',          -- Restaurant confirmed order
      'preparing',          -- Kitchen started preparing
      'quality_check',      -- Quality check in progress
      'ready',              -- Ready for pickup/delivery
      'assigned_rider',     -- Rider assigned (if delivery)
      'on_the_way',         -- Rider on the way to customer
      'delivered',          -- Order delivered
      'completed',          -- Order completed (all steps done)
      'cancelled'           -- Order cancelled
    )
  ),

  -- Processing timeline
  received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  preparing_started_at TIMESTAMP WITH TIME ZONE,
  preparing_completed_at TIMESTAMP WITH TIME ZONE,
  quality_check_at TIMESTAMP WITH TIME ZONE,
  ready_at TIMESTAMP WITH TIME ZONE,
  rider_assigned_at TIMESTAMP WITH TIME ZONE,
  delivery_started_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,

  -- Processing details
  notes TEXT,                        -- Any special instructions or notes
  estimated_prep_time INTEGER,       -- In minutes
  actual_prep_time INTEGER,          -- In minutes (calculated at ready)
  assigned_rider_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_rider_name VARCHAR(255),

  -- Quality assurance
  quality_issues JSONB,              -- Any issues found during QA
  qa_passed BOOLEAN DEFAULT true,    -- Quality check result

  -- Audit trail
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX idx_order_processing_order_id ON order_processing(order_id);
CREATE INDEX idx_order_processing_restaurant_id ON order_processing(restaurant_id);
CREATE INDEX idx_order_processing_status ON order_processing(status);
CREATE INDEX idx_order_processing_created_at ON order_processing(created_at);
CREATE INDEX idx_order_processing_customer_email ON order_processing(customer_email);

-- Enable Row Level Security
ALTER TABLE order_processing ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Service role can manage processing" ON order_processing
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Anyone can read processing data" ON order_processing
  FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert processing data" ON order_processing
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update processing data" ON order_processing
  FOR UPDATE
  USING (true);

