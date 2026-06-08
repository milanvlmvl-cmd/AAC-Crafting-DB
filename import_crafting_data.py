import csv
import json
import re
import sqlite3
import os
import shutil

# Paths to input files
ITEMS_CSV = "/home/mvl/Documents/AAC crafting app/items.csv"
PRICE_CSV = "/home/mvl/Documents/AAC crafting app/price.csv"
RECIPES_CSV = "/home/mvl/Documents/AAC crafting app/recipes.csv"
DB_PATH = "/home/mvl/Documents/AAC crafting app/crafting.db"
PUBLIC_DB_PATH = "/home/mvl/Documents/AAC crafting app/public/crafting.db"

def clean_name(name):
    if not name:
        return ""
    name = name.strip()
    # Strip leading/trailing carets
    if name.startswith('^') and name.endswith('^'):
        name = name[1:-1].strip()
    elif name.startswith('^'):
        name = name[1:].strip()
    elif name.endswith('^'):
        name = name[:-1].strip()
        
    # Split on pipe character and take first element (English)
    if '|' in name:
        name = name.split('|')[0].strip()
        
    # Remove DEPRECATED suffix case-insensitively
    name = re.sub(r'\s*\(?deprecated\)?\s*$', '', name, flags=re.IGNORECASE)
    
    return name.strip()

def parse_int(val):
    if not val or val.strip() == '':
        return None
    try:
        digits = re.sub(r'[^\d]', '', val)
        return int(digits) if digits else None
    except ValueError:
        return None

def parse_float(val):
    if not val or val.strip() == '':
        return None
    try:
        return float(val.replace(',', ''))
    except ValueError:
        return None

