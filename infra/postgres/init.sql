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

-- Indexes for common query patterns (M2)
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_clients_country ON clients(country_code);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
