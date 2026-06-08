export type ArcheAgeProfession =
  | 'Husbandry'
  | 'Farming'
  | 'Fishing'
  | 'Logging'
  | 'Gathering'
  | 'Mining'
  | 'Alchemy'
  | 'Cooking'
  | 'Handicrafts'
  | 'Machining'
  | 'Metalwork'
  | 'Printing'
  | 'Masonry'
  | 'Tailoring'
  | 'Leatherwork'
  | 'Weaponry'
  | 'Carpentry'
  | 'Construction'
  | 'Larceny'
  | 'Commerce'
  | 'Artistry'
  | 'Exploration';

export const VALID_PROFESSIONS: Set<ArcheAgeProfession> = new Set([
  'Husbandry',
  'Farming',
  'Fishing',
  'Logging',
  'Gathering',
  'Mining',
  'Alchemy',
  'Cooking',
  'Handicrafts',
  'Machining',
  'Metalwork',
  'Printing',
  'Masonry',
  'Tailoring',
  'Leatherwork',
  'Weaponry',
  'Carpentry',
  'Construction',
  'Larceny',
  'Commerce',
  'Artistry',
  'Exploration'
]);

export type ArcheAgeProficiencyLevel =
  | 'Amateur'
  | 'Novice'
  | 'Veteran'
  | 'Expert'
  | 'Master'
  | 'Authority'
  | 'Champion'
  | 'Adept'
  | 'Herald'
  | 'Virtuoso'
  | 'Celebrity'
  | 'Famed';

/**
 * Calculates the adjusted labor cost for a recipe based on the baseline labor,
 * active character proficiency level, and profession category.
 * 
 * Mathematical Equation:
 *   Labor_adj = Math.max(1, Math.floor(baseLabor * (1 - discount)))
 * 
 * If a recipe is assigned to a category that is "Unknown", null, or outside the 
 * 22 primary professions of ArcheAge Classic, a 0% discount is applied.
 */
export function calculateAdjustedLabor(
  baseLabor: number,
  proficiencyLevel: string,
  profession: string
): number {
  if (baseLabor <= 0) return 0;

  // Strict domain and profession validation
  if (!profession || !VALID_PROFESSIONS.has(profession as ArcheAgeProfession)) {
    return Math.max(1, Math.floor(baseLabor));
  }

  const normalizedLevel = (proficiencyLevel || '').trim().toLowerCase();
  
  let discount = 0.0;
  switch (normalizedLevel) {
    case 'amateur':
    case 'novice':
      discount = 0.0;
      break;
    case 'veteran':
      discount = 0.05;
      break;
    case 'expert':
      discount = 0.10;
      break;
    case 'master':
      discount = 0.15;
      break;
    case 'authority':
    case 'champion':
    case 'adept':
    case 'herald':
      discount = 0.20;
      break;
    case 'virtuoso':
      discount = 0.25;
      break;
    case 'celebrity':
      discount = 0.30;
      break;
    case 'famed':
      discount = 0.40;
      break;
    default:
      discount = 0.0;
      break;
  }

  return Math.max(1, Math.floor(baseLabor * (1 - discount)));
}
