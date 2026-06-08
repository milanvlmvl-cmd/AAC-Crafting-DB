import { describe, it, expect } from 'vitest';
import { calculateAdjustedLabor } from '../laborEngine';

describe('Labor Calculation Engine', () => {
  const validProfessions = ['Husbandry', 'Alchemy', 'Metalwork', 'Exploration'];
  const invalidProfessions = ['Sailing', 'Unknown', '', 'cooking', 'ALCHEMY']; // Case-sensitive exact check test

  describe('11-Tier Discount Validation', () => {
    // Map of level to expected discount percentage
    const discountTiers: Record<string, number> = {
      Amateur: 0.0,
      Novice: 0.0,
      Veteran: 0.05,
      Expert: 0.10,
      Master: 0.15,
      Authority: 0.20,
      Champion: 0.20,
      Adept: 0.20,
      Herald: 0.20,
      Virtuoso: 0.25,
      Celebrity: 0.30,
      Famed: 0.40,
    };

    const baseLabors = [1, 10, 100, 250];

    validProfessions.forEach((profession) => {
      describe(`Profession: ${profession}`, () => {
        Object.entries(discountTiers).forEach(([level, discount]) => {
          it(`should correctly calculate adjusted labor for level: ${level} (discount: ${discount * 100}%)`, () => {
            baseLabors.forEach((baseLabor) => {
              const expectedAdjusted = Math.max(1, Math.floor(baseLabor * (1 - discount)));
              const result = calculateAdjustedLabor(baseLabor, level, profession);
              expect(result).toBe(expectedAdjusted);
            });
          });
        });
      });
    });
  });

  describe('Floor Constraint', () => {
    it('should never return less than 1 labor for positive base labor, even at 40% discount', () => {
      // 1 labor base * (1 - 0.40) = 0.6 => floor = 0 => clamped to 1
      expect(calculateAdjustedLabor(1, 'Famed', 'Farming')).toBe(1);
      
      // 2 labor base * (1 - 0.40) = 1.2 => floor = 1
      expect(calculateAdjustedLabor(2, 'Famed', 'Farming')).toBe(1);

      // 0 or negative labor base should return 0
      expect(calculateAdjustedLabor(0, 'Famed', 'Farming')).toBe(0);
      expect(calculateAdjustedLabor(-5, 'Famed', 'Farming')).toBe(0);
    });
  });

  describe('Domain & Profession Constraints', () => {
    it('should fallback to 0% discount if the profession is not in the list of 22 official professions', () => {
      invalidProfessions.forEach((invalidProf) => {
        // Even with Famed (40% discount), invalid profession should return 100% of base labor (0% discount)
        const result = calculateAdjustedLabor(100, 'Famed', invalidProf);
        expect(result).toBe(100);
      });
    });

    it('should handle undefined, null, or empty string values safely without throwing', () => {
      // @ts-expect-error - testing invalid JS inputs
      expect(calculateAdjustedLabor(100, null, null)).toBe(100);
      // @ts-expect-error - testing invalid JS inputs
      expect(calculateAdjustedLabor(100, undefined, undefined)).toBe(100);
      expect(calculateAdjustedLabor(100, 'Famed', '')).toBe(100);
    });
  });
});
