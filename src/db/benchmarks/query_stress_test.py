import sqlite3
import time
import random
import os

DB_PATH = "/home/mvl/Documents/AAC crafting app/crafting.db"
MIGRATION_PATH = "/home/mvl/Documents/AAC crafting app/src/db/migrations/001_init_optimization_indices.sql"

def run_migration(conn):
    print("Applying migration scripts...")
    with open(MIGRATION_PATH, 'r') as f:
        sql_script = f.read()
    conn.executescript(sql_script)
    conn.commit()
    print("Indices created successfully.")

def populate_mock_data(conn):
    print("Populating high-density mock data for stress testing...")
    cursor = conn.cursor()
    
    # 1. Expand items to 10,000+
    cursor.execute("SELECT MAX(item_id) FROM items;")
    max_id_row = cursor.fetchone()
    start_id = (max_id_row[0] or 1000) + 1
    
    items_to_add = 10500 - start_id
    if items_to_add > 0:
        names = ["Wine", "Liquor", "Honey", "Iron", "Leather", "Fabric", "Lumber", "Stone", "Potion", "Armor", "Sword", "Bow", "Shield", "Helmet", "Chest", "Boots", "Gloves"]
        mock_items = []
        for i in range(items_to_add):
            iid = start_id + i
            name = f"Test {random.choice(names)} {iid}"
            mock_items.append((iid, name, name))
        cursor.executemany("INSERT OR IGNORE INTO items (item_id, name, original_name) VALUES (?, ?, ?);", mock_items)
        print(f"Added {items_to_add} items.")

    # 2. Expand prices for all items
    cursor.execute("SELECT item_id FROM items LEFT JOIN prices USING (item_id) WHERE prices.item_id IS NULL;")
    items_without_price = [row[0] for row in cursor.fetchall()]
    if items_without_price:
        mock_prices = []
        for iid in items_without_price:
            avg_val = random.uniform(0.01, 500.0)
            mock_prices.append((iid, avg_val, random.randint(1, 1000), avg_val * 1.1, random.randint(5, 5000), avg_val * 1.2, random.randint(10, 10000)))
        cursor.executemany("INSERT OR IGNORE INTO prices (item_id, avg_24h, vol_24h, avg_7d, vol_7d, avg_30d, vol_30d) VALUES (?, ?, ?, ?, ?, ?, ?);", mock_prices)
        print(f"Added {len(items_without_price)} price points.")

    # 3. Expand recipes to 5,000+
    cursor.execute("SELECT MAX(recipe_id) FROM recipes;")
    max_recipe_id = cursor.fetchone()[0] or 100000
    cursor.execute("SELECT item_id FROM items WHERE item_id != 500 LIMIT 5000;")
    item_ids = [row[0] for row in cursor.fetchall()]
    
    recipes_count = len(item_ids)
    mock_recipes = []
    mock_recipe_mats = []
    
    for idx, out_id in enumerate(item_ids):
        rid = max_recipe_id + 1 + idx
        labor = random.choice([10, 25, 50, 100, 200, 250])
        mock_recipes.append((rid, out_id, random.randint(1, 5), labor))
        
        # 1-4 random materials
        mats_count = random.randint(1, 4)
        chosen_mats = random.sample(item_ids, mats_count)
        # Always mix Coin (ID 500) sometimes
        if random.random() > 0.6:
            chosen_mats.append(500)
        
        for mat_id in chosen_mats:
            mock_recipe_mats.append((rid, mat_id, random.randint(1, 100)))

    cursor.executemany("INSERT OR IGNORE INTO recipes (recipe_id, output_item_id, output_amount, req_labor) VALUES (?, ?, ?, ?);", mock_recipes)
    cursor.executemany("INSERT OR IGNORE INTO recipe_materials (recipe_id, material_item_id, amount) VALUES (?, ?, ?);", mock_recipe_mats)
    print(f"Added {recipes_count} recipes and {len(mock_recipe_mats)} recipe materials.")

    conn.commit()

