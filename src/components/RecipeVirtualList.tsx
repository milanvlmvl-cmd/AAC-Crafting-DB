import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { FixedSizeList as List, ListOnScrollProps } from 'react-window';
import { RecipeData, RecipeMetrics, IngredientMaterial } from '../hooks/useRecipePipeline';
import { ArcheAgeProficiencyLevel } from '../utils/laborEngine';

interface ProcessedRecipeItem {
  recipe: RecipeData;
  metrics: RecipeMetrics;
  vol_7d: number;
  vol_30d: number;
}

interface RecipeVirtualListProps {
  processedRecipes: ProcessedRecipeItem[];
  overrides: Record<number, number>;
  proficiency: string;
  handlePriceOverride: (itemId: number, rawVal: string) => void;
}

export const RecipeVirtualList: React.FC<RecipeVirtualListProps> = ({
  processedRecipes,
  overrides,
  proficiency,
  handlePriceOverride,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: '100%', height: 600 });
  const lastScrollTime = useRef<number>(0);

  // ResizeObserver to adapt to the container's layout size automatically
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({
        width: `${width}px`,
        height: height > 0 ? height : 600,
      });
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Performance measurement boundary for Scroll Events
  const handleScroll = (props: ListOnScrollProps) => {
    const now = performance.now();
    if (lastScrollTime.current > 0) {
      const scrollDuration = now - lastScrollTime.current;
      // If scroll events are blocking the thread too much (rough estimate based on intervals)
      if (scrollDuration > 16) {
        // We can track if frames are dropping, but we must be careful not to spam logs.
        // Let's log scroll performance metrics when needed.
      }
    }
    lastScrollTime.current = now;
  };

  // Virtual Row wrapper component with layout effect measurement
  const Row: React.FC<{ index: number; style: React.CSSProperties }> = ({ index, style }) => {
    const renderStartTime = performance.now();
    const item = processedRecipes[index];

    useLayoutEffect(() => {
      const renderDuration = performance.now() - renderStartTime;
      if (renderDuration > 16) {
        console.warn(
          `[RecipeVirtualList] WARNING: Row render at index ${index} blocked the thread for ${renderDuration.toFixed(
            2
          )}ms (budget: 16ms)`
        );
      }
    });

    if (!item) return null;

    const { recipe, metrics, vol_7d, vol_30d } = item;

    // Calculate labor discount representation
    const normalizedLevel = (proficiency || '').trim().toLowerCase();
    let discountPercent = 0;
    if (normalizedLevel === 'veteran') discountPercent = 5;
    else if (normalizedLevel === 'expert') discountPercent = 10;
    else if (normalizedLevel === 'master') discountPercent = 15;
    else if (
      ['authority', 'champion', 'adept', 'herald'].includes(normalizedLevel)
    )
      discountPercent = 20;
    else if (normalizedLevel === 'virtuoso') discountPercent = 25;
    else if (normalizedLevel === 'celebrity') discountPercent = 30;
    else if (normalizedLevel === 'famed') discountPercent = 40;

    const isUnpriced = metrics ? metrics.isUnpriced : false;
    const netProfitGold = metrics && metrics.profit_silver !== null ? metrics.profit_silver / 100 : 0;
    const slRatio = metrics && metrics.ratio_silver_per_labor !== null ? metrics.ratio_silver_per_labor : 0;
    const isSLPositive = slRatio >= 0;

    return (
      <div
        style={{ ...style, height: '160px', boxSizing: 'border-box' }}
        className="px-4 py-2 border-b border-[#222] bg-[#1a1a1a] hover:bg-[#1d1d1d] flex flex-col justify-between transition-colors duration-150 overflow-hidden"
      >
        {/* Row Header */}
        <div className="flex justify-between items-center h-6">
          <div className="flex items-center space-x-3">
            <span className="text-amber-500 font-bold text-sm tracking-wide truncate max-w-[200px] md:max-w-[300px]">
              {recipe.output_name}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">ID: {recipe.recipe_id}</span>
            <span className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 rounded font-medium border border-slate-700">
              {recipe.profession}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            {isUnpriced ? (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded shadow-sm bg-zinc-800 border border-zinc-700 text-zinc-400">
                Market Price Missing
              </span>
            ) : (
              <>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded shadow-sm ${
                    isSLPositive
                      ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-400'
                      : 'bg-rose-950/60 border border-rose-800 text-rose-400'
                  }`}
                >
                  {slRatio.toFixed(2)} S/L
                </span>
                <span className="text-xs font-mono text-slate-300 font-bold">
                  {netProfitGold >= 0 ? '+' : ''}
                  {netProfitGold.toFixed(4)} G
                </span>
              </>
            )}
          </div>
        </div>

        {/* Row Grid Body */}
        <div className="grid grid-cols-3 gap-4 text-[11px] text-slate-400 font-mono h-[54px] my-1">
          {/* Labor Allocation */}
          <div className="p-1.5 bg-[#151515] rounded border border-[#2b2b2b] flex flex-col justify-between">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider block">Labor Allocation</span>
            <div className="flex justify-between">
              <span>Base / Adj:</span>
              <span className="text-slate-300">
                {recipe.req_labor} / <span className="text-amber-500">{metrics ? metrics.labor_adjusted : recipe.req_labor}</span>
              </span>
            </div>
          </div>

          {/* Market Liquidity Indicators */}
          <div className="p-1.5 bg-[#151515] rounded border border-[#2b2b2b] flex flex-col justify-between">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider block">Market Velocity</span>
            <div className="flex justify-between truncate">
              <span>30d Avg:</span>
              <span className="text-slate-300 text-right">
                {recipe.output_avg_30d ? `${recipe.output_avg_30d.toFixed(2)}G` : '0G'}{' '}
                <span className="text-[9px] text-slate-500">({vol_30d})</span>
              </span>
            </div>
          </div>

          {/* Inline Local Price Editor */}
          <div className="p-1.5 bg-[#151515] rounded border border-[#2b2b2b] flex flex-col justify-between">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider block">Local Value (Gold)</span>
            <div className="flex items-center space-x-1">
              <input
                type="number"
                step="0.0001"
                placeholder={
                  recipe.output_avg_7d
                    ? recipe.output_avg_7d.toFixed(4)
                    : recipe.output_avg_30d
                    ? recipe.output_avg_30d.toFixed(4)
                    : '0.0000'
                }
                value={overrides[recipe.output_item_id] !== undefined ? overrides[recipe.output_item_id] : ''}
                onChange={(e) => handlePriceOverride(recipe.output_item_id, e.target.value)}
                className="w-full bg-[#222] border border-[#333] text-slate-200 text-[10px] px-1.5 py-0.5 rounded focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={() => handlePriceOverride(recipe.output_item_id, '')}
                className="text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-400 px-1 py-0.5 rounded"
                title="Reset Override"
              >
                ✖
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Ingredient Breakdown Checklist */}
        <div className="border-t border-[#222] pt-1.5 h-[50px] overflow-y-auto scrollbar-none">
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {recipe.ingredients.map((ing) => {
              const ingOverride = overrides[ing.material_item_id];
              const resolvedPriceCopper = metrics
                ? metrics.ingredients.find((i) => i.material_item_id === ing.material_item_id)?.resolved_price_copper ?? 0
                : 0;
              const resolvedPriceGold = resolvedPriceCopper / 10000;
              const isCoin = ing.material_item_id === 500;

              return (
                <div
                  key={ing.material_item_id}
                  className="flex items-center space-x-1.5 bg-[#1b1b1b] px-2 py-0.5 rounded border border-[#262626] text-[10px]"
                >
                  <input
                    type="checkbox"
                    defaultChecked
                    className="rounded border-[#333] text-amber-500 focus:ring-0 focus:ring-offset-0 bg-[#222] h-3 w-3"
                  />
                  <span className="text-slate-300 truncate max-w-[120px]">
                    {ing.quantity}x <span className="font-semibold text-slate-200">{ing.name}</span>
                  </span>

                  {isCoin ? (
                    <span className="text-[9px] text-indigo-400 bg-indigo-950/40 px-1 rounded" title="Coin locked at 0.0001 Gold">
                      0.0001G
                    </span>
                  ) : (
                    <div className="flex items-center space-x-1">
                      <span className="text-[9px] text-slate-500">
                        ({ingOverride !== undefined ? 'L' : ing.avg_7d ? '7d' : '30d'})
                      </span>
                      <input
                        type="number"
                        step="0.0001"
                        placeholder={resolvedPriceGold.toFixed(4)}
                        value={ingOverride !== undefined ? ingOverride : ''}
                        onChange={(e) => handlePriceOverride(ing.material_item_id, e.target.value)}
                        className="w-14 bg-[#252525] border border-[#3a3a3a] text-slate-200 text-[9px] px-1 py-0.2 rounded text-center focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="w-full h-full">
      <List
        height={dimensions.height as number}
        itemCount={processedRecipes.length}
        itemSize={160}
        width={dimensions.width}
        onScroll={handleScroll}
        className="scrollbar-thin scrollbar-color"
        style={{
          scrollbarColor: '#d4af37 #1a1a1a',
          scrollbarWidth: 'thin',
        }}
      >
        {Row}
      </List>
    </div>
  );
};
