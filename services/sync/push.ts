import { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '@/sync/supabase';
import { PushResult } from './types';

export class SyncPush {
  constructor(private db: SQLiteDatabase) {}

  async pushBatchedInserts(tableName: string, payloads: any[]): Promise<PushResult> {
    if (payloads.length === 0) return { success: true };
    console.log(`[Push] Executing batched INSERT on ${tableName} for ${payloads.length} records`);
    const { error } = await supabase.from(tableName).insert(payloads);
    if (error) {
      console.error(`[Push] Batched INSERT error on ${tableName}:`, error);
      return { success: false, retryable: true };
    }
    return { success: true };
  }

  async pushBatchedDeletes(tableName: string, ids: string[]): Promise<PushResult> {
    if (ids.length === 0) return { success: true };
    console.log(`[Push] Executing batched DELETE on ${tableName} for ${ids.length} records`);
    const { error } = await supabase.from(tableName).delete().in('id', ids);
    if (error) {
      console.error(`[Push] Batched DELETE error on ${tableName}:`, error);
      return { success: false, retryable: true };
    }
    return { success: true };
  }

  // A generic dispatcher based on queue payload (used for UPDATEs)
  async pushQueueItem(tableName: string, action: string, payload: any): Promise<PushResult> {
    console.log(`[Push] Executing ${action} on ${tableName} for record ${payload.id || 'unknown'}`);
    
    if (action === 'INSERT') {
      const { error } = await supabase.from(tableName).insert(payload);
      if (error) {
        console.error(`[Push] INSERT error on ${tableName}:`, error);
        return { success: false, retryable: true };
      }
      return { success: true };
    } 
    
    if (action === 'DELETE') {
      const { error } = await supabase.from(tableName).delete().eq('id', payload.id);
      if (error) {
        console.error(`[Push] DELETE error on ${tableName}:`, error);
        return { success: false, retryable: true };
      }
      return { success: true };
    }

    if (action === 'UPDATE') {
      // Optimistic concurrency
      const expectedVersion = payload.sync_version || 0;
      const nextVersion = expectedVersion + 1;
      const nextUpdatedAt = new Date().toISOString();

      const updatePayload = {
        ...payload,
        sync_version: nextVersion,
        updated_at: nextUpdatedAt
      };

      const { data, error } = await supabase
        .from(tableName)
        .update(updatePayload)
        .eq('id', payload.id)
        .eq('sync_version', expectedVersion)
        .select()
        .maybeSingle();

      if (error) {
        console.error(`[Network] UPDATE error on ${tableName}:`, error);
        // If it's a network error or 5xx, we should retry. We assume most errors here (like timeouts) are retryable.
        return { success: false, retryable: true };
      }

      if (!data) {
        // No row updated -> sync_version mismatch or row deleted -> Conflict!
        console.warn(`[Conflict] Sync conflict on ${tableName} for id ${payload.id}. Version mismatch.`);
        
        // Fetch the remote row to pass to conflict resolver
        const { data: remoteRow } = await supabase.from(tableName).select('*').eq('id', payload.id).maybeSingle();
        return { success: false, conflict: true, remoteRow };
      }

      // Success! Persist the new sync_version and updated_at locally.
      console.log(`[Push] UPDATE successful. Updating local sync_version to ${nextVersion}.`);
      await this.db.runAsync(
        `UPDATE ${tableName} SET sync_version = ?, updated_at = ? WHERE id = ?`,
        [nextVersion, nextUpdatedAt, payload.id]
      );

      return { success: true };
    }

    return { success: false };
  }
}