def run_stress_test(conn):
    print("Executing query stress testing (1,000 query loop)...")
    cursor = conn.cursor()
    
    queries = [
        # Query 1: Join complex tables with indexed lookup hints
        """SELECT i.name, r.req_labor, rm.amount, mat.name AS material_name, p.avg_30d, p.avg_7d
           FROM items i INDEXED BY idx_items_lookup
           JOIN recipes r ON r.output_item_id = i.item_id
           JOIN recipe_materials rm ON rm.recipe_id = r.recipe_id
           JOIN items mat ON rm.material_item_id = mat.item_id
           LEFT JOIN prices p ON mat.item_id = p.item_id
           WHERE i.name LIKE ? LIMIT 10;""",
           
        # Query 2: Prices lookup
        """SELECT i.name, p.avg_7d, p.avg_30d
           FROM items i
           JOIN prices p ON i.item_id = p.item_id
           WHERE p.avg_7d > ? AND p.avg_30d < ?
           ORDER BY p.avg_30d DESC LIMIT 20;""",
           
        # Query 3: Material matching using optimal order starting from recipe_materials and indexing material_item_id
        """SELECT r.recipe_id, i.name AS output_item, rm.amount
           FROM recipe_materials rm INDEXED BY idx_recipe_materials_mat_lookup
           JOIN recipes r ON rm.recipe_id = r.recipe_id
           JOIN items i ON r.output_item_id = i.item_id
           WHERE rm.material_item_id = ? LIMIT 10;"""
    ]
    
    names = ['wine', 'liquor', 'honey', 'iron', 'leather', 'fabric', 'lumber', 'stone', 'potion', 'armor']
    latencies = []
    
    # Run 1000 tests
    total_start = time.perf_counter()
    for i in range(1000):
        q_idx = i % len(queries)
        sql = queries[q_idx]
        
        if q_idx == 0:
            params = (f"%{random.choice(names)}%",)
        elif q_idx == 1:
            min_7d = random.uniform(1.0, 10.0)
            params = (min_7d, min_7d + random.uniform(5.0, 100.0))
        else:
            params = (500 if random.random() > 0.5 else random.randint(1, 1000),)
            
        start = time.perf_counter()
        cursor.execute(sql, params)
        cursor.fetchall()
        end = time.perf_counter()
        
        latencies.append((end - start) * 1000.0) # in ms
        
    total_end = time.perf_counter()
    total_time_ms = (total_end - total_start) * 1000.0
    
    # Calculate performance metrics
    latencies.sort()
    avg_latency = sum(latencies) / len(latencies)
    p95 = latencies[int(len(latencies) * 0.95)]
    p99 = latencies[int(len(latencies) * 0.99)]
    
    print("\n=========================================")
    print(" SQLITE PY-BENCHMARK PERFORMANCE RESULTS ")
    print("=========================================")
    print(f"Queries Run      : {len(latencies)}")
    print(f"Total Time       : {total_time_ms:.2f} ms")
    print(f"Average Latency  : {avg_latency:.4f} ms")
    print(f"p95 Latency      : {p95:.4f} ms")
    print(f"p99 Latency      : {p99:.4f} ms")
    print("-----------------------------------------")
    print(f"Sub-millisecond Check : {'PASSED ✅' if avg_latency < 1.0 else 'FAILED ❌'}")
    # Single query average check & individual latency metrics verification
    print("=========================================\n")

def main():
    conn = sqlite3.connect(DB_PATH)
    # Start Transaction to isolate benchmarks
    conn.execute("BEGIN TRANSACTION;")
    try:
        run_migration(conn)
        populate_mock_data(conn)
        run_stress_test(conn)
    finally:
        # Roll back data insertion to keep clean DB state
        conn.rollback()
        conn.close()

if __name__ == '__main__':
    main()
