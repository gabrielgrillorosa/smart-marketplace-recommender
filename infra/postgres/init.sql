-- Smart Marketplace Recommender — PostgreSQL Schema (M1)
-- Executed automatically on first container start via /docker-entrypoint-initdb.d/

CREATE TABLE IF NOT EXISTS countries (
    code CHAR(2) PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    country_code CHAR(2) NOT NULL REFERENCES countries(code),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL CHECK (char_length(description) >= 30),
    category VARCHAR(30) NOT NULL CHECK (category IN ('beverages','food','personal_care','cleaning','snacks')),
    price NUMERIC(10,2) NOT NULL CHECK (price > 0),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_countries (
    product_id UUID NOT NULL REFERENCES products(id),
    country_code CHAR(2) NOT NULL REFERENCES countries(code),
    PRIMARY KEY (product_id, country_code)
);

CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    segment VARCHAR(20) NOT NULL CHECK (segment IN ('retail','food_service','wholesale')),
    country_code CHAR(2) NOT NULL REFERENCES countries(code),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id),
    order_date TIMESTAMPTZ DEFAULT NOW(),
    total NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id),
    CONSTRAINT uk_cart_client_id UNIQUE (client_id)
);

CREATE TABLE IF NOT EXISTS cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES carts(id),
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    CONSTRAINT uk_cart_item_cart_product UNIQUE (cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS integration_outbox (
    id UUID PRIMARY KEY,
    event_type VARCHAR(80) NOT NULL,
    aggregate_type VARCHAR(80) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_key VARCHAR(200) NOT NULL,
    payload TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lease_until TIMESTAMPTZ,
    leased_by VARCHAR(120),
    CONSTRAINT uk_integration_outbox_event_key UNIQUE (event_key)
);

-- Indexes for common query patterns (M2)
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_clients_country ON clients(country_code);
CREATE INDEX IF NOT EXISTS idx_orders_client_order_date ON orders(client_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_product_countries_country_product ON product_countries(country_code, product_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product ON cart_items(product_id);
CREATE INDEX IF NOT EXISTS idx_integration_outbox_pending
    ON integration_outbox (processed_at, next_attempt_at, lease_until, created_at);

CREATE OR REPLACE FUNCTION notify_integration_outbox_new()
RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('integration_outbox_new', NEW.event_type);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_integration_outbox_notify ON integration_outbox;
CREATE TRIGGER trg_integration_outbox_notify
AFTER INSERT ON integration_outbox
FOR EACH ROW
EXECUTE FUNCTION notify_integration_outbox_new();
