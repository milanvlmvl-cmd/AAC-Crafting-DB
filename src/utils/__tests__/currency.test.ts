import { describe, it, expect } from 'vitest';
import { 
  parseGoldToCopper, 
  formatCopperToGoldString, 
  getItemPriceInCopper, 
  COIN_ITEM_ID, 
  COIN_COPPER_VALUE 
} from '../currency';

describe('Currency Utility Library', () => {
  describe('parseGoldToCopper', () => {
    it('should correctly handle numeric Gold inputs', () => {
      expect(parseGoldToCopper(12.3456)).toBe(123456);
      expect(parseGoldToCopper(0)).toBe(0);
      expect(parseGoldToCopper(-1.2345)).toBe(-12345);
    });

    it('should eliminate IEEE 754 precision issues for known failure inputs', () => {
      // 0.1111 Gold
      expect(parseGoldToCopper(0.1111)).toBe(1111);
      // 29.9999 Gold
      expect(parseGoldToCopper(29.9999)).toBe(299999);
      
      // Floating point addition check (0.1 + 0.2 in JS is 0.30000000000000004)
      const p1 = parseGoldToCopper(0.1); // 1000 c
      const p2 = parseGoldToCopper(0.2); // 2000 c
      expect(p1 + p2).toBe(3000);
      expect(parseGoldToCopper(0.1 + 0.2)).toBe(3000);
    });

    it('should parse standard decimal string inputs', () => {
      expect(parseGoldToCopper('12.3456')).toBe(123456);
      expect(parseGoldToCopper('0.1111')).toBe(1111);
      expect(parseGoldToCopper('-29.9999')).toBe(-299999);
      expect(parseGoldToCopper('0')).toBe(0);
      expect(parseGoldToCopper('   ')).toBe(0);
    });

    it('should parse game-specific string format inputs (Xg Ys Zc)', () => {
      expect(parseGoldToCopper('12g 34s 56c')).toBe(123456);
      expect(parseGoldToCopper('12g34s56c')).toBe(123456);
      expect(parseGoldToCopper('12 g 34 s 56 c')).toBe(123456);
    });

    it('should parse incomplete game-specific string formats (missing components)', () => {
      expect(parseGoldToCopper('12g 56c')).toBe(120056);
      expect(parseGoldToCopper('34s')).toBe(3400);
      expect(parseGoldToCopper('56c')).toBe(56);
      expect(parseGoldToCopper('10g')).toBe(100000);
    });

    it('should parse negative game-specific currency strings', () => {
      expect(parseGoldToCopper('-12g 34s 56c')).toBe(-123456);
      expect(parseGoldToCopper('-12g 56c')).toBe(-120056);
      expect(parseGoldToCopper('-34s')).toBe(-3400);
      expect(parseGoldToCopper('-56c')).toBe(-56);
    });

    it('should handle massive gold values without overflow issues', () => {
      expect(parseGoldToCopper(1000000000.1234)).toBe(10000000001234);
      expect(parseGoldToCopper('9999999999g 99s 99c')).toBe(99999999999999);
    });
  });

  describe('formatCopperToGoldString', () => {
    it('should format copper integers back to high-density clean strings', () => {
      expect(formatCopperToGoldString(123456)).toBe('12g 34s 56c');
      expect(formatCopperToGoldString(120056)).toBe('12g 56c');
      expect(formatCopperToGoldString(120000)).toBe('12g');
      expect(formatCopperToGoldString(3400)).toBe('34s');
      expect(formatCopperToGoldString(56)).toBe('56c');
      expect(formatCopperToGoldString(0)).toBe('0c');
    });

    it('should format negative copper integers correctly', () => {
      expect(formatCopperToGoldString(-123456)).toBe('-12g 34s 56c');
      expect(formatCopperToGoldString(-120056)).toBe('-12g 56c');
      expect(formatCopperToGoldString(-3400)).toBe('-34s');
      expect(formatCopperToGoldString(-56)).toBe('-56c');
    });
  });

  describe('Static Invariance Check (Item ID 500 - Coin)', () => {
    it('should guarantee that Item ID 500 always returns exactly 1 Copper regardless of mock lookup overrides', () => {
      // Mock lookup functions that return incorrect values for Coin
      const mockDatabasePriceLookup = (id: number) => {
        if (id === COIN_ITEM_ID) return 99.9999; // Attempted override
        return 12.3456;
      };

      const mockDatabasePriceLookupStr = (id: number) => {
        if (id === COIN_ITEM_ID) return '99g 99s 99c'; // Attempted override
        return '12g 34s';
      };

      // Assert Item ID 500 is hardcoded to 1 Copper (0.0001 Gold)
      expect(getItemPriceInCopper(COIN_ITEM_ID, mockDatabasePriceLookup)).toBe(COIN_COPPER_VALUE);
      expect(getItemPriceInCopper(String(COIN_ITEM_ID), mockDatabasePriceLookup)).toBe(COIN_COPPER_VALUE);
      expect(getItemPriceInCopper(COIN_ITEM_ID, mockDatabasePriceLookupStr)).toBe(COIN_COPPER_VALUE);
      
      // Ensure other items are mapped correctly
      expect(getItemPriceInCopper(100, mockDatabasePriceLookup)).toBe(123456);
      expect(getItemPriceInCopper(100, mockDatabasePriceLookupStr)).toBe(123400);
    });
  });
});
