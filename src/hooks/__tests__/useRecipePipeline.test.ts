import { describe, it, expect } from 'vitest';
import { calculateRecipeMetrics, RecipeData } from '../useRecipePipeline';

describe('Recipe Calculation Engine & Pipeline', () => {
  // Mock standard recipe: output amount 2, base labor 50, profession Tailoring
  const mockRecipe: RecipeData = {
    recipe_id: 101,
    output_item_id: 1001,
    output_name: 'Fabric Sheet',
    output_amount: 2,
    req_labor: 50,
    profession: 'Tailoring',
    output_avg_7d: 1.5, // 1.5 Gold = 15000 Copper
    output_avg_30d: 1.2, // 1.2 Gold = 12000 Copper
    ingredients: [
      {
        material_item_id: 2001,
        name: 'Cotton',
        quantity: 10,
        avg_7d: 0.1, // 0.1 Gold = 1000 Copper
        avg_30d: 0.08,
      },
      {
        material_item_id: 2002,
        name: 'Fine Thread',
        quantity: 1,
        avg_7d: null,
        avg_30d: 0.5, // 0.5 Gold = 5000 Copper
      }
    ]
  };

  describe('Fallback Hierarchy Validation', () => {
    it('should fall back correctly: P_local -> 7d_avg -> 30d_avg -> 0 with warnings', () => {
      // 1. Local overrides active
      const overrides1 = {
        '1001': 2.0, // Output Override = 2.0 Gold = 20000 Copper
        '2001': 0.15, // Cotton = 0.15 Gold = 1500 Copper
        '2002': 0.6, // Fine Thread = 0.6 Gold = 6000 Copper
      };
      const result1 = calculateRecipeMetrics(mockRecipe, overrides1, 'Amateur');
      expect(result1.resolved_output_price_copper).toBe(20000);
      expect(result1.ingredients[0].resolved_price_copper).toBe(1500);
      expect(result1.ingredients[1].resolved_price_copper).toBe(6000);
      expect(result1.warnings.length).toBe(0);

      // 2. No overrides -> should fall back to 7d (or 30d if 7d is null)
      const result2 = calculateRecipeMetrics(mockRecipe, {}, 'Amateur');
      expect(result2.resolved_output_price_copper).toBe(15000); // 7d avg is 1.5
      expect(result2.ingredients[0].resolved_price_copper).toBe(1000); // 7d avg is 0.1
      expect(result2.ingredients[1].resolved_price_copper).toBe(5000); // 7d is null, 30d avg is 0.5 -> 5000
      expect(result2.warnings.length).toBe(0);

      // 3. Output missing 7d, falls back to 30d
      const recipeNo7dOutput: RecipeData = {
        ...mockRecipe,
        output_avg_7d: null,
      };
      const result3 = calculateRecipeMetrics(recipeNo7dOutput, {}, 'Amateur');
      expect(result3.resolved_output_price_copper).toBe(12000); // 30d avg is 1.2
      expect(result3.warnings.length).toBe(0);

      // 4. Missing all prices -> defaults to 0 and flags warnings
      const recipeMissingAll: RecipeData = {
        ...mockRecipe,
        output_avg_7d: null,
        output_avg_30d: null,
        ingredients: [
          {
            material_item_id: 2001,
            name: 'Cotton',
            quantity: 10,
            avg_7d: null,
            avg_30d: null,
          }
        ]
      };
      const result4 = calculateRecipeMetrics(recipeMissingAll, {}, 'Amateur');
      expect(result4.resolved_output_price_copper).toBe(0);
      expect(result4.ingredients[0].resolved_price_copper).toBe(0);
      expect(result4.warnings.length).toBe(2); // One for output, one for cotton ingredient
      expect(result4.ingredients[0].warning).toBe(true);
    });

    it('should support both string and numeric keys in overrides', () => {
      const overridesNumeric = {
        1001: 2.5,
        2001: 0.2,
        2002: 0.8
      };
      const result = calculateRecipeMetrics(mockRecipe, overridesNumeric, 'Amateur');
      expect(result.resolved_output_price_copper).toBe(25000);
      expect(result.ingredients[0].resolved_price_copper).toBe(2000);
      expect(result.ingredients[1].resolved_price_copper).toBe(8000);
    });
  });

  describe('Coin Immutability Verification (ID 500)', () => {
    it('should lock Coin price to 1 Copper, ignoring any local overrides or averages', () => {
      const coinRecipe: RecipeData = {
        recipe_id: 102,
        output_item_id: 500, // Output is Coin
        output_name: 'Coin',
        output_amount: 100,
        req_labor: 10,
        profession: 'Farming',
        output_avg_7d: 9.9,
        output_avg_30d: 9.9,
        ingredients: [
          {
            material_item_id: 500, // Ingredient is Coin
            name: 'Coin',
            quantity: 50,
            avg_7d: 9.9,
            avg_30d: 9.9,
          }
        ]
      };

      const overrides = {
        '500': 15.0 // Override Coin to 15 Gold (should be ignored)
      };

      const result = calculateRecipeMetrics(coinRecipe, overrides, 'Amateur');
      expect(result.resolved_output_price_copper).toBe(1); // Locked at 1 Copper
      expect(result.ingredients[0].resolved_price_copper).toBe(1); // Locked at 1 Copper
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle zero-labor crafts safely without throwing', () => {
      const zeroLaborRecipe: RecipeData = {
        ...mockRecipe,
        req_labor: 0
      };
      const result = calculateRecipeMetrics(zeroLaborRecipe, {}, 'Amateur');
      expect(result.labor_adjusted).toBe(0);
      expect(result.ratio_silver_per_labor).toBe(0); // Safely returns 0
    });

    it('should handle negative profit scenarios and calculate negative ratio accurately', () => {
      // Material cost: Cotton 10 * 1000 + Fine Thread 1 * 5000 = 15000 Copper (1.5 Gold)
      // Output value: 2 * 0.5 Gold = 1.0 Gold = 10000 Copper
      // Net Profit = (10000 - 15000) / 100 = -50 Silver
      // Labor adjusted = 50 (Amateur discount 0%)
      // Ratio = -50 / 50 = -1 Silver per Labor
      const cheapOutputRecipe: RecipeData = {
        ...mockRecipe,
        output_avg_7d: 0.5,
      };
      const result = calculateRecipeMetrics(cheapOutputRecipe, {}, 'Amateur');
      expect(result.profit_silver).toBe(-50);
      expect(result.ratio_silver_per_labor).toBe(-1);
    });

    it('should protect against invalid/negative labor values', () => {
      const negativeLaborRecipe: RecipeData = {
        ...mockRecipe,
        req_labor: -10
      };
      const result = calculateRecipeMetrics(negativeLaborRecipe, {}, 'Amateur');
      expect(result.labor_adjusted).toBe(0);
      expect(result.ratio_silver_per_labor).toBe(0);
    });
  });
});
