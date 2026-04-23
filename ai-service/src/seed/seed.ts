/**
 * Smart Marketplace Recommender — Seed Script
 *
 * Connects directly to PostgreSQL and Neo4j (bypasses domain layer by design — ADR-001).
 * Seeds both databases with synthetic multi-tenant marketplace data.
 * Idempotent: ON CONFLICT DO NOTHING (PG) + MERGE (Neo4j).
 * Exits 0 on success, 1 on any error or count mismatch.
 */

import { Pool, PoolClient } from 'pg';
import neo4j, { Driver, Session } from 'neo4j-driver';

import { countries } from './data/countries';
import { suppliers } from './data/suppliers';
import { products } from './data/products';
import { clients } from './data/clients';
import { generateOrders } from './data/orders';

const startTime = Date.now();

function log(msg: string): void {
  console.log(`[seed] ${msg}`);
}

function elapsed(): string {
  return `${((Date.now() - startTime) / 1000).toFixed(2)}s`;
}

// ── PostgreSQL helpers ─────────────────────────────────────────────────────────

async function seedPostgres(client: PoolClient): Promise<void> {
  log(`Starting PostgreSQL seeding...`);

  // countries
  let countriesInserted = 0;
  for (const c of countries) {
    const res = await client.query(
      `INSERT INTO countries (code, name) VALUES ($1, $2)
       ON CONFLICT (code) DO NOTHING
       RETURNING code`,
      [c.code, c.name]
    );
    countriesInserted += res.rowCount ?? 0;
  }
  log(`Countries: ${countriesInserted} inserted, ${countries.length - countriesInserted} skipped`);

  // suppliers
  let suppliersInserted = 0;
  for (const s of suppliers) {
    const res = await client.query(
      `INSERT INTO suppliers (id, name, country_code) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO NOTHING
       RETURNING id`,
      [s.id, s.name, s.country_code]
    );
    suppliersInserted += res.rowCount ?? 0;
  }
  log(`Suppliers: ${suppliersInserted} inserted, ${suppliers.length - suppliersInserted} skipped`);

  // products
  let productsInserted = 0;
  for (const p of products) {
    const res = await client.query(
      `INSERT INTO products (id, sku, name, description, category, price, supplier_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (sku) DO NOTHING
       RETURNING id`,
      [p.id, p.sku, p.name, p.description, p.category, p.price, p.supplier_id]
    );
    productsInserted += res.rowCount ?? 0;
  }
  log(`Products: ${productsInserted} inserted, ${products.length - productsInserted} skipped`);

  // product_countries (junction)
  let pcInserted = 0;
  for (const p of products) {
    for (const countryCode of p.available_in) {
      const res = await client.query(
        `INSERT INTO product_countries (product_id, country_code) VALUES ($1, $2)
         ON CONFLICT (product_id, country_code) DO NOTHING
         RETURNING product_id`,
        [p.id, countryCode]
      );
      pcInserted += res.rowCount ?? 0;
    }
  }
  log(`Product-Countries: ${pcInserted} inserted`);

  // clients
  let clientsInserted = 0;
  for (const c of clients) {
    const res = await client.query(
      `INSERT INTO clients (id, name, segment, country_code, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [c.id, c.name, c.segment, c.country_code, c.created_at]
    );
    clientsInserted += res.rowCount ?? 0;
  }
  log(`Clients: ${clientsInserted} inserted, ${clients.length - clientsInserted} skipped`);

  // orders + order_items
  const orders = generateOrders(clients, products);
  let ordersInserted = 0;
  let itemsInserted = 0;
  for (const order of orders) {
    const res = await client.query(
      `INSERT INTO orders (id, client_id, order_date, total)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [order.id, order.client_id, order.order_date, order.total]
    );
    if ((res.rowCount ?? 0) > 0) {
      ordersInserted++;
      for (const item of order.items) {
        const itemRes = await client.query(
          `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
          [item.id, order.id, item.product_id, item.quantity, item.unit_price]
        );
        itemsInserted += itemRes.rowCount ?? 0;
      }
    }
  }
  log(`Orders: ${ordersInserted} inserted, ${orders.length - ordersInserted} skipped`);
  log(`Order Items: ${itemsInserted} inserted`);

  log(`PostgreSQL seeding complete (${elapsed()})`);
}

// ── Neo4j helpers ─────────────────────────────────────────────────────────────

async function applyNeo4jConstraints(session: Session): Promise<void> {
  log(`Applying Neo4j uniqueness constraints...`);
  const constraints = [
    `CREATE CONSTRAINT product_id IF NOT EXISTS FOR (p:Product) REQUIRE p.id IS UNIQUE`,
    `CREATE CONSTRAINT client_id IF NOT EXISTS FOR (c:Client) REQUIRE c.id IS UNIQUE`,
    `CREATE CONSTRAINT category_name IF NOT EXISTS FOR (cat:Category) REQUIRE cat.name IS UNIQUE`,
    `CREATE CONSTRAINT supplier_name IF NOT EXISTS FOR (s:Supplier) REQUIRE s.name IS UNIQUE`,
    `CREATE CONSTRAINT country_code IF NOT EXISTS FOR (co:Country) REQUIRE co.code IS UNIQUE`,
  ];
  for (const stmt of constraints) {
    await session.run(stmt);
  }
  log(`Constraints: 5 uniqueness constraints applied`);
}

async function seedNeo4j(session: Session): Promise<void> {
  log(`Starting Neo4j seeding...`);
  await applyNeo4jConstraints(session);

  // Countries
  await session.run(
    `UNWIND $countries AS c
     MERGE (co:Country {code: c.code})
     SET co.name = c.name`,
    { countries }
  );
  log(`Country nodes: MERGE complete`);

  // Suppliers
  await session.run(
    `UNWIND $suppliers AS s
     MERGE (sup:Supplier {name: s.name})
     SET sup.id = s.id, sup.country = s.country_code`,
    { suppliers }
  );
  log(`Supplier nodes: MERGE complete`);

  // Categories (derived from products)
  const categoryNames = [...new Set(products.map((p) => p.category))];
  await session.run(
    `UNWIND $categories AS name
     MERGE (cat:Category {name: name})`,
    { categories: categoryNames }
  );
  log(`Category nodes: MERGE complete`);

  // Products + relationships BELONGS_TO, SUPPLIED_BY, AVAILABLE_IN
  await session.run(
    `UNWIND $products AS p
     MERGE (prod:Product {id: p.id})
     SET prod.sku = p.sku,
         prod.name = p.name,
         prod.description = p.description,
         prod.price = p.price,
         prod.category = p.category

     WITH prod, p
     MATCH (cat:Category {name: p.category})
     MERGE (prod)-[:BELONGS_TO]->(cat)

     WITH prod, p
     MATCH (sup:Supplier {id: p.supplier_id})
     MERGE (prod)-[:SUPPLIED_BY]->(sup)`,
    {
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        description: p.description,
        price: p.price,
        category: p.category,
        supplier_id: p.supplier_id,
      })),
    }
  );

  // AVAILABLE_IN relationships (separate pass to avoid cartesian complexity)
  for (const p of products) {
    for (const countryCode of p.available_in) {
      await session.run(
        `MATCH (prod:Product {id: $productId}), (co:Country {code: $code})
         MERGE (prod)-[:AVAILABLE_IN]->(co)`,
        { productId: p.id, code: countryCode }
      );
    }
  }
  log(`Product nodes + BELONGS_TO + SUPPLIED_BY + AVAILABLE_IN: MERGE complete`);

  // Clients
  await session.run(
    `UNWIND $clients AS c
     MERGE (cl:Client {id: c.id})
     SET cl.name = c.name,
         cl.segment = c.segment,
         cl.country = c.country_code`,
    { clients }
  );
  log(`Client nodes: MERGE complete`);

  // BOUGHT relationships (from orders)
  const orders = generateOrders(clients, products);
  const boughtRels: Array<{
    clientId: string;
    productId: string;
    itemId: string;
    quantity: number;
    order_date: string;
  }> = [];
  for (const order of orders) {
    for (const item of order.items) {
      boughtRels.push({
        clientId: order.client_id,
        productId: item.product_id,
        itemId: item.id,
        quantity: item.quantity,
        order_date: order.order_date,
      });
    }
  }

  await session.run(
    `UNWIND $rels AS r
     MATCH (cl:Client {id: r.clientId}), (prod:Product {id: r.productId})
     MERGE (cl)-[b:BOUGHT {item_id: r.itemId}]->(prod)
     SET b.quantity = r.quantity, b.order_date = r.order_date`,
    { rels: boughtRels }
  );
  log(`BOUGHT relationships: MERGE complete (${boughtRels.length} relationships)`);

  log(`Neo4j seeding complete (${elapsed()})`);
}

// ── Cross-count verification ───────────────────────────────────────────────────

async function verifyCounts(pgClient: PoolClient, session: Session): Promise<void> {
  log(`Running cross-count verification...`);

  const pgProductsRes = await pgClient.query(`SELECT COUNT(*)::int AS count FROM products`);
  const pgProductCount: number = pgProductsRes.rows[0].count;

  const neo4jProductsRes = await session.run(`MATCH (p:Product) RETURN count(p) AS count`);
  const neo4jProductCount = neo4jProductsRes.records[0].get('count').toNumber();

  const pgOrderItemsRes = await pgClient.query(`SELECT COUNT(*)::int AS count FROM order_items`);
  const pgOrderItemCount: number = pgOrderItemsRes.rows[0].count;

  const neo4jBoughtRes = await session.run(`MATCH ()-[r:BOUGHT]->() RETURN count(r) AS count`);
  const neo4jBoughtCount = neo4jBoughtRes.records[0].get('count').toNumber();

  log(`Products — PostgreSQL: ${pgProductCount}, Neo4j: ${neo4jProductCount}`);
  log(`Order items — PostgreSQL: ${pgOrderItemCount}, Neo4j BOUGHT: ${neo4jBoughtCount}`);

  let hasError = false;
  if (pgProductCount !== neo4jProductCount) {
    log(`ERROR: Product count mismatch! PG=${pgProductCount} vs Neo4j=${neo4jProductCount}`);
    hasError = true;
  }
  if (pgOrderItemCount !== neo4jBoughtCount) {
    log(`ERROR: Order item/BOUGHT count mismatch! PG=${pgOrderItemCount} vs Neo4j=${neo4jBoughtCount}`);
    hasError = true;
  }

  if (hasError) {
    log(`Cross-count verification FAILED — exiting with code 1`);
    process.exit(1);
  }

  log(`Cross-count verification PASSED`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const POSTGRES_HOST = process.env.POSTGRES_HOST ?? 'localhost';
  const POSTGRES_PORT = process.env.POSTGRES_PORT ?? '5432';
  const POSTGRES_DB = process.env.POSTGRES_DB ?? 'marketplace';
  const POSTGRES_USER = process.env.POSTGRES_USER ?? 'postgres';
  const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD ?? 'postgres';

  const NEO4J_URI = process.env.NEO4J_URI ?? 'bolt://localhost:7687';
  const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
  const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? 'password123';

  log(`Starting — target: postgres:${POSTGRES_HOST}:${POSTGRES_PORT}, neo4j:${NEO4J_URI}`);
  log(`Timestamp: ${new Date().toISOString()}`);

  // PostgreSQL connection
  const pool = new Pool({
    host: POSTGRES_HOST,
    port: parseInt(POSTGRES_PORT, 10),
    database: POSTGRES_DB,
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
  });

  let pgClient: PoolClient;
  try {
    pgClient = await pool.connect();
    log(`Connected to PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}`);
  } catch (err) {
    log(`ERROR: Cannot connect to PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT} — ${(err as Error).message}`);
    process.exit(1);
  }

  // Neo4j connection
  let driver: Driver;
  let session: Session;
  try {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    session = driver.session();
    await session.run('RETURN 1');
    log(`Connected to Neo4j at ${NEO4J_URI}`);
  } catch (err) {
    log(`ERROR: Cannot connect to Neo4j at ${NEO4J_URI} — ${(err as Error).message}`);
    pgClient!.release();
    await pool.end();
    process.exit(1);
  }

  try {
    await seedPostgres(pgClient!);
    await seedNeo4j(session!);
    await verifyCounts(pgClient!, session!);

    const totalElapsed = elapsed();
    log(`─────────────────────────────────────────`);
    log(`Seed complete in ${totalElapsed}`);
    log(`  PostgreSQL: countries=${countries.length}, suppliers=${suppliers.length}, products=${products.length}, clients=${clients.length}`);
    log(`  Neo4j: all 5 node types + 4 relationship types merged`);
    log(`─────────────────────────────────────────`);
  } catch (err) {
    log(`ERROR: Unexpected failure — ${(err as Error).message}`);
    process.exit(1);
  } finally {
    pgClient!.release();
    await pool.end();
    await session!.close();
    await driver!.close();
  }
}

main();
