# ArcheAge Classic Crafting & Pricing Database Calculator

A high-performance, desktop-first crafting calculator for **ArcheAge Classic (AAC)**. This tool provides real-time computations of crafting costs, profits, and Silver-per-Labor (S/L) ratios by utilizing a client-side WebAssembly-compiled SQLite database (WASM-SQLite).

---

## User Guide (For General Users)

Welcome to the ArcheAge Classic Crafting Console! This calculator helps you determine the most profitable items to craft based on current market rates and your character's profession levels.

### Core Features

1. **Crafting Catalog & Filters**:
   - **Search Recipes**: Instantly search for recipes by typing either the name of the final crafted item or any of its ingredient materials.
   - **Profession Category**: Filter recipes by one of the 22 core ArcheAge professions (e.g., Alchemy, Tailoring, Metalwork).
   - **Proficiency Discounts**: Select your character's proficiency tier (from **Amateur** to **Famed**) to automatically apply labor cost discounts to calculations.
   - **30d Volume Limits**: Filter out low-velocity items using the sliding range inputs to only show items that actively sell.
   - **Silver-per-Labor (S/L) Boundaries**: Filter crafts by a minimum and maximum S/L ratio to find high-yield opportunities or filter out loss-making items.
   - **Hide Unpriced Crafts**: Toggle off items that do not have active pricing data.

2. **Dynamic Price Overrides**:
   - Every recipe shows its ingredients and their unit prices. 
   - If you bought an ingredient cheaper, or if the market price shifted, you can **click on any unit price input box** and type a custom price.
   - The calculator will instantly recompute the costs, net profits, and S/L ratios across all affected recipes.
   - *Note*: You cannot override or change the value of the **Coin** item.

3. **Sorting**:
   - Sort recipes dynamically by **S/L Ratio** (highest to lowest), **Net Profit** (in silver), or alphabetically by **Recipe Title**.
   - Toggle sorting directions between Ascending (▲) and Descending (▼).

4. **Currency Formats**:
   - Prices and profits are formatted in standard ArcheAge currency notation: **Gold (g)**, **Silver (s)**, and **Copper (c)**.
   - 1 Gold = 100 Silver = 10,000 Copper.
   - You can enter overrides as standard decimals (e.g. `1.25` for 1g 25s) or raw game strings (e.g. `1g 25s`).



---

## Technical Architecture (For Developers)

This project is built using a modern React SPA stack featuring high-performance local database queries.

```
                    +-----------------------------+
                    |    Vite + React Frontend    |
                    +--------------+--------------+
                                   |
                     (Queries via sqlite-wasm)
                                   v
                    +-----------------------------+
                    | SQLite WebAssembly Database |
                    |      (crafting.db)          |
                    +-----------------------------+
```

### Technical Stack
* **Frontend Core**: React 19 (TypeScript) & Vite
* **Database Layer**: WebAssembly SQLite (`@sqlite.org/sqlite-wasm`) loading a precompiled `crafting.db` dynamically in-browser.
* **Styling**: Tailwind CSS 4.0
* **List Virtualization**: `react-window` to render thousands of recipes smoothly at 60 FPS.
* **Tests**: `vitest` (TypeScript) and `pytest` (Python).

---

### Data Ingestion & Build Pipeline
The database `crafting.db` is built using `import_crafting_data.py`. The ingestion process works as follows:

1. **CSV Harvesting**: Reads raw data from `items.csv`, `price.csv`, and `recipes.csv`.
2. **Case-Insensitive Canonicalization**: Normalizes item names (stripping caret characters, pipe symbols, and case differences) to map matching items across datasets.
3. **Coin Interception**: Intercepts Item ID `500` (Coin) and hard-locks its unit values to exactly 1 Copper (0.0001 Gold).
4. **Foreign Key Integrity Check**: Creates SQL tables with strict `FOREIGN KEY` cascades.
5. **SQLite Ingestion**: Inserts normalized rows into `items`, `prices`, `recipes`, and `recipe_materials` tables.
6. **Distribution**: Copies the output `crafting.db` into the frontend public assets folder `/public/crafting.db`.

