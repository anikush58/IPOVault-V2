import { supabase } from '@/sync/supabase';
import { PullPayload } from './types';

export class SyncPull {
  async pullLatestData(lastSyncTimestamp: string | null): Promise<PullPayload> {
    console.log(`[Pull] Fetching latest data from Supabase since ${lastSyncTimestamp || 'beginning of time'}...`);
    
    // Strict remote table queries:
    // - users
    // - banks
    // - ipo_master
    // - applications
    
    const queries = [
      this.fetchTable('users', lastSyncTimestamp),
      this.fetchTable('banks', lastSyncTimestamp),
      this.fetchTable('ipo_master', lastSyncTimestamp),
      this.fetchTable('applications', lastSyncTimestamp)
    ];

    const [users, banks, ipos, apps] = await Promise.all(queries);

    return {
      users: users,
      banks: banks,
      ipos: ipos,
      applications: apps,
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
    return data || [];
  }
}
