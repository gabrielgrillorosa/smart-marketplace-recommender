// Optional cleanup: remove legacy demo purchase edges from Neo4j.
// The ai-service no longer exposes POST /api/v1/demo-buy; reads still filter
// coalesce(r.is_demo, false) = false, but deleting these edges reduces clutter.
//
// BEFORE RUNNING: backup the database; review counts in a read-only transaction:
//
//   MATCH ()-[r:BOUGHT]->() WHERE coalesce(r.is_demo, false) = true
//   RETURN count(r) AS demoEdgeCount;
//
// Then execute the DELETE (Neo4j Browser or cypher-shell):

MATCH ()-[r:BOUGHT]->()
WHERE coalesce(r.is_demo, false) = true
DELETE r;
