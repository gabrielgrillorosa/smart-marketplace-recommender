/**
 * Smart Marketplace Recommender — Seed Script
 *
 * Connects directly to PostgreSQL and Neo4j (bypasses domain layer by design — ADR-001).
 * Seeds both databases with synthetic multi-tenant marketplace data.
 * Idempotent: ON CONFLICT DO NOTHING (PG) + MERGE (Neo4j).
 *
 * Two entry points:
 *   - `runSeed({ pool, driver, logger })` — programmatic, used by AutoSeedService at boot.
 *   - `main()` — CLI, run via `npm run seed`. Exits 0 on success, 1 on any error or count mismatch.
 */

import { Pool, PoolClient } from 'pg';
import neo4j, { Driver, Session } from 'neo4j-driver';

import { countries } from './data/countries';
import { suppliers } from './data/suppliers';
import { products } from './data/products';
import { clients } from './data/clients';
import { generateOrders } from './data/orders';

export interface SeedLogger {
  info(msg: string): void;
  warn?(msg: string): void;
  error?(msg: string): void;
}

interface InternalLogger {
  log(msg: string): void;
  elapsed(): string;
}

function createInternalLogger(externalLogger?: SeedLogger): InternalLogger {
  const startTime = Date.now();
  return {
    log(msg: string): void {
      const formatted = `[seed] ${msg}`;
      if (externalLogger) {
        externalLogger.info(formatted);
      } else {
        console.log(formatted);
      }
    },
    elapsed(): string {
      return `${((Date.now() - startTime) / 1000).toFixed(2)}s`;
    },
  };
}

// ── PostgreSQL helpers ─────────────────────────────────────────────────────────

async function seedPostgres(client: PoolClient, logger: InternalLogger): Promise<void> {
  logger.log(`Starting PostgreSQL seeding...`);

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
  logger.log(`Countries: ${countriesInserted} inserted, ${countries.length - countriesInserted} skipped`);

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
  logger.log(`Suppliers: ${suppliersInserted} inserted, ${suppliers.length - suppliersInserted} skipped`);

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
  logger.log(`Products: ${productsInserted} inserted, ${products.length - productsInserted} skipped`);

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
  logger.log(`Product-Countries: ${pcInserted} inserted`);

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
  logger.log(`Clients: ${clientsInserted} inserted, ${clients.length - clientsInserted} skipped`);

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
    }
    // Always upsert line items: if the order row already existed (conflict) but items were
    // missing — e.g. partial DB wipe — we still repair order_items (idempotent).
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
  logger.log(`Orders: ${ordersInserted} inserted, ${orders.length - ordersInserted} skipped`);
  logger.log(`Order Items: ${itemsInserted} inserted`);

  logger.log(`PostgreSQL seeding complete (${logger.elapsed()})`);
}

// ── Neo4j helpers ─────────────────────────────────────────────────────────────

async function applyNeo4jConstraints(session: Session, logger: InternalLogger): Promise<void> {
  logger.log(`Applying Neo4j uniqueness constraints...`);
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
  logger.log(`Constraints: 5 uniqueness constraints applied`);
}

async function seedNeo4j(session: Session, logger: InternalLogger): Promise<void> {
  logger.log(`Starting Neo4j seeding...`);
  await applyNeo4jConstraints(session, logger);

  await session.run(
    `UNWIND $countries AS c
     MERGE (co:Country {code: c.code})
     SET co.name = c.name`,
    { countries }
  );
  logger.log(`Country nodes: MERGE complete`);

  await session.run(
    `UNWIND $suppliers AS s
     MERGE (sup:Supplier {name: s.name})
     SET sup.id = s.id, sup.country = s.country_code`,
    { suppliers }
  );
  logger.log(`Supplier nodes: MERGE complete`);

  const categoryNames = [...new Set(products.map((p) => p.category))];
  await session.run(
    `UNWIND $categories AS name
     MERGE (cat:Category {name: name})`,
    { categories: categoryNames }
  );
  logger.log(`Category nodes: MERGE complete`);

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

  for (const p of products) {
    for (const countryCode of p.available_in) {
      await session.run(
        `MATCH (prod:Product {id: $productId}), (co:Country {code: $code})
         MERGE (prod)-[:AVAILABLE_IN]->(co)`,
        { productId: p.id, code: countryCode }
      );
    }
  }
  logger.log(`Product nodes + BELONGS_TO + SUPPLIED_BY + AVAILABLE_IN: MERGE complete`);

  await session.run(
    `UNWIND $clients AS c
     MERGE (cl:Client {id: c.id})
     SET cl.name = c.name,
         cl.segment = c.segment,
         cl.country = c.country_code`,
    { clients }
  );
  logger.log(`Client nodes: MERGE complete`);

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
  logger.log(`BOUGHT relationships: MERGE complete (${boughtRels.length} relationships)`);

  logger.log(`Neo4j seeding complete (${logger.elapsed()})`);
}

// ── Cross-count verification ───────────────────────────────────────────────────

/**
 * Throws SeedVerificationError if PG and Neo4j counts diverge.
 * Used by both runSeed (programmatic) and main (CLI).
 */
export class SeedVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedVerificationError';
  }
}

