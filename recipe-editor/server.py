import http.server
import socketserver
import json
import sqlite3
import shutil
import os
import urllib.parse

PORT = 8080
WORKSPACE_DB = "/home/mvl/Documents/Github/AAC-Crafting-DB/public/crafting.db"
APP_DB = "/home/mvl/Documents/AAC crafting app/crafting.db"
APP_PUBLIC_DB = "/home/mvl/Documents/AAC crafting app/public/crafting.db"

LOCAL_DIR = os.path.dirname(os.path.abspath(__file__))
EDIT_DB = os.path.join(LOCAL_DIR, "editing_crafting.db")

def init_db():
    # Load database from workspace first, otherwise try documents
    src = None
    if os.path.exists(WORKSPACE_DB):
        src = WORKSPACE_DB
    elif os.path.exists(APP_DB):
        src = APP_DB
    
    if src:
        shutil.copy(src, EDIT_DB)
        print(f"Copied database from {src} to working database {EDIT_DB}")
    else:
        print("WARNING: Source database file not found!")

def get_db_connection():
    return sqlite3.connect(EDIT_DB)

def calculate_sl_ratio(req_labor, output_amount, output_price_gold, materials):
    # Convert prices to copper (1 gold = 10000 copper)
    # Materials is list of (quantity, price_gold)
    p_out = int(round(output_price_gold * 10000)) if output_price_gold is not None else 0
    cost_mats = 0
    for qty, p_gold in materials:
        p_mat = int(round(p_gold * 10000)) if p_gold is not None else 0
        cost_mats += qty * p_mat
        
    profit_silver = ((output_amount * p_out) - cost_mats) / 100.0
    
    if req_labor <= 0:
        return profit_silver, 0.0
    return profit_silver, profit_silver / req_labor

class RecipeHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        if path == "/api/status":
            self.handle_status()
        elif path == "/api/recipes/list":
            self.handle_recipes_list(query)
        elif path.startswith("/api/recipes/"):
            recipe_id_str = path.split("/")[-1]
            try:
                recipe_id = int(recipe_id_str)
                self.handle_recipe_detail(recipe_id)
            except ValueError:
                self.send_error(400, "Invalid recipe ID")
        else:
            # Serve static files from current directory
            # Map root to index.html
            if path == "/":
                self.path = "/index.html"
            super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path.startswith("/api/recipes/") and path.endswith("/update"):
            parts = path.split("/")
            recipe_id_str = parts[3]
            try:
                recipe_id = int(recipe_id_str)
                self.handle_recipe_update(recipe_id)
            except ValueError:
                self.send_error(400, "Invalid recipe ID")
        elif path.startswith("/api/recipes/") and path.endswith("/delete"):
            parts = path.split("/")
            recipe_id_str = parts[3]
            try:
                recipe_id = int(recipe_id_str)
                self.handle_recipe_delete(recipe_id)
            except ValueError:
                self.send_error(400, "Invalid recipe ID")
        elif path == "/api/save":
            self.handle_save_db()
        else:
            self.send_error(404, "Not found")

    def handle_status(self):
        if not os.path.exists(EDIT_DB):
            self.send_json({"status": "error", "message": "Database not initialized"}, 500)
            return

        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM recipes;")
            recipes_count = cursor.fetchone()[0]
            cursor.execute("SELECT COUNT(*) FROM items;")
            items_count = cursor.fetchone()[0]
            conn.close()

            self.send_json({
                "status": "ok",
                "recipes_count": recipes_count,
                "items_count": items_count,
                "edit_db_path": EDIT_DB
            })
        except Exception as e:
            self.send_json({"status": "error", "message": str(e)}, 500)

    def handle_recipes_list(self, query):
        search_filter = query.get('search', [''])[0].strip().lower()
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 1. Fetch all items and pricing
        cursor.execute("""
            SELECT i.item_id, i.name, p.avg_7d, p.avg_30d
            FROM items i
            LEFT JOIN prices p ON i.item_id = p.item_id
        """)
        item_prices = {}
        for item_id, name, avg_7d, avg_30d in cursor.fetchall():
            price = None
            if item_id == 500:
                price = 0.0001
            elif avg_7d is not None:
                price = avg_7d
            elif avg_30d is not None:
                price = avg_30d
            else:
                price = 0.0
            item_prices[item_id] = price

        # 2. Fetch all materials
        cursor.execute("SELECT recipe_id, material_item_id, amount FROM recipe_materials;")
        recipe_mats = {}
        for r_id, mat_id, amt in cursor.fetchall():
            recipe_mats.setdefault(r_id, []).append((amt, item_prices.get(mat_id, 0.0)))

        # 3. Fetch all recipes
        cursor.execute("""
            SELECT r.recipe_id, r.output_item_id, i.name, r.output_amount, r.req_labor, r.profession
            FROM recipes r
            JOIN items i ON r.output_item_id = i.item_id
        """)
        recipes_data = cursor.fetchall()
        
        # If search filter is active, get recipes matching output name or material name
        matched_recipe_ids = None
        if search_filter:
            cursor.execute("""
                SELECT DISTINCT r.recipe_id
                FROM recipes r
                JOIN items i ON r.output_item_id = i.item_id
                LEFT JOIN recipe_materials rm ON r.recipe_id = rm.recipe_id
                LEFT JOIN items im ON rm.material_item_id = im.item_id
                WHERE LOWER(i.name) LIKE ? OR LOWER(im.name) LIKE ?
            """, (f"%{search_filter}%", f"%{search_filter}%"))
            matched_recipe_ids = {row[0] for row in cursor.fetchall()}

        conn.close()

        results = []
        for r_id, out_item_id, out_name, out_qty, req_labor, profession in recipes_data:
            if matched_recipe_ids is not None and r_id not in matched_recipe_ids:
                continue
                
            mats = recipe_mats.get(r_id, [])
            out_price = item_prices.get(out_item_id, 0.0)
            profit, ratio = calculate_sl_ratio(req_labor, out_qty, out_price, mats)
            
            results.append({
                "recipe_id": r_id,
                "output_name": out_name,
                "ratio": ratio,
                "profit": profit,
                "req_labor": req_labor,
                "profession": profession
            })

        # Sort: highest ratio (S/L) first, ending with lowest
        results.sort(key=lambda x: x["ratio"], reverse=True)

        self.send_json(results)

    def handle_recipe_detail(self, recipe_id):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Fetch recipe details
        cursor.execute("""
            SELECT r.recipe_id, r.output_item_id, i.name, r.output_amount, r.req_labor, r.profession,
                   p.avg_7d, p.avg_30d
            FROM recipes r
            JOIN items i ON r.output_item_id = i.item_id
            LEFT JOIN prices p ON r.output_item_id = p.item_id
            WHERE r.recipe_id = ?
        """, (recipe_id,))
        
        recipe_row = cursor.fetchone()
        if not recipe_row:
            conn.close()
            self.send_error(404, "Recipe not found")
            return
            
        r_id, out_item_id, out_name, out_qty, req_labor, profession, out_avg_7d, out_avg_30d = recipe_row
        
        # Fetch ingredients
        cursor.execute("""
            SELECT rm.material_item_id, i.name, rm.amount, p.avg_7d, p.avg_30d
            FROM recipe_materials rm
            JOIN items i ON rm.material_item_id = i.item_id
            LEFT JOIN prices p ON rm.material_item_id = p.item_id
            WHERE rm.recipe_id = ?
        """, (recipe_id,))
        
        ingredients = []
        mats_for_calc = []
        for mat_id, mat_name, qty, m_avg7d, m_avg30d in cursor.fetchall():
            price = 0.0001 if mat_id == 500 else (m_avg7d if m_avg7d is not None else (m_avg30d if m_avg30d is not None else 0.0))
            ingredients.append({
                "material_item_id": mat_id,
                "name": mat_name,
                "quantity": qty,
                "price_gold": price,
                "avg_7d": m_avg7d,
                "avg_30d": m_avg30d
            })
            mats_for_calc.append((qty, price))
            
        conn.close()

        out_price = 0.0001 if out_item_id == 500 else (out_avg_7d if out_avg_7d is not None else (out_avg_30d if out_avg_30d is not None else 0.0))
        profit, ratio = calculate_sl_ratio(req_labor, out_qty, out_price, mats_for_calc)
        
        self.send_json({
            "recipe_id": r_id,
            "output_item_id": out_item_id,
            "output_name": out_name,
            "output_amount": out_qty,
            "req_labor": req_labor,
            "profession": profession,
            "output_price": out_price,
            "output_avg_7d": out_avg_7d,
            "output_avg_30d": out_avg_30d,
            "ingredients": ingredients,
            "profit": profit,
            "ratio": ratio
        })

    def handle_recipe_update(self, recipe_id):
        content_length = int(self.headers['Content-Length'])
        body = json.loads(self.rfile.read(content_length))
        
        req_labor = body.get("req_labor")
        profession = body.get("profession")
        output_price = body.get("output_price")
        ingredients = body.get("ingredients", [])
        
        # Normalize profession value
        if profession == "None" or profession == "" or profession is None:
            profession_val = None
        else:
            profession_val = str(profession).strip()

        conn = get_db_connection()
        cursor = conn.cursor()
        
        try:
            # Update labor cost and profession
            cursor.execute("UPDATE recipes SET req_labor = ?, profession = ? WHERE recipe_id = ?;", 
                           (req_labor, profession_val, recipe_id))
            
            # Fetch output_item_id
            cursor.execute("SELECT output_item_id FROM recipes WHERE recipe_id = ?;", (recipe_id,))
            output_item_id = cursor.fetchone()[0]
            
            # Update output item price (do not override ID 500)
            if output_item_id != 500 and output_price is not None:
                cursor.execute("""
                    INSERT INTO prices (item_id, avg_24h, vol_24h, avg_7d, vol_7d, avg_30d, vol_30d)
                    VALUES (?, 0.0, 0, ?, 0, ?, 0)
                    ON CONFLICT(item_id) DO UPDATE SET avg_7d = excluded.avg_7d, avg_30d = excluded.avg_30d;
                """, (output_item_id, output_price, output_price))
                
            # Update ingredients prices
            for ing in ingredients:
                mat_id = ing.get("material_item_id")
                price = ing.get("price_gold")
                if mat_id != 500 and price is not None:
                    cursor.execute("""
                        INSERT INTO prices (item_id, avg_24h, vol_24h, avg_7d, vol_7d, avg_30d, vol_30d)
                        VALUES (?, 0.0, 0, ?, 0, ?, 0)
                        ON CONFLICT(item_id) DO UPDATE SET avg_7d = excluded.avg_7d, avg_30d = excluded.avg_30d;
                    """, (mat_id, price, price))
            
            conn.commit()
            self.send_json({"status": "success", "message": "Recipe, profession, and item prices updated successfully"})
        except Exception as e:
            conn.rollback()
            self.send_json({"status": "error", "message": str(e)}, 500)
        finally:
            conn.close()


    def handle_recipe_delete(self, recipe_id):
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("DELETE FROM recipes WHERE recipe_id = ?;", (recipe_id,))
            conn.commit()
            self.send_json({"status": "success", "message": "Recipe deleted/hidden successfully"})
        except Exception as e:
            conn.rollback()
            self.send_json({"status": "error", "message": str(e)}, 500)
        finally:
            conn.close()

    def handle_save_db(self):
        # Commit back to localhost active paths
        targets = [WORKSPACE_DB, APP_DB, APP_PUBLIC_DB]
        copied = []
        errors = []
        for t in targets:
            try:
                # Ensure directory exists
                os.makedirs(os.path.dirname(t), exist_ok=True)
                shutil.copy(EDIT_DB, t)
                copied.append(t)
            except Exception as e:
                errors.append(f"{t}: {str(e)}")
                
        if len(copied) > 0:
            self.send_json({
                "status": "success",
                "message": f"Successfully updated active database(s).",
                "copied": copied,
                "errors": errors
            })
        else:
            self.send_json({
                "status": "error",
                "message": "Failed to update any database files.",
                "errors": errors
            }, 500)

    def send_json(self, data, status_code=200):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

if __name__ == '__main__':
    init_db()
    handler = RecipeHandler
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"Recipe Editor serving at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