def import_data():
    # Step 1: Establish unique names and original names for each ID
    # Priority: items.csv first, then price.csv
    id_to_name = {}
    id_to_original_name = {}
    
    print("Reading items.csv...")
    with open(ITEMS_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_id = row.get('item_id')
            raw_name = row.get('item_name')
            if not raw_id or not raw_name:
                continue
            iid = parse_int(raw_id)
            if iid is None:
                continue
            
            cname = clean_name(raw_name)
            if cname:
                id_to_name[iid] = cname
                id_to_original_name[iid] = raw_name

    print("Reading price.csv...")
    price_raw_data = {}
    with open(PRICE_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_id = row.get('item_id')
            raw_name = row.get('item_name')
            if not raw_id:
                continue
            iid = parse_int(raw_id)
            if iid is None:
                continue
            
            cname = clean_name(raw_name or "")
            if not cname:
                continue
                
            price_row = {
                'avg_24h': parse_float(row.get('24h_avg')),
                'vol_24h': parse_int(row.get('24h_vol')),
                'avg_7d': parse_float(row.get('7d_avg')),
                'vol_7d': parse_int(row.get('7d_vol')),
                'avg_30d': parse_float(row.get('30d_avg')),
                'vol_30d': parse_int(row.get('30d_vol')),
            }
            
            if iid in id_to_name:
                # Only merge price if names match case-insensitively
                if id_to_name[iid].lower() == cname.lower():
                    price_raw_data[iid] = price_row
                else:
                    # Name mismatch! Skip merging price data.
                    print(f"Skipping price data for ID {iid} due to name mismatch: items.csv='{id_to_name[iid]}', price.csv='{cname}'")
            else:
                # ID not in items.csv. Keep it as a separate item.
                id_to_name[iid] = cname
                id_to_original_name[iid] = raw_name or cname
                price_raw_data[iid] = price_row

    # Step 2: Consolidate names case-insensitively
    # Group IDs by lowercase cleaned name
    name_to_ids = {}
    for iid, name in id_to_name.items():
        name_lower = name.lower()
        name_to_ids.setdefault(name_lower, set()).add(iid)

    canonical_name_map = {} # lowercase_cleaned_name -> canonical_id
    id_to_canonical = {}    # original_id -> canonical_id

    for name_lower, ids in name_to_ids.items():
        if name_lower == 'coin':
            canonical_id = 500
        else:
            # Prefer IDs that existed in items.csv
            items_ids = [i for i in ids if i in id_to_original_name]
            if items_ids:
                canonical_id = min(items_ids)
            else:
                canonical_id = min(ids)
                
        canonical_name_map[name_lower] = canonical_id
        for iid in ids:
            id_to_canonical[iid] = canonical_id

    # Handle Coin specifically
    id_to_canonical[500] = 500
    canonical_name_map['coin'] = 500

    # Build unique final items dictionary
    final_items = {}
    for iid, name in id_to_name.items():
        canon_id = id_to_canonical[iid]
        if canon_id not in final_items:
            final_items[canon_id] = {
                'item_id': canon_id,
                'name': name,
                'original_name': id_to_original_name.get(canon_id) or name
            }

    # Ensure Coin is present
    if 500 not in final_items:
        final_items[500] = {
            'item_id': 500,
            'name': 'Coin',
            'original_name': 'Coin'
        }

    # Build unique prices dictionary
    final_prices = {}
    for iid, p_row in price_raw_data.items():
        canon_id = id_to_canonical.get(iid, iid)
        if canon_id not in final_prices:
            final_prices[canon_id] = p_row.copy()
        else:
            # Merge price values
            for k, v in p_row.items():
                if final_prices[canon_id][k] is None:
                    final_prices[canon_id][k] = v

    # Hardcode/intercept Coin (ID 500) value and prevent overrides
    final_prices[500] = {
        'avg_24h': 0.0001,
        'vol_24h': None,
        'avg_7d': 0.0001,
        'vol_7d': None,
        'avg_30d': 0.0001,
        'vol_30d': None
    }

    # Step 3: Parse recipes.csv
    print("Parsing recipes.csv...")
    recipes_list = []
    recipe_materials_list = []
    
    with open(RECIPES_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            craft_id_str = row.get('craft_id')
            if not craft_id_str:
                continue
            craft_id = parse_int(craft_id_str)
            if craft_id is None:
                continue
                
            out_name = clean_name(row.get('output_name') or "")
            if not out_name:
                continue
                
            out_amount = parse_int(row.get('output_amount') or "1") or 1
            req_labor = parse_int(row.get('req_labor') or "0") or 0
            
            out_name_lower = out_name.lower()
            output_item_id = canonical_name_map.get(out_name_lower)
            
            if output_item_id is None:
                new_id = max(max(final_items.keys()), 10000000) + 1
                final_items[new_id] = {
                    'item_id': new_id,
                    'name': out_name,
                    'original_name': row.get('output_name')
                }
                canonical_name_map[out_name_lower] = new_id
                output_item_id = new_id
                
            recipes_list.append((craft_id, output_item_id, out_amount, req_labor))
            
            materials_str = row.get('materials') or "[]"
            recipe_mats = {} # material_item_id -> amount
            try:
                materials = json.loads(materials_str)
                for mat in materials:
                    mat_name = clean_name(mat.get('name') or "")
                    mat_amount = parse_int(str(mat.get('amount') or "0")) or 0
                    if not mat_name:
                        continue
                        
                    mat_name_lower = mat_name.lower()
                    material_item_id = canonical_name_map.get(mat_name_lower)
                    
                    if material_item_id is None:
                        new_id = max(max(final_items.keys()), 10000000) + 1
                        final_items[new_id] = {
                            'item_id': new_id,
                            'name': mat_name,
                            'original_name': mat.get('name')
                        }
                        canonical_name_map[mat_name_lower] = new_id
                        material_item_id = new_id
                        
                    recipe_mats[material_item_id] = recipe_mats.get(material_item_id, 0) + mat_amount
                
                for mat_id, amt in recipe_mats.items():
                    recipe_materials_list.append((craft_id, mat_id, amt))
            except Exception as e:
                print(f"Error parsing materials for craft_id {craft_id}: {e}")

    # Step 4: Save to SQLite
    print(f"Setting up SQLite database at {DB_PATH}...")
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")
    
    cursor.execute("""
    CREATE TABLE items (
        item_id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        original_name TEXT
    );
    """)
    
    cursor.execute("""
    CREATE TABLE prices (
        item_id INTEGER PRIMARY KEY,
        avg_24h REAL,
        vol_24h INTEGER,
        avg_7d REAL,
        vol_7d INTEGER,
        avg_30d REAL,
        vol_30d INTEGER,
        FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE
    );
    """)
    
    cursor.execute("""
    CREATE TABLE recipes (
        recipe_id INTEGER PRIMARY KEY,
        output_item_id INTEGER NOT NULL,
        output_amount INTEGER NOT NULL,
        req_labor INTEGER NOT NULL,
        profession TEXT,
        FOREIGN KEY (output_item_id) REFERENCES items(item_id) ON DELETE CASCADE
    );
    """)
    
    cursor.execute("""
    CREATE TABLE recipe_materials (
        recipe_id INTEGER NOT NULL,
        material_item_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        PRIMARY KEY (recipe_id, material_item_id),
        FOREIGN KEY (recipe_id) REFERENCES recipes(recipe_id) ON DELETE CASCADE,
        FOREIGN KEY (material_item_id) REFERENCES items(item_id) ON DELETE CASCADE
    );
    """)
    
    # Insert Data
    print(f"Inserting {len(final_items)} items...")
    cursor.executemany(
        "INSERT INTO items (item_id, name, original_name) VALUES (?, ?, ?);",
        [(item['item_id'], item['name'], item['original_name']) for item in final_items.values()]
    )
    
    print(f"Inserting {len(final_prices)} price records...")
    cursor.executemany(
        """INSERT INTO prices (item_id, avg_24h, vol_24h, avg_7d, vol_7d, avg_30d, vol_30d) 
           VALUES (?, ?, ?, ?, ?, ?, ?);""",
        [(iid, p['avg_24h'], p['vol_24h'], p['avg_7d'], p['vol_7d'], p['avg_30d'], p['vol_30d']) 
         for iid, p in final_prices.items() if iid in final_items]
    )
    
    print(f"Inserting {len(recipes_list)} recipes...")
    cursor.executemany(
        "INSERT INTO recipes (recipe_id, output_item_id, output_amount, req_labor, profession) VALUES (?, ?, ?, ?, NULL);",
        recipes_list
    )
    
    print(f"Inserting {len(recipe_materials_list)} recipe materials...")
    cursor.executemany(
        "INSERT INTO recipe_materials (recipe_id, material_item_id, amount) VALUES (?, ?, ?);",
        recipe_materials_list
    )
    
    conn.commit()
    conn.close()
    print("Database built successfully!")

    # Step 5: Copy database to the public directory
    try:
        shutil.copy(DB_PATH, PUBLIC_DB_PATH)
        print(f"Copied database to public directory at {PUBLIC_DB_PATH}")
    except Exception as e:
        print(f"Error copying database: {e}")

if __name__ == '__main__':
    import_data()
