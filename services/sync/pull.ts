import { supabase } from '@/sync/supabase';
import { PullPayload } from './types';

export class SyncPull {
  async pullLatestData(lastSyncTimestamp: string | null): Promise<PullPayload> {
    console.log(`[Pull] Fetching latest data from Supabase since ${lastSyncTimestamp || 'beginning of time'}...`);
    
    // We fetch from the 4 actual Supabase tables.
    // The query `.gt('updated_at', lastSyncTimestamp)` ensures we only get delta changes.
    // We also use `.order('updated_at', { ascending: true })` to process oldest to newest if needed,
    // though the engine will UPSERT them locally which handles duplicates anyway.
    
    const queries = [
      this.fetchTable('users_table', lastSyncTimestamp),
      this.fetchTable('bank_accounts', lastSyncTimestamp),
      this.fetchTable('ipo_listings', lastSyncTimestamp),
      this.fetchTable('ipo_applications', lastSyncTimestamp)
    ];

    const [users, banks, ipos, apps] = await Promise.all(queries);

    return {
      users: users,
      banks: banks,
      ipos: ipos,
      applications: apps,
      brokers: [], // Not a real table
      settings: [], // Not a real table
      notes: [], // Not a real table
    };
  }

  private async fetchTable(tableName: string, lastSyncTimestamp: string | null): Promise<any[]> {
    let query = supabase.from(tableName).select('*');
    if (lastSyncTimestamp) {
      query = query.gt('updated_at', lastSyncTimestamp);
    }
    
    const { data, error } = await query;
    if (error) {
      console.error(`[Pull] Error fetching from ${tableName}:`, error);
      return [];
    }
    return data || [];
  }
}
