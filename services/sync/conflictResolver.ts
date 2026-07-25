import { PullPayload } from './types';

export class ConflictResolver {
  /**
   * Resolves a single conflict detected during push.
   * Strategy: Last Write Wins based on updated_at.
   */
  async resolveSingleConflict(localRow: any, remoteRow: any): Promise<'LOCAL_WINS' | 'REMOTE_WINS'> {
    console.log(`[Conflict] Resolving conflict for record ${localRow.id}...`);
    
    if (!remoteRow) {
      console.log('[Conflict] Remote row is missing (deleted on cloud). Remote wins (keeps deleted).');
      return 'REMOTE_WINS';
    }

    const localTime = new Date(localRow.updated_at).getTime();
    const remoteTime = new Date(remoteRow.updated_at).getTime();

    if (localTime > remoteTime) {
      console.log('[Conflict] Local write is newer. LOCAL_WINS.');
      return 'LOCAL_WINS';
    } else {
      console.log('[Conflict] Remote write is newer. REMOTE_WINS.');
      return 'REMOTE_WINS';
    }
  }
  /**
   * Resolves conflicts between remote payloads and local database.
   * Strategy: Last Write Wins (compares updated_at).
   * 
   * @param remoteData The data pulled from Supabase
   * @returns A filtered payload containing only records that should be applied locally
   */
  async resolve(remoteData: PullPayload): Promise<PullPayload> {
    console.log('[Conflict] Starting conflict resolution (Last Write Wins)...');
    
    // In the future:
    // 1. Fetch local records for each remote ID
    // 2. Compare local.updated_at vs remote.updated_at
    // 3. Keep remote if remote.updated_at > local.updated_at
    
    // Mock resolution
    return {
      users: [],
      banks: [],
      ipos: [],
      applications: [],
      brokers: [],
      settings: [],
      notes: [],
    };
  }
}
