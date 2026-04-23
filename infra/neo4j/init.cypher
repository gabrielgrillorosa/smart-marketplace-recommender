// Smart Marketplace Recommender — Neo4j Uniqueness Constraints (M1)
// Executed on Neo4j startup. Vector index (product_embeddings) is added in M3.

CREATE CONSTRAINT product_id IF NOT EXISTS FOR (p:Product) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT client_id IF NOT EXISTS FOR (c:Client) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT category_name IF NOT EXISTS FOR (cat:Category) REQUIRE cat.name IS UNIQUE;
CREATE CONSTRAINT supplier_name IF NOT EXISTS FOR (s:Supplier) REQUIRE s.name IS UNIQUE;
CREATE CONSTRAINT country_code IF NOT EXISTS FOR (co:Country) REQUIRE co.code IS UNIQUE;
