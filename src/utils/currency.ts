export const COIN_ITEM_ID = 500;
export const COIN_COPPER_VALUE = 1; // 1 Copper = 0.0001 Gold

/**
 * Safely parses human-readable Gold/Silver/Copper inputs into a single integer representation of Copper.
 * Eliminates IEEE 754 floating point errors by using integer-only arithmetic.
 * 
 * Supports:
 * - Numbers (e.g., 12.3456, 0.1111) -> Treated as Gold
 * - Decimal strings (e.g., "12.3456", "-0.1111") -> Treated as Gold
 * - Game currency strings (e.g., "12g 34s 56c", "12g 56c", "-1s 50c") -> Sum of components
 */
export function parseGoldToCopper(input: string | number): number {
  if (typeof input === 'number') {
    if (!isFinite(input)) return 0;
    return Math.round(input * 10000);
  }

  const trimmed = input.trim();
  if (!trimmed) return 0;

  // Check if it's a standard decimal number string (no g, s, or c characters)
  const isDecimalString = /^-?\d*(?:\.\d+)?$/.test(trimmed);
  if (isDecimalString) {
    const val = parseFloat(trimmed);
    return isNaN(val) ? 0 : Math.round(val * 10000);
  }

  // Parse game currency format: e.g., "-12g 34s 56c"
  const isNegative = /^\s*-/.test(trimmed);
  const absoluteStr = trimmed.replace(/^\s*-/, '');

  const goldMatch = absoluteStr.match(/(\d+(?:\.\d+)?)\s*g/i);
  const silverMatch = absoluteStr.match(/(\d+(?:\.\d+)?)\s*s/i);
  const copperMatch = absoluteStr.match(/(\d+(?:\.\d+)?)\s*c/i);

  const gold = goldMatch ? parseFloat(goldMatch[1]) : 0;
  const silver = silverMatch ? parseFloat(silverMatch[1]) : 0;
  const copper = copperMatch ? parseFloat(copperMatch[1]) : 0;

  const totalCopper = 
    Math.round(gold * 10000) + 
    Math.round(silver * 100) + 
    Math.round(copper);

  return isNegative ? -totalCopper : totalCopper;
}

/**
 * Formats a Copper integer back to a high-density, clean string representation.
 * E.g., 123456 -> "12g 34s 56c"
 *       120056 -> "12g 56c"
 *       0      -> "0c"
 *       -123   -> "-1s 23c"
 */
export function formatCopperToGoldString(copper: number): string {
  if (!isFinite(copper) || isNaN(copper)) return '0c';

  const isNegative = copper < 0;
  const absCopper = Math.abs(copper);

  const gold = Math.floor(absCopper / 10000);
  const silver = Math.floor((absCopper % 10000) / 100);
  const cop = absCopper % 100;

  const parts: string[] = [];
  if (gold > 0) parts.push(`${gold}g`);
  if (silver > 0) parts.push(`${silver}s`);
  if (cop > 0 || parts.length === 0) parts.push(`${cop}c`);

  return (isNegative ? '-' : '') + parts.join(' ');
}

/**
 * Enforces base cost static invariance for Item ID 500 (Coin).
 * Resolves the given item ID to its cost in copper. Coin is hard-locked at 1 Copper (0.0001 Gold).
 */
export function getItemPriceInCopper(
  itemId: number | string,
  priceLookup: (id: number) => number | string | null
): number {
  const parsedId = typeof itemId === 'string' ? parseInt(itemId, 10) : itemId;
  
  if (parsedId === COIN_ITEM_ID) {
    return COIN_COPPER_VALUE;
  }

  const rawPrice = priceLookup(parsedId);
  if (rawPrice === null || rawPrice === undefined) {
    return 0;
  }

  return parseGoldToCopper(rawPrice);
}
