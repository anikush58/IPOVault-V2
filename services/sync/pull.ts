import { supabase } from '@/sync/supabase';
import { PullPayload } from './types';
import { transformForRemote } from './transform';

export class SyncPull {
  async pullLatestData(lastSyncTimestamp: string | null): Promise<PullPayload> {
    console.log(`[Pull] Fetching latest data from Supabase since ${lastSyncTimestamp || 'beginning of time'}...`);
    
    // Remote table queries:
    // Read/Write tables: users, banks, applications, ipos (ipo_listings)
    // Pull-only reference table: ipo_master
    
    const [users, banks, apps, ipoMaster, ipos] = await Promise.all([
      this.fetchTable('users', lastSyncTimestamp),
      this.fetchTable('banks', lastSyncTimestamp),
      this.fetchTable('applications', lastSyncTimestamp),
      this.fetchTable('ipo_master', lastSyncTimestamp),
      this.fetchTable('ipos', lastSyncTimestamp),
    ]);

    return {
      users,
      banks,
      applications: apps,
      ipo_master: ipoMaster,
      ipos,
      brokers: [],
      settings: [],
      notes: [],
    };
  }

  private async fetchTable(remoteTable: string, lastSyncTimestamp: string | null): Promise<any[]> {
    console.log('[DEBUG] Pulling from:', remoteTable);
    let query = supabase.from(remoteTable).select('*');
    if (lastSyncTimestamp) {
      query = query.gt('updated_at', lastSyncTimestamp);
    }
    
    const { data, error } = await query;

    if (error) {
      console.error(`[Pull] Error fetching from ${remoteTable}:`, error);
      return [];
    }

    return (data || []).map((row) => transformForRemote(remoteTable, row));
  }
}
