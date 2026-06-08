/**
 * SQLite WASM High-Load Stress Test Benchmarking Script
 * Path: src/db/benchmarks/query_stress_test.ts
 */

export interface BenchmarkMetrics {
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  totalTimeMs: number;
  queriesRun: number;
  frameBudgetOk: boolean;
  subMillisecondOk: boolean;
}

/**
 * Execute stress tests against the SQLite WASM environment.
 * @param db SQLiteDatabase wrapper instance from SQLiteContext
 */
export async function runStressTest(db: any): Promise<BenchmarkMetrics> {
  const queryCount = 1000;
  const latencies: number[] = [];

  // Mixed query pool simulating user searches, pricing queries, and crafting calculations
  const queries = [
    // Complex join querying crafting materials, output items, and historical average prices
    `SELECT i.name, r.req_labor, rm.amount, mat.name AS material_name, p.avg_30d, p.avg_7d
     FROM items i INDEXED BY idx_items_lookup
     JOIN recipes r ON r.output_item_id = i.item_id
     JOIN recipe_materials rm ON rm.recipe_id = r.recipe_id
     JOIN items mat ON rm.material_item_id = mat.item_id
     LEFT JOIN prices p ON mat.item_id = p.item_id
     WHERE i.name LIKE ? LIMIT 10;`,

    // Price query on 7d & 30d averages
    `SELECT i.name, p.avg_7d, p.avg_30d
     FROM items i
     JOIN prices p ON i.item_id = p.item_id
     WHERE p.avg_7d > ? AND p.avg_30d < ?
     ORDER BY p.avg_30d DESC LIMIT 20;`,

    // Material lookup query optimized via idx_recipe_materials_mat_lookup
    `SELECT r.recipe_id, i.name AS output_item, rm.amount
     FROM recipe_materials rm INDEXED BY idx_recipe_materials_mat_lookup
     JOIN recipes r ON rm.recipe_id = r.recipe_id
     JOIN items i ON r.output_item_id = i.item_id
     WHERE rm.material_item_id = ? LIMIT 10;`
  ];

  // Parameters to randomize lookup constraints
  const names = ['wine', 'liquor', 'honey', 'iron', 'leather', 'fabric', 'lumber', 'stone', 'potion', 'armor'];
  
  const startTimeTotal = performance.now();

  for (let i = 0; i < queryCount; i++) {
    const queryIdx = i % queries.length;
    const sql = queries[queryIdx];
    let params: any[] = [];

    if (queryIdx === 0) {
      const name = names[Math.floor(Math.random() * names.length)];
      params = [`%${name}%`];
    } else if (queryIdx === 1) {
      const min7d = Math.random() * 10;
      const max30d = min7d + Math.random() * 50;
      params = [min7d, max30d];
    } else {
      // Look up material ID 500 (Coin) or random IDs
      const materialId = Math.random() > 0.5 ? 500 : Math.floor(Math.random() * 1000) + 1;
      params = [materialId];
    }

    const tStart = performance.now();
    db.exec({ sql, bind: params });
    const tEnd = performance.now();

    latencies.push(tEnd - tStart);
  }

  const endTimeTotal = performance.now();
  const totalTimeMs = endTimeTotal - startTimeTotal;

  // Latency calculation sorting
  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((acc, v) => acc + v, 0);
  const avgLatencyMs = sum / queryCount;
  
  const p95Idx = Math.floor(queryCount * 0.95);
  const p99Idx = Math.floor(queryCount * 0.99);
  const p95LatencyMs = latencies[p95Idx];
  const p99LatencyMs = latencies[p99Idx];

  // Frame constraint verification (batch execution <= 16ms to avoid blocking main thread at 60 FPS)
  // Check if total stress-test run behaves safely on thread locks per loop chunk (under 16ms)
  const frameBudgetOk = totalTimeMs < 16;
  const subMillisecondOk = avgLatencyMs < 1.0;

  const metrics: BenchmarkMetrics = {
    avgLatencyMs,
    p95LatencyMs,
    p99LatencyMs,
    totalTimeMs,
    queriesRun: queryCount,
    frameBudgetOk,
    subMillisecondOk
  };

  // Log matrix result to console
  console.log(`
=========================================
SQLITE WASM QUERY BENCHMARK PERFORMANCE
=========================================
Queries Executed : ${queryCount}
Total Time       : ${totalTimeMs.toFixed(2)} ms
Average Latency  : ${avgLatencyMs.toFixed(4)} ms
p95 Latency      : ${p95LatencyMs.toFixed(4)} ms
p99 Latency      : ${p99LatencyMs.toFixed(4)} ms
-----------------------------------------
Sub-millisecond Check : ${subMillisecondOk ? 'PASSED ✅' : 'FAILED ❌'}
Frame Budget Check    : ${frameBudgetOk ? 'PASSED ✅ (No thread-lock risk)' : 'WARNING ⚠️ (Batch took ' + totalTimeMs.toFixed(2) + 'ms)'}
=========================================
`);

  return metrics;
}
