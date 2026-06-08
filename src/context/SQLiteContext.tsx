import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

export interface SQLiteDatabase {
  pointer: number;
  exec: (options: any) => any;
  checkRc: (rc: number) => void;
  close: () => void;
}

export interface SQLiteContextType {
  db: SQLiteDatabase | null;
  loading: boolean;
  progress: number;
  error: string | null;
}

const SQLiteContext = createContext<SQLiteContextType | undefined>(undefined);

interface SQLiteProviderProps {
  children: ReactNode;
  databaseUrl?: string;
}

export const SQLiteValueProvider: React.FC<SQLiteProviderProps> = ({
  children,
  databaseUrl = '/crafting.db',
}) => {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    // QA Regression Check: Verify loading does not block the main thread
    let maxDelay = 0;
    let lastTime = performance.now();
    let animFrameId: number;

    const trackMainThread = () => {
      const now = performance.now();
      const delay = now - lastTime;
      if (delay > maxDelay) {
        maxDelay = delay;
      }
      lastTime = now;
      animFrameId = requestAnimationFrame(trackMainThread);
    };
    animFrameId = requestAnimationFrame(trackMainThread);

    const initSQLite = async () => {
      try {
        setLoading(true);
        setProgress(0);

        // Fetch database with progress tracking
        const response = await fetch(databaseUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch database: ${response.status} ${response.statusText}`);
        }

        const contentLengthHeader = response.headers.get('Content-Length');
        const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
        const reader = response.body?.getReader();

        if (!reader) {
          throw new Error('ReadableStream is not supported in this environment.');
        }

        let receivedLength = 0;
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            receivedLength += value.length;
            if (contentLength > 0) {
              const currentPercent = Math.round((receivedLength / contentLength) * 100);
              // Limit progress to 95% until compilation completes
              setProgress(Math.min(95, currentPercent));
            }
          }
        }

        const arrayBuffer = new Uint8Array(receivedLength);
        let offset = 0;
        for (const chunk of chunks) {
          arrayBuffer.set(chunk, offset);
          offset += chunk.length;
        }

        // Initialize SQLite Module
        const sqlite3 = await sqlite3InitModule({
          print: console.log,
          printErr: console.error,
        });

        // Allocate WASM heap space and copy database binary
        const p = sqlite3.wasm.allocFromTypedArray(arrayBuffer);
        const wasmDb = new sqlite3.oo1.DB();

        // Deserialize database into memory
        const deserializeFlags = sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE;
        const rc = sqlite3.capi.sqlite3_deserialize(
          wasmDb.pointer,
          'main',
          p,
          arrayBuffer.byteLength,
          arrayBuffer.byteLength,
          deserializeFlags
        );

        wasmDb.checkRc(rc);

        // Immutability Check: Hard-lock Item ID 500 ("Coin")
        const checkCoinImmutability = (database: any): boolean => {
          try {
            const items = database.exec({
              sql: "SELECT name FROM items WHERE item_id = 500;",
              rowMode: "array",
            });
            const prices = database.exec({
              sql: "SELECT avg_24h, avg_7d, avg_30d FROM prices WHERE item_id = 500;",
              rowMode: "array",
            });

            if (items.length === 0 || prices.length === 0) return false;

            const name = items[0][0];
            const avg24h = prices[0][0];
            const avg7d = prices[0][1];
            const avg30d = prices[0][2];

            return (
              name.toLowerCase() === 'coin' &&
              avg24h === 0.0001 &&
              avg7d === 0.0001 &&
              avg30d === 0.0001
            );
          } catch {
            return false;
          }
        };

        // Assert initial coin immutability
        if (!checkCoinImmutability(wasmDb)) {
          throw new Error("Initial database verification failed: Item ID 500 ('Coin') is not locked at 0.0001 Gold.");
        }

        // Exposed DB interface with profiling and immutable Coin guard
        const dbWrapper: SQLiteDatabase = {
          pointer: wasmDb.pointer,
          checkRc: (code: number) => wasmDb.checkRc(code),
          close: () => wasmDb.close(),
          exec: (options: any) => {
            const sql = typeof options === 'string' ? options : options.sql;
            const isMutation = /^\s*(update|insert|delete|replace|alter|drop|create)/i.test(sql);

            const startTime = performance.now();
            let result;

            if (isMutation) {
              // Mutation guard: Wrap in SAVEPOINT to rollback on Coin violation
              try {
                wasmDb.exec("SAVEPOINT coin_lock_sp;");
                result = wasmDb.exec(options);

                if (!checkCoinImmutability(wasmDb)) {
                  throw new Error("Immutable coin value cannot be modified. Item ID 500 is locked at 0.0001 Gold.");
                }
                wasmDb.exec("RELEASE coin_lock_sp;");
              } catch (err) {
                wasmDb.exec("ROLLBACK TO coin_lock_sp;");
                wasmDb.exec("RELEASE coin_lock_sp;");
                throw err;
              }
            } else {
              result = wasmDb.exec(options);
            }

            const queryDuration = performance.now() - startTime;
            if (queryDuration > 16) {
              console.warn(
                `[Performance Warning] Query execution exceeded frame budget: ${queryDuration.toFixed(2)}ms (>16ms). Query: "${sql.substring(0, 120)}..."`
              );
            }
            return result;
          },
        };

        if (active) {
          setDb(dbWrapper);
          setProgress(100);
          setLoading(false);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Failed to initialize database.');
          setLoading(false);
        }
      } finally {
        cancelAnimationFrame(animFrameId);
        console.log(`[QA Regression Check] Initial load main-thread lag check: Max lag was ${maxDelay.toFixed(2)}ms (Threshold: 50ms)`);
      }
    };

    initSQLite();

    return () => {
      active = false;
      cancelAnimationFrame(animFrameId);
    };
  }, [databaseUrl]);

  return (
    <SQLiteContext.Provider value={{ db, loading, progress, error }}>
      {children}
    </SQLiteContext.Provider>
  );
};

export const useSQLite = (): SQLiteContextType => {
  const context = useContext(SQLiteContext);
  if (context === undefined) {
    throw new Error('useSQLite must be used within a SQLiteValueProvider');
  }
  return context;
};