To run or rebuild the database, run:
```bash
python import_crafting_data.py
```
To verify database integrity and constraints:
```bash
python verify_db.py
```

---

### Core Business & Calculation Rules

#### 1. Coin (Item ID 500) Immutability
The in-game currency item "Coin" is protected at multiple layers:
* **Database Level**: SQL authorizer routines and application layers reject any queries attempting to issue `UPDATE`, `INSERT`, or `DELETE` targeting ID `500`.
* **API Level**: Validation scripts (`validation_rules.py` and `validationRules.js`) inspect incoming import JSON payloads and reject execution if an override for ID `500` is present.
* **Pricing Fallback**: Any lookup for ID `500` intercepts the call immediately and returns `0.0001` Gold (1 Copper) without querying the database.

#### 2. Price Resolution Hierarchy
When calculating crafting costs, material unit prices are resolved using the following order of priority:
1. **Local Override**: User-specified custom price in the React UI state.
2. **7-Day Market Average**: `avg_7d` value from the database price table.
3. **30-Day Market Average**: `avg_30d` value from the database price table.
4. **Fallback**: If all the above are missing, the price resolves to `0` and a warning flag is raised for the recipe.

#### 3. Mathematical Formulas

* **Adjusted Labor Cost**:
  $$\text{Labor}_{\text{adj}} = \max\left(1, \lfloor\text{Labor}_{\text{base}} \times (1 - \text{Discount})\rfloor\right)$$
  Where the discount is determined by the character's active profession level:
  
  | Proficiency Level | Labor Discount |
  | :--- | :--- |
  | Amateur / Novice | 0% |
  | Veteran | 5% |
  | Expert | 10% |
  | Master | 15% |
  | Authority / Champion / Adept / Herald | 20% |
  | Virtuoso | 25% |
  | Celebrity | 30% |
  | Famed | 40% |

* **Net Profit (in Silver)**:
  $$\text{Profit}_{\text{silver}} = \frac{(\text{Quantity}_{\text{out}} \times \text{Price}_{\text{final\_copper}}) - \text{Cost}_{\text{mats\_copper}}}{100}$$

* **Silver-per-Labor (S/L) Ratio**:
  $$\text{Ratio}_{\text{silver\_per\_labor}} = \frac{\text{Profit}_{\text{silver}}}{\text{Labor}_{\text{adj}}}$$
  *(If $\text{Labor}_{\text{adj}} = 0$, the ratio resolves to 0 to prevent division by zero errors).*

---

### UI Performance & React Rendering Pipeline
To guarantee sub-16ms render frames and prevent lag during continuous UI filtering:
* Calculations are executed inside a highly optimized React memoization hook (`useRecipePipeline`).
* Item names and recipes are indexed within SQLite to yield sub-millisecond querying.
* List rendering is virtualized using `react-window`, ensuring only visible recipes are rendered into the DOM.
* Performance indicators in the header measure calculation latency to ensure visual frames remain locked at a consistent 60 FPS.

---

### Recipe Database Editor (Developer GUI)
A dedicated, lightweight developer tool is included in the [recipe-editor](file:///home/mvl/Documents/Github/AAC-Crafting-DB/recipe-editor) directory. It enables rapid auditing and fixing of incorrect recipe data one by one.

#### Features:
- **Sorted Queue**: Shows recipes sorted by S/L ratio (highest to lowest), helping identify outliers or anomalies.
- **Single-Recipe Loading**: Renders exactly one recipe at a time for instant load speed.
- **Direct Database Fixes**: Edit labor costs, linked profession/proficiency categories, and hardcode item prices.
- **Fast Keyboard Navigation**:
  - `ArrowLeft`/`ArrowRight`: Load previous/next recipe.
  - `Enter`: Save current modifications.
  - `Escape`: Delete/hide recipe from the database immediately without verification prompts.

#### Running the Editor:
To run the editor, run:
```bash
python recipe-editor/server.py
```
Open [http://localhost:8080](http://localhost:8080) in your browser. Click the **"Apply & Sync to Localhost App"** button at the top-right of the GUI to publish all database edits directly to the active web calculator folders.

