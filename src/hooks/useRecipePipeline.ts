import { useMemo } from 'react';
import { calculateAdjustedLabor } from '../utils/laborEngine';
import { parseGoldToCopper } from '../utils/currency';

export interface IngredientMaterial {
  material_item_id: number;
  name: string;
  quantity: number;
  avg_7d?: number | null;
  avg_30d?: number | null;
}

export interface RecipeData {
  recipe_id: number;
  output_item_id: number;
  output_name: string;
  output_amount: number;
  req_labor: number;
  profession: string;
  output_avg_7d?: number | null;
  output_avg_30d?: number | null;
  ingredients: IngredientMaterial[];
}

export interface IngredientMetric {
  material_item_id: number;
  name: string;
  quantity: number;
  resolved_price_copper: number;
  total_cost_copper: number;
  warning: boolean;
}

export interface RecipeMetrics {
  recipe_id: number;
  output_item_id: number;
  resolved_output_price_copper: number;
  cost_mats_copper: number;
  labor_adjusted: number;
  profit_silver: number | null;
  ratio_silver_per_labor: number | null;
  warnings: string[];
  ingredients: IngredientMetric[];
  isUnpriced?: boolean;
}

/**
 * Resolves item unit price using fallback hierarchy:
 * local override -> 7-day avg -> 30-day avg.
 * If all three are missing/null, falls back to 0 and flags a warning.
 */
function resolvePriceInCopper(
  itemId: number,
  localOverride: number | undefined | null,
  avg7d: number | undefined | null,
  avg30d: number | undefined | null,
  warnings: string[],
  itemName?: string
): { priceCopper: number; hasWarning: boolean } {
  // If it's Coin (Item ID 500), hard lock price to 1 Copper
  if (itemId === 500) {
    return { priceCopper: 1, hasWarning: false };
  }

  if (localOverride !== undefined && localOverride !== null) {
    return { priceCopper: parseGoldToCopper(localOverride), hasWarning: false };
  }
  if (avg7d !== undefined && avg7d !== null) {
    return { priceCopper: parseGoldToCopper(avg7d), hasWarning: false };
  }
  if (avg30d !== undefined && avg30d !== null) {
    return { priceCopper: parseGoldToCopper(avg30d), hasWarning: false };
  }

  // All three are missing
  const nameDisplay = itemName ? `"${itemName}" (ID: ${itemId})` : `Item ID ${itemId}`;
  warnings.push(`Missing pricing data for ${nameDisplay}. Defaulting to 0.`);
  return { priceCopper: 0, hasWarning: true };
}

export function calculateRecipeMetrics(
  recipe: RecipeData,
  overrides: Record<string | number, number>,
  proficiencyLevel: string
): RecipeMetrics {
  const warnings: string[] = [];

  // 1. Output Price Resolution
  // Check override by both string and number keys
  const outputOverride = overrides[recipe.output_item_id] ?? overrides[recipe.output_item_id.toString()];
  const { priceCopper: pFinalCopper } = resolvePriceInCopper(
    recipe.output_item_id,
    outputOverride,
    recipe.output_avg_7d,
    recipe.output_avg_30d,
    warnings,
    recipe.output_name
  );

  // 2. Ingredient Costs
  let costMatsCopper = 0;
  const ingredientsMetrics: IngredientMetric[] = recipe.ingredients.map(ing => {
    const ingOverride = overrides[ing.material_item_id] ?? overrides[ing.material_item_id.toString()];
    const { priceCopper: ingPriceCopper, hasWarning } = resolvePriceInCopper(
      ing.material_item_id,
      ingOverride,
      ing.avg_7d,
      ing.avg_30d,
      warnings,
      ing.name
    );
    const totalCost = ingPriceCopper * ing.quantity;
    costMatsCopper += totalCost;

    return {
      material_item_id: ing.material_item_id,
      name: ing.name,
      quantity: ing.quantity,
      resolved_price_copper: ingPriceCopper,
      total_cost_copper: totalCost,
      warning: hasWarning,
    };
  });

  // 3. Adjusted Labor Integration
  const laborAdjusted = calculateAdjustedLabor(recipe.req_labor, proficiencyLevel, recipe.profession);

  // Check if output is unpriced
  const isUnpriced = (recipe.output_item_id !== 500) &&
                     (outputOverride === undefined || outputOverride === null) &&
                     (recipe.output_avg_7d === undefined || recipe.output_avg_7d === null) &&
                     (recipe.output_avg_30d === undefined || recipe.output_avg_30d === null);

  // 4. Net Profit (Silver) & 5. Silver-per-Labor Ratio
  let profitSilver: number | null = null;
  let ratioSilverPerLabor: number | null = null;

  if (!isUnpriced) {
    profitSilver = ((recipe.output_amount * pFinalCopper) - costMatsCopper) / 100;
    ratioSilverPerLabor = laborAdjusted > 0 ? profitSilver / laborAdjusted : 0;
  }

  return {
    recipe_id: recipe.recipe_id,
    output_item_id: recipe.output_item_id,
    resolved_output_price_copper: isUnpriced ? 0 : pFinalCopper,
    cost_mats_copper: costMatsCopper,
    labor_adjusted: laborAdjusted,
    profit_silver: profitSilver,
    ratio_silver_per_labor: ratioSilverPerLabor,
    warnings,
    ingredients: ingredientsMetrics,
    isUnpriced
  };
}

export function useRecipePipeline(
  recipes: RecipeData[],
  overrides: Record<string | number, number>,
  proficiencyLevel: string
): Record<number, RecipeMetrics> {
  return useMemo(() => {
    const metricsMap: Record<number, RecipeMetrics> = {};
    for (const recipe of recipes) {
      metricsMap[recipe.recipe_id] = calculateRecipeMetrics(recipe, overrides, proficiencyLevel);
    }
    return metricsMap;
  }, [recipes, overrides, proficiencyLevel]);
}
