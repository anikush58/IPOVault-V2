import { SQLiteDatabase } from 'expo-sqlite';
import { SyncQueueItem } from './types';

export class SyncQueue {
  constructor(private db: SQLiteDatabase) {}

  async getPendingItems(): Promise<SyncQueueItem[]> {
    console.log('[Queue] Fetching pending items...');
    const now = new Date().toISOString();
    return await this.db.getAllAsync<SyncQueueItem>(
      'SELECT * FROM sync_queue WHERE next_retry_at IS NULL OR next_retry_at <= ? ORDER BY created_at ASC',
      [now]
    );
  }

  async markProcessing(id: string): Promise<void> {
    console.log(`[Queue] Marking item ${id} as processing...`);
    // In a more robust system, we might set status='processing', but for this milestone we just log.
  }

  async markSuccess(id: string): Promise<void> {
    console.log(`[Queue] Item ${id} sync succeeded, removing from queue.`);
    await this.db.runAsync('DELETE FROM sync_queue WHERE id = ?', [id]);
  }

  async markFailed(id: string, error: any, currentRetryCount: number): Promise<void> {
    const nextRetryCount = currentRetryCount + 1;
    let backoffSeconds = 5; // retry 1
    if (nextRetryCount === 2) backoffSeconds = 15;
    if (nextRetryCount === 3) backoffSeconds = 60;
    if (nextRetryCount >= 4) backoffSeconds = 300; // max backoff 5 mins

    const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();
    console.log(`[Retry] Item ${id} sync failed: ${error?.message || String(error)}. Next retry at ${nextRetryAt} (attempt ${nextRetryCount})`);
    
    await this.db.runAsync(
      'UPDATE sync_queue SET retry_count = ?, next_retry_at = ? WHERE id = ?',
      [nextRetryCount, nextRetryAt, id]
    );
  }
}
