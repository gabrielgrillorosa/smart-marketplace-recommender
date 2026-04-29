-- Cleanup in FK-safe order (test isolation: re-run before every test)
DELETE FROM cart_items;
DELETE FROM carts;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM product_countries;
DELETE FROM products;
DELETE FROM clients;
DELETE FROM suppliers;
DELETE FROM countries;

-- Countries
INSERT INTO countries (code, name) VALUES ('BR', 'Brazil');
INSERT INTO countries (code, name) VALUES ('US', 'United States');

-- Suppliers
INSERT INTO suppliers (id, name, country_code, created_at) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Acme Supplier', 'BR', NOW());

-- Products
INSERT INTO products (id, sku, name, description, category, price, supplier_id, created_at) VALUES
    ('22222222-2222-2222-2222-222222222222',
     'SKU-001',
     'Premium Coffee Beans',
     'High quality arabica coffee beans sourced from Brazilian farms.',
     'beverages',
     29.90,
     '11111111-1111-1111-1111-111111111111',
     NOW());

INSERT INTO products (id, sku, name, description, category, price, supplier_id, created_at) VALUES
    ('33333333-3333-3333-3333-333333333333',
     'SKU-002',
     'Organic Snack Bar',
     'Healthy organic snack bar with nuts and dried fruits inside.',
     'snacks',
     5.50,
     '11111111-1111-1111-1111-111111111111',
     NOW());

-- Product to country links
INSERT INTO product_countries (product_id, country_code) VALUES
    ('22222222-2222-2222-2222-222222222222', 'BR');
INSERT INTO product_countries (product_id, country_code) VALUES
    ('22222222-2222-2222-2222-222222222222', 'US');
INSERT INTO product_countries (product_id, country_code) VALUES
    ('33333333-3333-3333-3333-333333333333', 'BR');

-- Clients
INSERT INTO clients (id, name, segment, country_code, created_at) VALUES
    ('44444444-4444-4444-4444-444444444444', 'Test Client BR', 'retail', 'BR', NOW());
INSERT INTO clients (id, name, segment, country_code, created_at) VALUES
    ('55555555-5555-5555-5555-555555555555', 'Test Client US', 'wholesale', 'US', NOW());

-- Orders for client 4444...
INSERT INTO orders (id, client_id, order_date, total) VALUES
    ('66666666-6666-6666-6666-666666666666',
     '44444444-4444-4444-4444-444444444444',
     NOW(),
     59.80);
INSERT INTO orders (id, client_id, order_date, total) VALUES
    ('77777777-7777-7777-7777-777777777777',
     '44444444-4444-4444-4444-444444444444',
     NOW(),
     11.00);

-- Order items
INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES
    ('88888888-8888-8888-8888-888888888888',
     '66666666-6666-6666-6666-666666666666',
     '22222222-2222-2222-2222-222222222222',
     2,
     29.90);
INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES
    ('99999999-9999-9999-9999-999999999999',
     '77777777-7777-7777-7777-777777777777',
     '33333333-3333-3333-3333-333333333333',
     2,
     5.50);
