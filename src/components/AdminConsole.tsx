import React, { useState, useEffect, useMemo } from 'react';
import { useSQLite } from '../context/SQLiteContext';
import { VALID_PROFESSIONS, ArcheAgeProfession } from '../utils/laborEngine';
import { formatCopperToGoldString } from '../utils/currency';

interface AdminConsoleProps {
  onBackToDashboard: () => void;
  onRefreshTrigger: () => void;
}

interface ItemSearchResult {
  item_id: number;
  name: string;
  avg_7d: number | null;
  vol_7d: number | null;
  avg_30d: number | null;
  vol_30d: number | null;
}

interface RecipeMapping {
  recipe_id: number;
  output_item_id: number;
  output_name: string;
  profession: string | null;
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({
  onBackToDashboard,
  onRefreshTrigger,
}) => {
  const { db } = useSQLite();

  // Search Engine
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ItemSearchResult[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemSearchResult | null>(null);

  // Price Form
  const [avg7d, setAvg7d] = useState<string>('');
  const [vol7d, setVol7d] = useState<string>('');
  const [avg30d, setAvg30d] = useState<string>('');
  const [vol30d, setVol30d] = useState<string>('');
  
  // Recipe Mapping Editor
  const [recipesList, setRecipesList] = useState<RecipeMapping[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | ''>('');
  const [selectedProfession, setSelectedProfession] = useState<string>('');

  // Profiler state
  const [latency, setLatency] = useState<number>(0);
  const [latencyWarning, setLatencyWarning] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isCoinSelected = selectedItem?.item_id === 500;

  // Track event-loop latency helper
  const measureExecutionTime = (action: () => void) => {
    const tStart = performance.now();
    action();
    const duration = performance.now() - tStart;
    setLatency(duration);
    setLatencyWarning(duration > 16);
  };

  // 1. Search Query execution
  useEffect(() => {
    if (!db) return;
    
    measureExecutionTime(() => {
      try {
        if (!searchQuery.trim()) {
          setSearchResults([]);
          return;
        }

        const numericId = parseInt(searchQuery, 10);
        const isNumeric = !isNaN(numericId);

        // Sub-millisecond retrieval leveraging indices:
        // Match exact ID first or check name index.
        const querySql = `
          SELECT i.item_id, i.name, p.avg_7d, p.vol_7d, p.avg_30d, p.vol_30d
          FROM items i
          LEFT JOIN prices p ON i.item_id = p.item_id
          WHERE ${isNumeric ? 'i.item_id = ?' : '1=0'} OR i.name LIKE ?
          LIMIT 20
        `;

        const queryParams = isNumeric 
          ? [numericId, `%${searchQuery}%`] 
          : [`%${searchQuery}%`];

        const rows = db.exec({
          sql: querySql,
          bind: queryParams,
          rowMode: 'array',
        });

        const results: ItemSearchResult[] = rows.map((row: any) => ({
          item_id: row[0],
          name: row[1],
          avg_7d: row[2],
          vol_7d: row[3],
          avg_30d: row[4],
          vol_30d: row[5],
        }));

        setSearchResults(results);
      } catch (err: any) {
        console.error('Search error:', err);
      }
    });
  }, [searchQuery, db]);

  // Load recipes for mapping dropdown
  const loadRecipes = () => {
    if (!db) return;
    try {
      const rows = db.exec({
        sql: `
          SELECT r.recipe_id, r.output_item_id, i.name, r.profession
          FROM recipes r
          JOIN items i ON r.output_item_id = i.item_id
          ORDER BY i.name ASC
        `,
        rowMode: 'array',
      });
      
      const mappedRecipes: RecipeMapping[] = rows.map((row: any) => ({
        recipe_id: row[0],
        output_item_id: row[1],
        output_name: row[2],
        profession: row[3],
      }));
      
      setRecipesList(mappedRecipes);
    } catch (err) {
      console.error('Failed to load recipes mapping:', err);
    }
  };

  useEffect(() => {
    loadRecipes();
  }, [db]);

  // Handle item selection from search
  const handleSelectItem = (item: ItemSearchResult) => {
    setSelectedItem(item);
    setErrorMsg(null);
    setSuccessMsg(null);
    
    if (item.item_id === 500) {
      // Hard-lock Coin parameters (1 Copper = 0.0001 Gold)
      setAvg7d('0.0001');
      setVol7d('0');
      setAvg30d('0.0001');
      setVol30d('0');
    } else {
      setAvg7d(item.avg_7d !== null ? String(item.avg_7d) : '');
      setVol7d(item.vol_7d !== null ? String(item.vol_7d) : '');
      setAvg30d(item.avg_30d !== null ? String(item.avg_30d) : '');
      setVol30d(item.vol_30d !== null ? String(item.vol_30d) : '');
    }
  };

  // Save changes to item price
  const handleSavePrice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !selectedItem) return;

    measureExecutionTime(() => {
      try {
        setErrorMsg(null);
        setSuccessMsg(null);

        // Security Invariance Lock Check
        if (selectedItem.item_id === 500) {
          throw new Error('Security Override Violation: Modification of Coin (Item ID 500) is strictly forbidden.');
        }

        const cleanAvg7d = avg7d.trim() === '' ? null : parseFloat(avg7d);
        const cleanVol7d = vol7d.trim() === '' ? null : parseInt(vol7d, 10);
        const cleanAvg30d = avg30d.trim() === '' ? null : parseFloat(avg30d);
        const cleanVol30d = vol30d.trim() === '' ? null : parseInt(vol30d, 10);

        if (
          (cleanAvg7d !== null && (isNaN(cleanAvg7d) || cleanAvg7d < 0)) ||
          (cleanVol7d !== null && (isNaN(cleanVol7d) || cleanVol7d < 0)) ||
          (cleanAvg30d !== null && (isNaN(cleanAvg30d) || cleanAvg30d < 0)) ||
          (cleanVol30d !== null && (isNaN(cleanVol30d) || cleanVol30d < 0))
        ) {
          throw new Error('Validation Error: Form values must be valid non-negative numbers.');
        }

        // Run transaction update
        db.exec({
          sql: `
            INSERT INTO prices (item_id, avg_24h, vol_24h, avg_7d, vol_7d, avg_30d, vol_30d)
            VALUES (?, 0.0, 0, ?, ?, ?, ?)
            ON CONFLICT(item_id) DO UPDATE SET
              avg_7d = excluded.avg_7d,
              vol_7d = excluded.vol_7d,
              avg_30d = excluded.avg_30d,
              vol_30d = excluded.vol_30d
          `,
          bind: [selectedItem.item_id, cleanAvg7d, cleanVol7d, cleanAvg30d, cleanVol30d],
        });

        // Trigger updates across active components
        onRefreshTrigger();
        setSuccessMsg(`Successfully updated pricing parameters for ${selectedItem.name}.`);
        
        // Refresh local selected state
        setSelectedItem({
          ...selectedItem,
          avg_7d: cleanAvg7d,
          vol_7d: cleanVol7d,
          avg_30d: cleanAvg30d,
          vol_30d: cleanVol30d,
        });
      } catch (err: any) {
        setErrorMsg(err.message || 'Transaction failed.');
        console.error(err);
      }
    });
  };

  // Handle selected recipe change to pre-populate mapping profession dropdown
  const handleRecipeChange = (recipeId: number) => {
    setSelectedRecipeId(recipeId);
    const recipe = recipesList.find((r) => r.recipe_id === recipeId);
    if (recipe) {
      setSelectedProfession(recipe.profession || 'Unknown');
    }
  };

  // Save recipe profession mapping
  const handleSaveRecipeMapping = (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !selectedRecipeId) return;

    measureExecutionTime(() => {
      try {
        setErrorMsg(null);
        setSuccessMsg(null);

        const targetProfession = selectedProfession === 'Unknown' ? null : selectedProfession;

        db.exec({
          sql: `
            UPDATE recipes
            SET profession = ?
            WHERE recipe_id = ?
          `,
          bind: [targetProfession, selectedRecipeId],
        });

        // Reload data from DB and update frontend
        loadRecipes();
        onRefreshTrigger();
        setSuccessMsg('Recipe profession mapping successfully updated.');
      } catch (err: any) {
        setErrorMsg(err.message || 'Mapping persistence failed.');
      }
    });
  };

