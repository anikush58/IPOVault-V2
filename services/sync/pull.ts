import { supabase } from '@/sync/supabase';
import { PullPayload } from './types';
import { transformForRemote } from './transform';

function logSupabaseOperation(
  remoteTable: string,
  operation: 'SELECT' | 'UPSERT' | 'DELETE' | 'UPDATE',
  payload: any,
  data: any,
  error: any
) {
  console.log(`\n=================== [SUPABASE OPERATION LOG] ===================`);
  console.log(`- Remote Table: '${remoteTable}'`);
  console.log(`- Operation: '${operation}'`);
  console.log(`- Payload:`, JSON.stringify(payload, null, 2));
  console.log(`- Returned Data:`, JSON.stringify(data, null, 2));
  if (error) {
    console.error(`- ERROR ENCOUNTERED:`, error);
    console.error(`  - Complete Error Object:`, JSON.stringify(error, null, 2));
    console.error(`  - PostgREST Code: ${error?.code ?? 'N/A'}`);
    console.error(`  - Message: ${error?.message ?? 'N/A'}`);
    console.error(`  - Details: ${error?.details ?? 'N/A'}`);
    console.error(`  - Hint: ${error?.hint ?? 'N/A'}`);
  } else {
    console.log(`- Status: SUCCESS`);
  }
  console.log(`================================================================\n`);
}

export class SyncPull {
  async pullLatestData(lastSyncTimestamp: string | null): Promise<PullPayload> {
    console.log(`[Pull] Fetching latest data from Supabase since ${lastSyncTimestamp || 'beginning of time'}...`);

    // Verified production schema remote tables only:
    // users, banks, applications, ipo_master
    const [users, banks, apps, ipoMaster] = await Promise.all([
      this.fetchTable('users', lastSyncTimestamp),
      this.fetchTable('banks', lastSyncTimestamp),
      this.fetchTable('applications', lastSyncTimestamp),
      this.fetchTable('ipo_master', lastSyncTimestamp),
    ]);

    return {
      users,
      banks,
      applications: apps,
      ipo_master: ipoMaster,
      ipos: [],
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

    logSupabaseOperation(remoteTable, 'SELECT', { lastSyncTimestamp }, data, error);

    if (error) {
      console.error(`[Pull] Error fetching from ${remoteTable}:`, error);
      return [];
    }

    return (data || []).map((row) => transformForRemote(remoteTable, row));
  }
}
