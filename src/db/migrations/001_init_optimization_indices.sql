-- SQLite WASM migration script
-- Path: src/db/migrations/001_init_optimization_indices.sql
-- Idempotent performance layers for the <Tell No Tales> crafting calculator

-- 1. Index for fast name/text search queries (case-sensitive index matches exact schema UNIQUE name)
CREATE INDEX IF NOT EXISTS idx_items_lookup ON items(name);

-- 2. Index for recipes matching output items and labor details
CREATE INDEX IF NOT EXISTS idx_recipes_lookup ON recipes(output_item_id, req_labor);

-- 3. Index for material ingredients resolving inside recipes
CREATE INDEX IF NOT EXISTS idx_recipe_materials_lookup ON recipe_materials(recipe_id, material_item_id);
CREATE INDEX IF NOT EXISTS idx_recipe_materials_mat_lookup ON recipe_materials(material_item_id);

-- 4. Index for sorting/filtering items by historical price averages
CREATE INDEX IF NOT EXISTS idx_prices_lookup ON prices(avg_7d, avg_30d);
