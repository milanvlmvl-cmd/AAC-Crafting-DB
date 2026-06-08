import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSQLite } from '../context/SQLiteContext';
import { useRecipePipeline, RecipeData, RecipeMetrics, IngredientMaterial } from '../hooks/useRecipePipeline';
import { ArcheAgeProficiencyLevel, VALID_PROFESSIONS, ArcheAgeProfession } from '../utils/laborEngine';
import { formatCopperToGoldString, parseGoldToCopper } from '../utils/currency';
import { RecipeVirtualList } from './RecipeVirtualList';

// The 22 core professions
const PROFESSIONS: ArcheAgeProfession[] = Array.from(VALID_PROFESSIONS);

const PROFICIENCY_LEVELS: ArcheAgeProficiencyLevel[] = [
  'Amateur',
  'Novice',
  'Veteran',
  'Expert',
  'Master',
  'Authority',
  'Champion',
  'Adept',
  'Herald',
  'Virtuoso',
  'Celebrity',
  'Famed',
];

// Helper function to classify recipes dynamically into one of the 22 professions
function determineProfession(outputName: string): ArcheAgeProfession {
  const name = outputName.toLowerCase();
  
  if (name.includes('cooking oil')) return 'Cooking';
  if (name.includes('alchemy catalyst')) return 'Alchemy';
  if (name.includes('farming') || name.includes('seed') || name.includes('grain') || name.includes('vegetable') || name.includes('rice') || name.includes('wheat') || name.includes('barley') || name.includes('oats') || name.includes('cucumber') || name.includes('carrot') || name.includes('onion') || name.includes('potato') || name.includes('strawberry')) return 'Farming';
  if (name.includes('husbandry') || name.includes('meat') || name.includes('feed') || name.includes('wool') || name.includes('pelts') || name.includes('egg') || name.includes('milk') || name.includes('yata') || name.includes('sheep') || name.includes('chicken') || name.includes('cow') || name.includes('goose')) return 'Husbandry';
  if (name.includes('logging') || name.includes('log') || name.includes('sapling')) return 'Logging';
  if (name.includes('gathering') || name.includes('flower') || name.includes('herb') || name.includes('lotus') || name.includes('clover') || name.includes('mushroom') || name.includes('lily') || name.includes('rose') || name.includes('lavender') || name.includes('jujube')) return 'Gathering';
  if (name.includes('mining') || name.includes('ore') || name.includes('copper ore') || name.includes('iron ore') || name.includes('silver ore') || name.includes('gold ore')) return 'Mining';
  if (name.includes('fishing') || name.includes('fish') || name.includes('lure') || name.includes('chum')) return 'Fishing';
  if (name.includes('wine') || name.includes('liquor') || name.includes('beer') || name.includes('bread') || name.includes('soup') || name.includes('feast') || name.includes('food') || name.includes('tea') || name.includes('bake') || name.includes('drink') || name.includes('juice') || name.includes('pie') || name.includes('salad') || name.includes('stew') || name.includes('bun')) return 'Cooking';
  if (name.includes('alchemy') || name.includes('potion') || name.includes('elixir') || name.includes('pigment') || name.includes('polish') || name.includes('dye') || name.includes('dust') || name.includes('essence') || name.includes('oil') || name.includes('salve') || name.includes('phial') || name.includes('catalyst') || name.includes('archeum')) return 'Alchemy';
  if (name.includes('fabric') || name.includes('cloth') || name.includes('sleeve') || name.includes('robe') || name.includes('cowl') || name.includes('hood') || name.includes('sash') || name.includes('pant') || name.includes('sack')) return 'Tailoring';
  if (name.includes('leather') || name.includes('jerkin') || name.includes('boots') || name.includes('glove') || name.includes('belt') || name.includes('cap') || name.includes('guards') || name.includes('bracers') || name.includes('breeches')) return 'Leatherwork';
  if (name.includes('ingot') || name.includes('plate') || name.includes('cuirass') || name.includes('greaves') || name.includes('gauntlets') || name.includes('sabot') || name.includes('helm') || name.includes('chainmail') || name.includes('vambrace') || name.includes('pauldrons') || name.includes('tassets')) return 'Metalwork';
  if (name.includes('weapon') || name.includes('sword') || name.includes('blade') || name.includes('dagger') || name.includes('axe') || name.includes('shield') || name.includes('spear') || name.includes('greatsword') || name.includes('katana') || name.includes('nodachi') || name.includes('greatclub') || name.includes('hammer')) return 'Weaponry';
  if (name.includes('lumber') || name.includes('wood') || name.includes('bow') || name.includes('staff') || name.includes('stave') || name.includes('scepter') || name.includes('club') || name.includes('furniture') || name.includes('chest') || name.includes('casket') || name.includes('chair') || name.includes('table')) return 'Carpentry';
  if (name.includes('stone') || name.includes('brick') || name.includes('masonry') || name.includes('tablet') || name.includes('portal') || name.includes('hereafter')) return 'Masonry';
  if (name.includes('paper') || name.includes('book') || name.includes('ink') || name.includes('scroll') || name.includes('document') || name.includes('grimoire') || name.includes('journal')) return 'Printing';
  if (name.includes('parts') || name.includes('glider') || name.includes('key') || name.includes('drive') || name.includes('device') || name.includes('cog') || name.includes('gear') || name.includes('wheel') || name.includes('frame')) return 'Machining';
  if (name.includes('ring') || name.includes('necklace') || name.includes('earring') || name.includes('jewel') || name.includes('gem') || name.includes('accessory') || name.includes('lens')) return 'Handicrafts';
  if (name.includes('music') || name.includes('sheet') || name.includes('instrument') || name.includes('flute') || name.includes('lute')) return 'Artistry';
  if (name.includes('cargo') || name.includes('pack') || name.includes('trade')) return 'Commerce';
  if (name.includes('treasure') || name.includes('map') || name.includes('exploration')) return 'Exploration';
  if (name.includes('pouch') || name.includes('coop') || name.includes('stolen')) return 'Larceny';
  if (name.includes('tax') || name.includes('cert')) return 'Construction';

  // Fallbacks by checking keywords
  return 'Alchemy'; // Default fallback profession
}