  const currentRecipe = useMemo(() => {
    return recipesList.find((r) => r.recipe_id === selectedRecipeId);
  }, [recipesList, selectedRecipeId]);

  return (
    <div className="bg-[#121212] text-slate-200 min-h-screen flex flex-col font-sans select-none antialiased">
      {/* Top Header */}
      <header className="bg-[#1a1a1a] border-b border-[#2a2a2a] px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-yellow-200">
            TELL NO TALES - ADMIN CONSOLE
          </h1>
          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-0.5">
            Developer Administration & Database Control
          </p>
        </div>

        <div className="flex items-center space-x-6">
          {/* Latency Tracker Badge */}
          <div className="text-right">
            <span className="block text-[9px] text-slate-500 uppercase font-mono">Loop Lag Time</span>
            <span
              className={`inline-block font-mono text-xs font-bold px-2 py-0.5 rounded ${
                latencyWarning ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'bg-[#1e291b] text-emerald-400 border border-[#2e4c29]'
              }`}
            >
              {latency.toFixed(2)} ms {latencyWarning ? '(LAG WARNING)' : '(60 FPS OK)'}
            </span>
          </div>

          <button
            onClick={onBackToDashboard}
            className="bg-amber-600 hover:bg-amber-700 text-slate-950 font-bold text-xs px-4 py-2 rounded transition-colors duration-150"
          >
            ← Return to Calculator
          </button>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 p-6 overflow-y-auto">
        {/* Left Column: Fast Search & Price Editor */}
        <div className="space-y-6">
          <section className="bg-[#161616] border border-[#262626] rounded-xl p-5 shadow-lg">
            <h2 className="text-sm font-bold uppercase tracking-wider text-amber-500 mb-4 border-b border-[#2a2a2a] pb-2">
              Item Price Administration
            </h2>
            
            {/* Search Lookup input */}
            <div className="mb-4">
              <label className="block text-[10px] text-slate-400 uppercase font-mono mb-1.5">
                Quick Search Index Lookup (Name / Item ID)
              </label>
              <input
                type="text"
                placeholder="Type name or numeric ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#222] border border-[#333] text-slate-200 text-xs px-3 py-2.5 rounded focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Live Index scan search results drop area */}
            {searchResults.length > 0 && (
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg max-h-40 overflow-y-auto mb-6 scrollbar-thin">
                {searchResults.map((item) => (
                  <button
                    key={item.item_id}
                    onClick={() => handleSelectItem(item)}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors border-b border-[#242424] last:border-b-0 flex justify-between items-center ${
                      selectedItem?.item_id === item.item_id
                        ? 'bg-amber-950/20 text-amber-400 border-l-2 border-l-amber-500'
                        : 'hover:bg-[#222] text-slate-300'
                    }`}
                  >
                    <span>{item.name}</span>
                    <span className="font-mono text-[10px] text-slate-500">ID: {item.item_id}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Editor Form */}
            {selectedItem ? (
              <form onSubmit={handleSavePrice} className="space-y-4">
                <div className="flex items-center justify-between bg-[#1d1d1d] p-3 rounded-lg border border-[#2b2b2b] mb-2">
                  <div>
                    <h3 className="text-xs font-bold text-slate-200">{selectedItem.name}</h3>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">Item ID: {selectedItem.item_id}</p>
                  </div>
                  {isCoinSelected && (
                    <div className="flex items-center space-x-1.5 bg-rose-950/30 border border-rose-800/60 px-2.5 py-1 rounded-md text-[10px] font-bold text-rose-400 uppercase tracking-wide">
                      {/* Security Invariance Shield Icon */}
                      <svg className="w-3.5 h-3.5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span>LOCKED COIN</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[9px] text-slate-500 uppercase font-mono mb-1">
                      7-day Avg Price (Gold)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={avg7d}
                      disabled={isCoinSelected}
                      onChange={(e) => setAvg7d(e.target.value)}
                      className="w-full bg-[#222] border border-[#333] disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-xs px-3 py-2 rounded focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-500 uppercase font-mono mb-1">
                      7-day Volume
                    </label>
                    <input
                      type="number"
                      value={vol7d}
                      disabled={isCoinSelected}
                      onChange={(e) => setVol7d(e.target.value)}
                      className="w-full bg-[#222] border border-[#333] disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-xs px-3 py-2 rounded focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[9px] text-slate-500 uppercase font-mono mb-1">
                      30-day Avg Price (Gold)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={avg30d}
                      disabled={isCoinSelected}
                      onChange={(e) => setAvg30d(e.target.value)}
                      className="w-full bg-[#222] border border-[#333] disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-xs px-3 py-2 rounded focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-500 uppercase font-mono mb-1">
                      30-day Volume
                    </label>
                    <input
                      type="number"
                      value={vol30d}
                      disabled={isCoinSelected}
                      onChange={(e) => setVol30d(e.target.value)}
                      className="w-full bg-[#222] border border-[#333] disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-xs px-3 py-2 rounded focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isCoinSelected}
                    className="w-full bg-[#2c2c2c] border border-[#444] disabled:opacity-30 disabled:cursor-not-allowed text-slate-100 hover:bg-[#333] hover:border-amber-500 text-xs font-semibold py-2.5 rounded transition-all duration-150 uppercase"
                  >
                    Commit Price Update
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-10 text-slate-500 text-xs font-mono border-2 border-dashed border-[#262626] rounded-lg">
                Select an item from the query engine lookup results to modify pricing tables.
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Recipe Profession Bindings */}
        <div className="space-y-6">
          <section className="bg-[#161616] border border-[#262626] rounded-xl p-5 shadow-lg">
            <h2 className="text-sm font-bold uppercase tracking-wider text-amber-500 mb-4 border-b border-[#2a2a2a] pb-2">
              Recipe-to-Proficiency Mapping
            </h2>

            <form onSubmit={handleSaveRecipeMapping} className="space-y-4">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-mono mb-1.5">
                  Select Recipe Craft
                </label>
                <select
                  value={selectedRecipeId}
                  onChange={(e) => handleRecipeChange(Number(e.target.value))}
                  className="w-full bg-[#222] border border-[#333] text-slate-200 text-xs px-3 py-2.5 rounded focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="">-- Select Craft --</option>
                  {recipesList.map((rec) => (
                    <option key={rec.recipe_id} value={rec.recipe_id}>
                      {rec.output_name} (ID: {rec.output_item_id})
                    </option>
                  ))}
                </select>
              </div>

              {selectedRecipeId !== '' && (
                <>
                  <div className="bg-[#1c1c1c] border border-[#2c2c2c] rounded-lg p-3 text-xs space-y-1">
                    <p className="text-slate-400">
                      Recipe ID: <span className="text-amber-500 font-mono">{selectedRecipeId}</span>
                    </p>
                    <p className="text-slate-400">
                      Current Profession Mapping:{' '}
                      <span className="text-slate-100 font-bold">
                        {currentRecipe?.profession || 'Unknown / Unassigned (0% Labor Discount)'}
                      </span>
                    </p>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-mono mb-1.5">
                      Assign Game Profession Category
                    </label>
                    <select
                      value={selectedProfession}
                      onChange={(e) => setSelectedProfession(e.target.value)}
                      className="w-full bg-[#222] border border-[#333] text-slate-200 text-xs px-3 py-2.5 rounded focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="Unknown">Unknown/Unassigned (0% labor discount)</option>
                      {Array.from(VALID_PROFESSIONS).map((prof) => (
                        <option key={prof} value={prof}>
                          {prof}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      className="w-full bg-[#2c2c2c] border border-[#444] text-slate-100 hover:bg-[#333] hover:border-amber-500 text-xs font-semibold py-2.5 rounded transition-all duration-150 uppercase"
                    >
                      Apply Profession Mapping
                    </button>
                  </div>
                </>
              )}
            </form>
          </section>
        </div>
      </main>

      {/* Notifications overlay area */}
      {(errorMsg || successMsg) && (
        <div className="fixed bottom-16 right-6 z-50 max-w-sm space-y-2 animate-bounce">
          {errorMsg && (
            <div className="flex items-center space-x-2.5 bg-rose-950/90 border border-rose-800 text-rose-200 p-3 rounded-lg text-xs font-mono shadow-2xl">
              <svg className="w-5 h-5 text-rose-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="flex items-center space-x-2.5 bg-emerald-950/90 border border-emerald-800 text-emerald-200 p-3 rounded-lg text-xs font-mono shadow-2xl">
              <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{successMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* Mandatory Dev Footer */}
      <footer className="bg-[#1a1a1a] border-t border-[#2a2a2a] py-4 text-center">
        <p className="text-xs text-slate-500 font-mono tracking-wide">
          Crafting Calculator developed by Wasbeerotb
        </p>
      </footer>
    </div>
  );
};
