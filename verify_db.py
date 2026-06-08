import sqlite3

DB_PATH = "/home/mvl/Documents/AAC crafting app/crafting.db"

def verify():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print("--- Database Verification ---")
    
    # 1. Row counts
    cursor.execute("SELECT COUNT(*) FROM items;")
    items_cnt = cursor.fetchone()[0]
    print(f"Items count: {items_cnt}")
    
    cursor.execute("SELECT COUNT(*) FROM prices;")
    prices_cnt = cursor.fetchone()[0]
    print(f"Prices count: {prices_cnt}")

    cursor.execute("SELECT COUNT(*) FROM recipes;")
    recipes_cnt = cursor.fetchone()[0]
    print(f"Recipes count: {recipes_cnt}")

    cursor.execute("SELECT COUNT(*) FROM recipe_materials;")
    recipe_mats_cnt = cursor.fetchone()[0]
    print(f"Recipe materials count: {recipe_mats_cnt}")
    
    # 2. Check Coin immutability
    print("\nChecking Coin immutability (ID 500)...")
    cursor.execute("SELECT * FROM items WHERE item_id = 500;")
    coin_item = cursor.fetchone()
    print(f"Coin Item Row: {coin_item}")
    assert coin_item is not None, "Coin item missing!"
    assert coin_item[1].lower() == 'coin', f"Item ID 500 is not Coin, it is {coin_item[1]}"
    
    cursor.execute("SELECT * FROM prices WHERE item_id = 500;")
    coin_price = cursor.fetchone()
    print(f"Coin Price Row: {coin_price}")
    assert coin_price is not None, "Coin price missing!"
    # Fields: item_id, avg_24h, vol_24h, avg_7d, vol_7d, avg_30d, vol_30d
    assert coin_price[1] == 0.0001, f"Coin avg_24h should be 0.0001, got {coin_price[1]}"
    assert coin_price[3] == 0.0001, f"Coin avg_7d should be 0.0001, got {coin_price[3]}"
    assert coin_price[5] == 0.0001, f"Coin avg_30d should be 0.0001, got {coin_price[5]}"
    print("Coin immutability assertion PASSED!")
    
    # 3. Check for duplicates in names (case-insensitive)
    print("\nChecking case-insensitive uniqueness of item names...")
    cursor.execute("SELECT LOWER(name), COUNT(*) FROM items GROUP BY LOWER(name) HAVING COUNT(*) > 1;")
    dups = cursor.fetchall()
    print(f"Duplicate names found: {len(dups)}")
    assert len(dups) == 0, f"Found duplicate names: {dups}"
    print("No duplicate case-insensitive names assertion PASSED!")
    
    # 4. Check recipe materials constraints and foreign keys
    print("\nChecking recipe materials constraints and references...")
    cursor.execute("""
        SELECT COUNT(*) FROM recipe_materials rm
        LEFT JOIN items i ON rm.material_item_id = i.item_id
        WHERE i.item_id IS NULL;
    """)
    unreferenced_mats = cursor.fetchone()[0]
    print(f"Recipe materials pointing to invalid items: {unreferenced_mats}")
    assert unreferenced_mats == 0, "Recipe materials pointing to invalid items!"
    
    cursor.execute("""
        SELECT COUNT(*) FROM recipes r
        LEFT JOIN items i ON r.output_item_id = i.item_id
        WHERE i.item_id IS NULL;
    """)
    unreferenced_recipes = cursor.fetchone()[0]
    print(f"Recipes pointing to invalid output items: {unreferenced_recipes}")
    assert unreferenced_recipes == 0, "Recipes pointing to invalid output items!"
    
    print("\nALL VERIFICATIONS PASSED SUCCESSFULLY!")
    conn.close()

if __name__ == '__main__':
    verify()
