export interface BackupPayload {
  version: string;
  timestamp: number;
  proficiencies: Record<string, string>;
  priceOverrides: Record<string, number>;
}

export interface RestoreResult {
  success: boolean;
  error?: string;
}

/**
 * Safely exports the user's session data from localStorage as a JSON file download.
 */
export function exportSessionBackup(): void {
  try {
    const proficienciesRaw = localStorage.getItem('tnt_user_proficiencies');
    const overridesRaw = localStorage.getItem('tnt_user_overrides');

    const proficiencies: Record<string, string> = proficienciesRaw ? JSON.parse(proficienciesRaw) : {};
    const priceOverrides: Record<string, number> = overridesRaw ? JSON.parse(overridesRaw) : {};

    const payload: BackupPayload = {
      version: '1.0',
      timestamp: Date.now(),
      proficiencies,
      priceOverrides,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const isoDate = new Date().toISOString().split('T')[0];
    
    link.href = url;
    link.download = `tnt_backup_${isoDate}.json`;
    
    // Append to document to support Firefox/some browser security models, then click and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error: any) {
    console.error('Failed to export session backup:', error);
  }
}

/**
 * Safely restores the user's session data from a JSON payload string.
 * Performs strict validation and strips out core currency (Item ID 500) modifications.
 */
export function restoreSessionBackup(jsonString: string): RestoreResult {
  try {
    if (!jsonString || typeof jsonString !== 'string') {
      return { success: false, error: 'Payload must be a non-empty string.' };
    }

    let payload: any;
    try {
      payload = JSON.parse(jsonString);
    } catch (e: any) {
      return { success: false, error: 'Corrupted or invalid JSON string.' };
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { success: false, error: 'Backup payload must be a valid JSON object.' };
    }

    // 1. Strict version check
    if (payload.version !== '1.0') {
      return { success: false, error: `Unsupported backup version: "${payload.version || 'unknown'}". Expected "1.0".` };
    }

    // 2. Structural checks
    if (typeof payload.timestamp !== 'number') {
      return { success: false, error: 'Missing or invalid timestamp.' };
    }

    if (!payload.proficiencies || typeof payload.proficiencies !== 'object' || Array.isArray(payload.proficiencies)) {
      return { success: false, error: 'Missing or invalid proficiencies block.' };
    }

    if (!payload.priceOverrides || typeof payload.priceOverrides !== 'object' || Array.isArray(payload.priceOverrides)) {
      return { success: false, error: 'Missing or invalid priceOverrides block.' };
    }

    // Verify all keys and values in proficiencies are strings
    for (const key of Object.keys(payload.proficiencies)) {
      if (typeof payload.proficiencies[key] !== 'string') {
        return { success: false, error: 'Proficiency levels must be string values.' };
      }
    }

    // Verify all keys and values in priceOverrides are numbers
    for (const key of Object.keys(payload.priceOverrides)) {
      if (typeof payload.priceOverrides[key] !== 'number') {
        return { success: false, error: 'Price overrides must be numeric values.' };
      }
    }

    // 3. Security Lock: Sanitization of Item ID "500" ("Coin")
    const priceOverridesSanitized = { ...payload.priceOverrides };
    if ('500' in priceOverridesSanitized) {
      delete priceOverridesSanitized['500'];
    }
    if (500 in priceOverridesSanitized) {
      delete priceOverridesSanitized[500];
    }

    // 4. Persistence
    localStorage.setItem('tnt_user_proficiencies', JSON.stringify(payload.proficiencies));
    localStorage.setItem('tnt_user_overrides', JSON.stringify(priceOverridesSanitized));

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'An unexpected error occurred during restore.' };
  }
}