async function verifyCounts(
  pgClient: PoolClient,
  session: Session,
  logger: InternalLogger
): Promise<void> {
  logger.log(`Running cross-count verification...`);

  const pgProductsRes = await pgClient.query(`SELECT COUNT(*)::int AS count FROM products`);
  const pgProductCount: number = pgProductsRes.rows[0].count;

  const neo4jProductsRes = await session.run(`MATCH (p:Product) RETURN count(p) AS count`);
  const neo4jProductCount = neo4jProductsRes.records[0].get('count').toNumber();

  const pgOrderItemsRes = await pgClient.query(`SELECT COUNT(*)::int AS count FROM order_items`);
  const pgOrderItemCount: number = pgOrderItemsRes.rows[0].count;

  const neo4jBoughtRes = await session.run(`MATCH ()-[r:BOUGHT]->() RETURN count(r) AS count`);
  const neo4jBoughtCount = neo4jBoughtRes.records[0].get('count').toNumber();

  logger.log(`Products — PostgreSQL: ${pgProductCount}, Neo4j: ${neo4jProductCount}`);
  logger.log(`Order items — PostgreSQL: ${pgOrderItemCount}, Neo4j BOUGHT: ${neo4jBoughtCount}`);

  const errors: string[] = [];
  if (pgProductCount !== neo4jProductCount) {
    errors.push(`Product count mismatch: PG=${pgProductCount} vs Neo4j=${neo4jProductCount}`);
  }
  if (pgOrderItemCount !== neo4jBoughtCount) {
    errors.push(`Order item/BOUGHT count mismatch: PG=${pgOrderItemCount} vs Neo4j=${neo4jBoughtCount}`);
  }

  if (errors.length > 0) {
    const msg = `Cross-count verification FAILED — ${errors.join('; ')}`;
    logger.log(`ERROR: ${msg}`);
    throw new SeedVerificationError(msg);
  }

  logger.log(`Cross-count verification PASSED`);
}


export interface RunSeedOptions {
  pool: Pool;
  driver: Driver;
  logger?: SeedLogger;
}


export async function isAlreadySeeded(pool: Pool, driver: Driver): Promise<boolean> {
  const pgRes = await pool.query(`SELECT COUNT(*)::int AS c FROM products`);
  const pgCount: number = pgRes.rows[0].c;
  if (pgCount === 0) return false;

  // Catalog-only PG (products without purchase history) used to pass this check and skip
  // AutoSeed — training then saw ~0 orders. Require at least one order line.
  const itemsRes = await pool.query(`SELECT COUNT(*)::int AS c FROM order_items`);
  const orderItemCount: number = itemsRes.rows[0].c;
  if (orderItemCount === 0) return false;

  const session = driver.session();
  try {
    const neoRes = await session.run(`MATCH (p:Product) RETURN count(p) AS c`);
    const neoCount = neoRes.records[0].get('c').toNumber();
    return neoCount > 0;
  } finally {
    await session.close();
  }
}


export async function runSeed(opts: RunSeedOptions): Promise<void> {
  const logger = createInternalLogger(opts.logger);
  const pgClient = await opts.pool.connect();
  const session = opts.driver.session();
  try {
    await seedPostgres(pgClient, logger);
    await seedNeo4j(session, logger);
    await verifyCounts(pgClient, session, logger);
    logger.log(`─────────────────────────────────────────`);
    logger.log(`Seed complete in ${logger.elapsed()}`);
    logger.log(`  PostgreSQL: countries=${countries.length}, suppliers=${suppliers.length}, products=${products.length}, clients=${clients.length}`);
    logger.log(`  Neo4j: all 5 node types + 4 relationship types merged`);
    logger.log(`─────────────────────────────────────────`);
  } finally {
    pgClient.release();
    await session.close();
  }
}

// ── CLI entry point ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const POSTGRES_HOST = process.env.POSTGRES_HOST ?? 'localhost';
  const POSTGRES_PORT = process.env.POSTGRES_PORT ?? '5432';
  const POSTGRES_DB = process.env.POSTGRES_DB ?? 'marketplace';
  const POSTGRES_USER = process.env.POSTGRES_USER ?? 'postgres';
  const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD ?? 'postgres';

  const NEO4J_URI = process.env.NEO4J_URI ?? 'bolt://localhost:7687';
  const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
  const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? 'password123';

  const cliLogger = createInternalLogger();
  cliLogger.log(`Starting — target: postgres:${POSTGRES_HOST}:${POSTGRES_PORT}, neo4j:${NEO4J_URI}`);
  cliLogger.log(`Timestamp: ${new Date().toISOString()}`);

  const pool = new Pool({
    host: POSTGRES_HOST,
    port: parseInt(POSTGRES_PORT, 10),
    database: POSTGRES_DB,
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
  });

  let driver: Driver | undefined;
  try {
    // Eager connectivity probe so CLI fails fast with a clear message.
    const probeClient = await pool.connect();
    cliLogger.log(`Connected to PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}`);
    probeClient.release();

    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    const probeSession = driver.session();
    try {
      await probeSession.run('RETURN 1');
      cliLogger.log(`Connected to Neo4j at ${NEO4J_URI}`);
    } finally {
      await probeSession.close();
    }

    await runSeed({ pool, driver });
  } catch (err) {
    cliLogger.log(`ERROR: ${(err as Error).message}`);
    await pool.end().catch(() => {});
    if (driver) await driver.close().catch(() => {});
    process.exit(1);
  }

  await pool.end();
  await driver.close();
  process.exit(0);
}

// Only auto-run when invoked directly (e.g., via `npm run seed` / `ts-node src/seed/seed.ts`).
// Importing this module from elsewhere (AutoSeedService) does NOT trigger main().
if (require.main === module) {
  main();
}