export const Dashboard: React.FC = () => {
  const { db, loading: dbLoading, error: dbError } = useSQLite();

  // Recipe pipeline datasets
  const [recipes, setRecipes] = useState<RecipeData[]>([]);
  const [extraVolInfo, setExtraVolInfo] = useState<Record<number, { vol_7d: number; vol_30d: number }>>({});
  
  // States controlled by user inputs
  const [proficiency, setProficiency] = useState<string>('Amateur');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProfession, setSelectedProfession] = useState<string>('All');
  const [hideUnpriced, setHideUnpriced] = useState<boolean>(true);
  
  // Filters sliders state
  const [minVolume, setMinVolume] = useState<number>(1000);
  const [maxVolume, setMaxVolume] = useState<number>(100000);
  const [minSLRatio, setMinSLRatio] = useState<number>(-100);
  const [maxSLRatio, setMaxSLRatio] = useState<number>(500);

  // Sorting
  const [sortField, setSortField] = useState<'ratio' | 'profit' | 'name'>('ratio');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Dynamic Item Price Overrides
  const [overrides, setOverrides] = useState<Record<number, number>>({});

  // Performance monitoring statistics
  const [processLatency, setProcessLatency] = useState<number>(0);
  const [latencyWarning, setLatencyWarning] = useState<boolean>(false);

  // Database reactivity version
  const [dbVersion, setDbVersion] = useState(0);



  // Load recipes and materials from DB once initialized
  useEffect(() => {
    if (!db) return;

    try {
      // 1. Fetch main recipes joined with output names and average pricing
      const recipeRows = db.exec({
        sql: `
          SELECT
            r.recipe_id,
            r.output_item_id,
            i.name AS output_name,
            r.output_amount,
            r.req_labor,
            p.avg_7d AS output_avg_7d,
            p.avg_30d AS output_avg_30d,
            p.vol_7d AS output_vol_7d,
            p.vol_30d AS output_vol_30d,
            r.profession AS recipe_profession
          FROM recipes r
          JOIN items i ON r.output_item_id = i.item_id
          LEFT JOIN prices p ON r.output_item_id = p.item_id
        `,
        rowMode: 'array',
      });

      // 2. Fetch all materials joined with item names and average pricing
      const materialRows = db.exec({
        sql: `
          SELECT
            rm.recipe_id,
            rm.material_item_id,
            i.name AS material_name,
            rm.amount AS quantity,
            p.avg_7d AS avg_7d,
            p.avg_30d AS avg_30d
          FROM recipe_materials rm
          JOIN items i ON rm.material_item_id = i.item_id
          LEFT JOIN prices p ON rm.material_item_id = p.item_id
        `,
        rowMode: 'array',
      });

      // Assemble materials by recipe_id
      const materialsByRecipe: Record<number, IngredientMaterial[]> = {};
      for (const row of materialRows) {
        const [recipeId, matId, matName, qty, avg7d, avg30d] = row;
        if (!materialsByRecipe[recipeId]) {
          materialsByRecipe[recipeId] = [];
        }
        materialsByRecipe[recipeId].push({
          material_item_id: matId,
          name: matName,
          quantity: qty,
          avg_7d: avg7d,
          avg_30d: avg30d,
        });
      }

      // Assemble final recipes and store volumes
      const volMap: Record<number, { vol_7d: number; vol_30d: number }> = {};
      const fetchedRecipes: RecipeData[] = [];

      for (const row of recipeRows) {
        const [recipeId, outputItemId, outputName, outputAmount, reqLabor, outputAvg7d, outputAvg30d, vol7d, vol30d, recipeProfession] = row;
        
        volMap[recipeId] = {
          vol_7d: vol7d || 0,
          vol_30d: vol30d || 0,
        };

        const professionName = recipeProfession !== null ? recipeProfession : determineProfession(outputName);

        fetchedRecipes.push({
          recipe_id: recipeId,
          output_item_id: outputItemId,
          output_name: outputName,
          output_amount: outputAmount,
          req_labor: reqLabor,
          profession: professionName,
          output_avg_7d: outputAvg7d,
          output_avg_30d: outputAvg30d,
          ingredients: materialsByRecipe[recipeId] || [],
        });
      }

      setRecipes(fetchedRecipes);
      setExtraVolInfo(volMap);
    } catch (err) {
      console.error('Error fetching recipe database fields:', err);
    }
  }, [db, dbVersion]);

  // Execute reactive pipeline calculations via hook
  const computedMetrics = useRecipePipeline(recipes, overrides, proficiency);

  // Performance profiled filter, sorting & processing execution
  const processedRecipes = useMemo(() => {
    const tStart = performance.now();

    let list = recipes.map((recipe) => {
      const metrics = computedMetrics[recipe.recipe_id];
      const vols = extraVolInfo[recipe.recipe_id] || { vol_7d: 0, vol_30d: 0 };
      return {
        recipe,
        metrics,
        vol_7d: vols.vol_7d,
        vol_30d: vols.vol_30d,
      };
    });

    // 1. Text Search Filter (matches item name or ingredient names)
    if (searchQuery.trim()) {
      const normalizedSearch = searchQuery.toLowerCase();
      list = list.filter((item) => {
        const matchesOutput = item.recipe.output_name.toLowerCase().includes(normalizedSearch);
        const matchesIngredients = item.recipe.ingredients.some((ing) =>
          ing.name.toLowerCase().includes(normalizedSearch)
        );
        return matchesOutput || matchesIngredients;
      });
    }

    // 2. Profession Category Selector Filter
    if (selectedProfession !== 'All') {
      list = list.filter((item) => item.recipe.profession === selectedProfession);
    }

    // 3. Hide Unpriced Crafts Switch Filter
    if (hideUnpriced) {
      list = list.filter((item) => {
        return item.metrics && !item.metrics.isUnpriced;
      });
    }

    // 4. Volume Threshold Filter (30d average volume limits)
    list = list.filter((item) => {
      return item.vol_30d >= minVolume && item.vol_30d <= maxVolume;
    });

    // 5. Silver-per-Labor (S/L) Ratio Filter Boundaries
    list = list.filter((item) => {
      if (item.metrics && item.metrics.isUnpriced) return true;
      const ratio = item.metrics && item.metrics.ratio_silver_per_labor !== null ? item.metrics.ratio_silver_per_labor : 0;
      return ratio >= minSLRatio && ratio <= maxSLRatio;
    });

    // 6. Sort Execution (3-Tier Hierarchical Sorting)
    list.sort((a, b) => {
      const getTier = (item: typeof a) => {
        if (!item.metrics) return 3;
        if (item.metrics.isUnpriced) return 3;
        const ratio = item.metrics.ratio_silver_per_labor ?? 0;
        return ratio >= 0 ? 1 : 2;
      };

      const tierA = getTier(a);
      const tierB = getTier(b);

      if (tierA !== tierB) {
        return tierA - tierB; // Tier 1 (top) -> Tier 2 (middle) -> Tier 3 (bottom)
      }

      // If both are Tier 3 (unpriced), sort alphabetically by output name
      if (tierA === 3) {
        return a.recipe.output_name.localeCompare(b.recipe.output_name);
      }

      // If both are in the same tier (1 or 2), sort by user-selected sortField
      let comparison = 0;
      if (sortField === 'ratio') {
        const valA = a.metrics ? (a.metrics.ratio_silver_per_labor ?? 0) : 0;
        const valB = b.metrics ? (b.metrics.ratio_silver_per_labor ?? 0) : 0;
        comparison = valA - valB;
      } else if (sortField === 'profit') {
        const valA = a.metrics ? (a.metrics.profit_silver ?? 0) : 0;
        const valB = b.metrics ? (b.metrics.profit_silver ?? 0) : 0;
        comparison = valA - valB;
      } else {
        comparison = a.recipe.output_name.localeCompare(b.recipe.output_name);
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    const tEnd = performance.now();
    const duration = tEnd - tStart;

    // Direct performance metrics update (safely decoupled from rendering loops)
    setTimeout(() => {
      setProcessLatency(duration);
      setLatencyWarning(duration > 16);
    }, 0);

    return list;
  }, [
    recipes,
    computedMetrics,
    extraVolInfo,
    searchQuery,
    selectedProfession,
    hideUnpriced,
    minVolume,
    maxVolume,
    minSLRatio,
    maxSLRatio,
    sortField,
    sortOrder,
  ]);

  // Handle inline override change for an item
  const handlePriceOverride = (itemId: number, rawVal: string) => {
    // Prevent overriding Coin (ID 500)
    if (itemId === 500) return;

    if (rawVal.trim() === '') {
      // Remove override if empty input
      setOverrides((prev) => {
        const updated = { ...prev };
        delete updated[itemId];
        return updated;
      });
      return;
    }

    const val = parseFloat(rawVal);
    if (!isNaN(val) && val >= 0) {
      setOverrides((prev) => ({
        ...prev,
        [itemId]: val,
      }));
    }
  };

  // Virtual Row rendering function
  if (dbLoading) {
    return (
      <div className="flex items-center justify-center bg-[#121212] min-h-screen text-slate-200">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-t-2 border-amber-500 border-solid rounded-full animate-spin mx-auto" />
          <p className="font-mono text-sm uppercase tracking-wider text-amber-500">Initializing Core Engine...</p>
        </div>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="flex items-center justify-center bg-[#121212] min-h-screen text-red-500 p-6 font-mono text-center">
        <div className="max-w-md bg-red-950/30 border border-red-800 p-6 rounded-xl">
          <h2 className="text-xl font-bold mb-4">Core Loading Failure</h2>
          <p className="text-sm text-red-200">{dbError}</p>
        </div>
      </div>
    );
  }



  return (
    <div className="bg-[#121212] text-slate-200 h-screen w-screen overflow-hidden flex flex-col font-sans select-none antialiased">
      {/* Top Header / Profile Panel */}
      <header className="bg-[#1a1a1a] border-b border-[#2a2a2a] px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-yellow-200">
            TELL NO TALES
          </h1>
          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-0.5">
            ArcheAge Classic Crafting Console
          </p>
        </div>

        {/* Global Control Inputs */}
        <div className="flex items-center space-x-6">


          {/* Performance Profiler Badge */}
          <div className="text-right">
            <span className="block text-[9px] text-slate-500 uppercase font-mono">Calculation Latency</span>
            <span
              className={`inline-block font-mono text-xs font-bold px-2 py-0.5 rounded ${
                latencyWarning ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'bg-[#1e291b] text-emerald-400 border border-[#2e4c29]'
              }`}
            >
              {processLatency.toFixed(2)} ms {latencyWarning ? '(LAG WARNING)' : '(60 FPS OK)'}
            </span>
          </div>

          {/* Proficiency Level Selector */}
          <div>
            <label className="block text-[9px] text-slate-500 uppercase font-mono mb-1">Character Proficiency</label>
            <select
              value={proficiency}
              onChange={(e) => setProficiency(e.target.value)}
              className="bg-[#252525] border border-[#3a3a3a] text-slate-200 text-xs px-3 py-1.5 rounded focus:outline-none focus:border-amber-500 font-medium cursor-pointer"
            >
              {PROFICIENCY_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Advanced Filter Panel */}
      <section className="bg-[#161616] border-b border-[#242424] px-6 py-4 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Full-text Search & Profession */}
        <div className="space-y-3">
          <div>
            <label className="block text-[9px] text-slate-500 uppercase font-mono mb-1.5">Search Recipes</label>
            <input
              type="text"
              placeholder="Filter by name/materials..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#222] border border-[#333] text-slate-200 text-xs px-3 py-2 rounded focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-[9px] text-slate-500 uppercase font-mono mb-1.5">Profession Filter</label>
            <select
              value={selectedProfession}
              onChange={(e) => setSelectedProfession(e.target.value)}
              className="w-full bg-[#222] border border-[#333] text-slate-200 text-xs px-3 py-2 rounded focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="All">All Categories</option>
              {PROFESSIONS.map((prof) => (
                <option key={prof} value={prof}>
                  {prof}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Volume Threshold Range Slider */}
        <div className="space-y-2">
          <label className="block text-[9px] text-slate-500 uppercase font-mono">
            30d Volume Limits: <span className="text-amber-500 font-bold">{minVolume} - {maxVolume}</span>
          </label>
          <div className="flex items-center space-x-2 pt-2">
            <span className="text-[10px] text-slate-600">Min:</span>
            <input
              type="range"
              min="0"
              max="50000"
              step="100"
              value={minVolume}
              onChange={(e) => setMinVolume(parseInt(e.target.value, 10))}
              className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded"
            />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-slate-600">Max:</span>
            <input
              type="range"
              min="1000"
              max="100000"
              step="500"
              value={maxVolume}
              onChange={(e) => setMaxVolume(parseInt(e.target.value, 10))}
              className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded"
            />
          </div>
        </div>

        {/* S/L Ratio Range Slider */}
        <div className="space-y-2">
          <label className="block text-[9px] text-slate-500 uppercase font-mono">
            S/L Ratio Range: <span className="text-amber-500 font-bold">{minSLRatio} to {maxSLRatio} S/L</span>
          </label>
          <div className="flex items-center space-x-2 pt-2">
            <span className="text-[10px] text-slate-600">Min:</span>
            <input
              type="range"
              min="-200"
              max="100"
              step="5"
              value={minSLRatio}
              onChange={(e) => setMinSLRatio(parseInt(e.target.value, 10))}
              className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded"
            />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-slate-600">Max:</span>
            <input
              type="range"
              min="0"
              max="1000"
              step="10"
              value={maxSLRatio}
              onChange={(e) => setMaxSLRatio(parseInt(e.target.value, 10))}
              className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded"
            />
          </div>
        </div>

        {/* Custom Toggle and Sort Direction */}
        <div className="flex flex-col justify-between space-y-3">
          {/* Hide Unpriced Switch */}
          <div className="flex items-center justify-between bg-[#1f1f1f] p-2.5 rounded border border-[#2d2d2d]">
            <span className="text-xs text-slate-300 font-medium">Hide Unpriced Crafts</span>
            <button
              onClick={() => setHideUnpriced(!hideUnpriced)}
              className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                hideUnpriced ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-slate-950 transition-transform duration-200 transform ${
                  hideUnpriced ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Sort Hierarchy */}
          <div className="flex items-center space-x-2">
            <div className="flex-1">
              <label className="block text-[9px] text-slate-500 uppercase font-mono mb-1">Sort Field</label>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as any)}
                className="w-full bg-[#222] border border-[#333] text-slate-200 text-xs px-2 py-1.5 rounded focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="ratio">S/L Ratio</option>
                <option value="profit">Net Profit</option>
                <option value="name">Recipe Title</option>
              </select>
            </div>
            <div>
              <label className="block text-[9px] text-slate-500 uppercase font-mono mb-1">Order</label>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="bg-[#222] border border-[#333] hover:border-amber-500 text-slate-200 text-xs px-3 py-1.5 rounded transition-colors duration-150 font-medium"
              >
                {sortOrder === 'asc' ? '▲ ASC' : '▼ DESC'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Grid Content Area */}
      <main className="flex-1 overflow-hidden relative">
        {processedRecipes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-mono text-sm uppercase tracking-wide">
            No recipes matching current filters.
          </div>
        ) : (
          <RecipeVirtualList
            processedRecipes={processedRecipes}
            overrides={overrides}
            proficiency={proficiency}
            handlePriceOverride={handlePriceOverride}
          />
        )}
      </main>

      {/* Mandatory Development Footer */}
      <footer className="bg-[#1a1a1a] border-t border-[#2a2a2a] py-4 text-center">
        <p className="text-xs text-slate-500 font-mono tracking-wide">
          Crafting Calculator developed by Wasbeerotb
        </p>
      </footer>
    </div>
  );
};
