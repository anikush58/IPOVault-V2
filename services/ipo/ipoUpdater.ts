import { IPOProvider, IPOMasterRecord } from './types';
import { IPORepository } from './ipoRepository';
import { syncStore } from '../sync/syncStatus'; // Using syncStatus purely for some diagnostics, but better to keep it isolated.
// Actually, let's create a dedicated diagnostics store for IPO Updater.

export interface IPODiagnostics {
  lastUpdateTimestamp: string | null;
  rowsUpdated: number;
  rowsInserted: number; // For simplicity in sqlite batch, we combined to upsert, but we can track total
  totalRowsUpserted: number;
  apiResponseTimeMs: number;
  lastFailure: string | null;
  cacheAgeMs: number;
}

type Listener = (d: IPODiagnostics) => void;

class IPODiagnosticsStore {
  private data: IPODiagnostics = {
    lastUpdateTimestamp: null,
    rowsUpdated: 0,
    rowsInserted: 0,
    totalRowsUpserted: 0,
    apiResponseTimeMs: 0,
    lastFailure: null,
    cacheAgeMs: 0,
  };
  private listeners: Set<Listener> = new Set();

  get() { return { ...this.data }; }
  
  update(partial: Partial<IPODiagnostics>) {
    this.data = { ...this.data, ...partial };
    this.notify();
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    l(this.get());
    return () => this.listeners.delete(l);
  }

  private notify() {
    for (const l of this.listeners) l(this.get());
  }
}
export const ipoDiagnosticsStore = new IPODiagnosticsStore();

// A Mock Provider for demonstrating architecture.
export class MockIPOProvider implements IPOProvider {
  async fetchIPOs(since: string | null): Promise<Partial<IPOMasterRecord>[]> {
    return new Promise(resolve => {
      setTimeout(() => {
        // Return some dummy mock data for validation
        const now = new Date().toISOString();
        resolve([
          {
            id: 'mock-1',
            company_name: 'TechFlow Private Limited',
            ipo_name: 'TechFlow IPO',
            symbol: 'TECHFLOW',
            exchange: 'NSE',
            status: 'Upcoming',
            sector: 'Technology',
            updated_at: now,
          },
          {
            id: 'mock-2',
            company_name: 'GreenEnergy Solutions Ltd',
            ipo_name: 'GreenEnergy IPO',
            symbol: 'GREENEN',
            exchange: 'BSE',
            status: 'Open',
            sector: 'Renewable Energy',
            updated_at: now,
            close_date: new Date(Date.now() + 86400000 * 2).toISOString(),
          }
        ]);
      }, 600); // simulate latency
    });
  }
}

export class IPOUpdater {
  private isUpdating = false;

  constructor(
    private repository: IPORepository,
    private provider: IPOProvider
  ) {}

  async runUpdate() {
    if (this.isUpdating) return;
    this.isUpdating = true;
    const startTime = Date.now();
    try {
      console.log('[Updater] Starting incremental IPO update...');
      const since = await this.repository.getLastUpdatedTimestamp();
      
      const rawData = await this.provider.fetchIPOs(since);
      const apiResponseTimeMs = Date.now() - startTime;
      
      if (rawData.length > 0) {
        console.log(`[Updater] Fetched ${rawData.length} records. Updating SQLite...`);
        const upserted = await this.repository.upsertBatch(rawData);
        
        ipoDiagnosticsStore.update({
          lastUpdateTimestamp: new Date().toISOString(),
          totalRowsUpserted: ipoDiagnosticsStore.get().totalRowsUpserted + upserted,
          apiResponseTimeMs,
          lastFailure: null,
          cacheAgeMs: 0
        });
      } else {
        console.log('[Updater] No new records to update.');
        ipoDiagnosticsStore.update({
          lastUpdateTimestamp: new Date().toISOString(),
          apiResponseTimeMs,
          lastFailure: null,
          cacheAgeMs: 0
        });
      }
    } catch (e: any) {
      console.error('[Updater] Failed to update IPOs:', e);
      ipoDiagnosticsStore.update({
        lastFailure: e.message || 'Network error',
      });
    } finally {
      this.isUpdating = false;
    }
  }

  updateCacheAge() {
    const last = ipoDiagnosticsStore.get().lastUpdateTimestamp;
    if (last) {
      ipoDiagnosticsStore.update({
        cacheAgeMs: Date.now() - new Date(last).getTime()
      });
    }
  }
}
