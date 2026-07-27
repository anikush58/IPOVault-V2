import { SQLiteDatabase } from 'expo-sqlite';
import { SyncQueue } from './queue';
import { SyncPush } from './push';
import { SyncPull } from './pull';
import { ConflictResolver } from './conflictResolver';
import { syncStore } from './syncStatus';
import { getSupabaseTableName } from './constants';

export class SyncEngine {
  private queue: SyncQueue;
  private pushLayer: SyncPush;
  private pullLayer: SyncPull;
  private conflictResolver: ConflictResolver;

  constructor(private db: SQLiteDatabase) {
    this.queue = new SyncQueue(db);
    this.pushLayer = new SyncPush(db);
    this.pullLayer = new SyncPull();
    this.conflictResolver = new ConflictResolver();
  }

  private async mergeTable(tableName: string, rows: any[], pendingIds: Set<string>): Promise<void> {
    if (!rows || rows.length === 0) return;
    
    let merged = 0;
    let skipped = 0;

    for (const row of rows) {
      if (pendingIds.has(row.id)) {
        skipped++;
        console.log(`[Merge] Skipped row ${row.id} in ${tableName} (pending queue item exists)`);
        continue;
      }
      
      const columns = Object.keys(row).join(', ');
      const placeholders = Object.keys(row).map(() => '?').join(', ');
      const updates = Object.keys(row).map(k => `${k}=excluded.${k}`).join(', ');
      
      // SQLite UPSERT syntax (requires SQLite 3.24+)
      const sql = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`;
      
      await this.db.runAsync(sql, Object.values(row));
      merged++;
    }
    console.log(`[SQLite] UPSERTed ${merged} rows into ${tableName} (${skipped} skipped)`);
  }

  async runSyncPipeline(userId: string | undefined): Promise<void> {
    if (!userId) {
      console.log('[Sync] Skipping sync: User not authenticated');
      syncStore.update({ authState: 'Disconnected' });
      return;
    }

    const startTime = Date.now();

    try {
      syncStore.update({ state: 'Syncing', authState: 'Connected' });
      console.log('[Sync] Pipeline started');

      // 1. Read pending items from queue (respecting exponential backoff next_retry_at)
      const pendingItems = await this.queue.getPendingItems();
      syncStore.update({ pendingCount: pendingItems.length });
      
      console.log(`[Queue] Found ${pendingItems.length} items ready to process.`);

      let rowsUploaded = 0;
      let conflictsEncountered = 0;

      // 2. Group by actions for batching
      const inserts = pendingItems.filter(i => i.action === 'INSERT');
      const deletes = pendingItems.filter(i => i.action === 'DELETE');
      const updates = pendingItems.filter(i => i.action === 'UPDATE');
      const tables = [...new Set(pendingItems.map(i => i.table_name))];

      const totalFound = pendingItems.length;
      let totalAttempted = 0;
      let totalSuccessful = 0;
      let totalFailed = 0;

      // 3. Batched Inserts & Deletes
      for (const table of tables) {
        const tableInserts = inserts.filter(i => i.table_name === table);
        if (tableInserts.length > 0) {
          totalAttempted += tableInserts.length;
          for (const item of tableInserts) {
            console.log(`[Queue Item] Queue ID: ${item.id} | Action: INSERT | Local: ${item.table_name} | Remote: ${getSupabaseTableName(item.table_name)}`);
          }
          const payloads = tableInserts.map(i => JSON.parse(i.payload));
          const result = await this.pushLayer.pushBatchedInserts(table, payloads, userId);
          if (result.success) {
            for (const item of tableInserts) await this.queue.markSuccess(item.id);
            rowsUploaded += tableInserts.length;
            totalSuccessful += tableInserts.length;
          } else {
            for (const item of tableInserts) await this.queue.markFailed(item.id, new Error('Insert failed'), item.retry_count);
            totalFailed += tableInserts.length;
          }
        }
        
        const tableDeletes = deletes.filter(i => i.table_name === table);
        if (tableDeletes.length > 0) {
          totalAttempted += tableDeletes.length;
          for (const item of tableDeletes) {
            console.log(`[Queue Item] Queue ID: ${item.id} | Action: DELETE | Local: ${item.table_name} | Remote: ${getSupabaseTableName(item.table_name)}`);
          }
          const ids = tableDeletes.map(i => i.record_id);
          const result = await this.pushLayer.pushBatchedDeletes(table, ids);
          if (result.success) {
            for (const item of tableDeletes) await this.queue.markSuccess(item.id);
            rowsUploaded += tableDeletes.length;
            totalSuccessful += tableDeletes.length;
          } else {
            for (const item of tableDeletes) await this.queue.markFailed(item.id, new Error('Delete failed'), item.retry_count);
            totalFailed += tableDeletes.length;
          }
        }
      }

      // 4. Sequential Updates (for optimistic concurrency)
      for (const item of updates) {
        totalAttempted++;
        console.log(`[Queue Item] Queue ID: ${item.id} | Action: UPDATE | Local: ${item.table_name} | Remote: ${getSupabaseTableName(item.table_name)}`);
        await this.queue.markProcessing(item.id);
        
        let payloadObj: any = {};
        try {
          payloadObj = JSON.parse(item.payload);
        } catch (e) {
          console.warn(`[Queue] Failed to parse payload for item ${item.id}`);
        }

        const result = await this.pushLayer.pushQueueItem(item.table_name, item.action, payloadObj, userId);
        
        if (result.success) {
          await this.queue.markSuccess(item.id);
          rowsUploaded++;
          totalSuccessful++;
        } else if (result.retryable) {
          await this.queue.markFailed(item.id, new Error('Network error'), item.retry_count);
          totalFailed++;
        } else if (result.conflict) {
          conflictsEncountered++;
          const resolution = await this.conflictResolver.resolveSingleConflict(payloadObj, result.remoteRow);
          
          if (resolution === 'LOCAL_WINS') {
            console.log(`[Sync] Conflict resolved locally for ${item.table_name}. Preparing overwrite payload.`);
            const remoteVersion = result.remoteRow?.sync_version || 0;
            await this.db.runAsync(`UPDATE ${item.table_name} SET sync_version = ? WHERE id = ?`, [remoteVersion, payloadObj.id]);
            const updatedPayload = { ...payloadObj, sync_version: remoteVersion };
            await this.db.runAsync(`UPDATE sync_queue SET payload = ? WHERE id = ?`, [JSON.stringify(updatedPayload), item.id]);
          } else {
            console.log(`[Sync] Conflict resolved remotely for ${item.table_name}. Dropping local queue item.`);
            await this.queue.markSuccess(item.id); 
          }
        } else {
          await this.queue.markFailed(item.id, new Error('Push failed'), item.retry_count);
          totalFailed++;
        }
      }

      // Update remaining pending count
      const remainingItems = await this.queue.getPendingItems();
      syncStore.update({ pendingCount: remainingItems.length });

      console.log('--- Push Stage Summary ---');
      console.log(`Queue Items Found: ${totalFound}`);
      console.log(`Queue Items Attempted: ${totalAttempted}`);
      console.log(`Queue Items Successful: ${totalSuccessful}`);
      console.log(`Queue Items Failed: ${totalFailed}`);
      console.log(`Queue Items Remaining: ${remainingItems.length}`);
      console.log('--------------------------');
      syncStore.update({ pendingCount: remainingItems.length });

      // 5. Pull latest data
      const pullStartTime = Date.now();
      const lastSyncTime = syncStore.getStatus().lastSyncTimestamp;
      const remoteData = await this.pullLayer.pullLatestData(lastSyncTime);
      const supabaseLatencyMs = Date.now() - pullStartTime;
      
      const rowsDownloaded = remoteData.users.length + remoteData.banks.length + remoteData.ipos.length + remoteData.applications.length + (remoteData.ipo_master?.length || 0);

      // We protect our queue during merge by skipping pending IDs.
      const pendingIds = new Set(remainingItems.map(q => q.record_id));
      
      // 6. Apply to local DB (Dependency order)
      console.log(`[Sync] Merging ${rowsDownloaded} downloaded records into local DB...`);
      await this.mergeTable('users_table', remoteData.users, pendingIds);
      await this.mergeTable('bank_accounts', remoteData.banks, pendingIds);
      await this.mergeTable('ipo_listings', remoteData.ipos, pendingIds);
      await this.mergeTable('ipo_applications', remoteData.applications, pendingIds);
      if (remoteData.ipo_master && remoteData.ipo_master.length > 0) {
        await this.mergeTable('ipo_master', remoteData.ipo_master, pendingIds);
      }

      const now = new Date().toISOString();
      const avgSyncDurationMs = Date.now() - startTime;

      syncStore.update({ 
        state: 'Idle', 
        lastSyncTimestamp: now, 
        error: null,
        rowsUploaded,
        rowsDownloaded,
        conflicts: conflictsEncountered,
        avgSyncDurationMs,
        supabaseLatencyMs
      });
      console.log(`[Sync] Pipeline completed successfully in ${avgSyncDurationMs}ms`);

    } catch (error: any) {
      console.error('[Sync] Error during pipeline execution:', error);
      syncStore.update({ 
        state: 'Error', 
        error: error?.message || 'Unknown error',
        lastFailedSync: new Date().toISOString()
      });
    }
  }
}
