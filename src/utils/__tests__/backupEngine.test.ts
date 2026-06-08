import { describe, it, expect, beforeEach, vi } from 'vitest';
import { exportSessionBackup, restoreSessionBackup, BackupPayload } from '../backupEngine';

describe('Backup and Restore Engine', () => {
  // Mock localStorage
  let localStorageMock: Record<string, string> = {};

  beforeEach(() => {
    localStorageMock = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => localStorageMock[key] || null,
      setItem: (key: string, value: string) => {
        localStorageMock[key] = value;
      },
      clear: () => {
        localStorageMock = {};
      },
    });

    // Mock URL and document for export testing
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });

    vi.stubGlobal('document', {
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      createElement: vi.fn(() => ({
        href: '',
        download: '',
        click: vi.fn(),
      })),
    });
  });

  describe('exportSessionBackup', () => {
    it('should read from localStorage keys and trigger a file download', () => {
      localStorageMock['tnt_user_proficiencies'] = JSON.stringify({ Alchemy: 'Famed' });
      localStorageMock['tnt_user_overrides'] = JSON.stringify({ '123': 1.5 });

      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const clickSpy = vi.fn();
      const mockLink = { href: '', download: '', click: clickSpy };
      
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);

      exportSessionBackup();

      expect(appendSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(mockLink.download).toMatch(/^tnt_backup_\d{4}-\d{2}-\d{2}\.json$/);
    });
  });

  describe('restoreSessionBackup - Security Sanitization Integrity', () => {
    it('should completely strip Item ID 500 (Coin) from price overrides, leaving others intact', () => {
      const payload: BackupPayload = {
        version: '1.0',
        timestamp: 1686240000000,
        proficiencies: { Farming: 'Virtuoso' },
        priceOverrides: {
          '500': 100.5, // Forged override for Coin string key
          '101': 2.5,
        },
      };

      const result = restoreSessionBackup(JSON.stringify(payload));
      expect(result.success).toBe(true);

      const savedOverrides = JSON.parse(localStorageMock['tnt_user_overrides']);
      expect(savedOverrides['500']).toBeUndefined();
      expect(savedOverrides['101']).toBe(2.5);

      const savedProficiencies = JSON.parse(localStorageMock['tnt_user_proficiencies']);
      expect(savedProficiencies['Farming']).toBe('Virtuoso');
    });

    it('should handle numeric 500 override key and strip it', () => {
      const rawPayload = {
        version: '1.0',
        timestamp: 1686240000000,
        proficiencies: {},
        priceOverrides: {
          500: 5.0, // numeric key
          200: 10.0,
        },
      };

      const result = restoreSessionBackup(JSON.stringify(rawPayload));
      expect(result.success).toBe(true);

      const savedOverrides = JSON.parse(localStorageMock['tnt_user_overrides']);
      expect(savedOverrides['500']).toBeUndefined();
      expect(savedOverrides[500]).toBeUndefined();
      expect(savedOverrides['200']).toBe(10.0);
    });
  });

  describe('restoreSessionBackup - Malicious & Corrupted Input Tolerance', () => {
    it('should reject unparsable non-JSON strings gracefully', () => {
      const result = restoreSessionBackup('{{invalid-json');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Corrupted or invalid JSON string');
    });

    it('should reject non-object payloads', () => {
      const result = restoreSessionBackup('"just a string"');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Backup payload must be a valid JSON object');
    });

    it('should reject mismatched version', () => {
      const payload = {
        version: '2.0',
        timestamp: 1686240000000,
        proficiencies: {},
        priceOverrides: {},
      };
      const result = restoreSessionBackup(JSON.stringify(payload));
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported backup version');
    });

    it('should reject missing proficiencies or overrides blocks', () => {
      const payloadMissingProf = {
        version: '1.0',
        timestamp: 1686240000000,
        priceOverrides: {},
      };
      let result = restoreSessionBackup(JSON.stringify(payloadMissingProf));
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing or invalid proficiencies block');

      const payloadMissingOverrides = {
        version: '1.0',
        timestamp: 1686240000000,
        proficiencies: {},
      };
      result = restoreSessionBackup(JSON.stringify(payloadMissingOverrides));
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing or invalid priceOverrides block');
    });

    it('should reject invalid types within blocks', () => {
      const payloadInvalidProfType = {
        version: '1.0',
        timestamp: 1686240000000,
        proficiencies: { Farming: 123 }, // should be string
        priceOverrides: {},
      };
      let result = restoreSessionBackup(JSON.stringify(payloadInvalidProfType));
      expect(result.success).toBe(false);
      expect(result.error).toContain('Proficiency levels must be string values');

      const payloadInvalidOverrideType = {
        version: '1.0',
        timestamp: 1686240000000,
        proficiencies: {},
        priceOverrides: { '100': 'not-a-number' },
      };
      result = restoreSessionBackup(JSON.stringify(payloadInvalidOverrideType));
      expect(result.success).toBe(false);
      expect(result.error).toContain('Price overrides must be numeric values');
    });
  });
});
