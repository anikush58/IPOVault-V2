import { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '@/sync/supabase';
import { PushResult } from './types';
import { getSupabaseTableName } from './constants';

function sanitizePayload(tableName: string, payload: any, userId?: string): any {
  const item = { ...payload };
  if (userId) {
    if (!item.owner_id) item.owner_id = userId;
    if (!item.user_id && tableName !== 'ipo_applications') item.user_id = userId;
  }
  if (tableName === 'ipo_applications') {
    if (item.user_id && !item.profile_id) {
      item.profile_id = item.user_id;
    }
  }
  if (tableName === 'ipo_listings') {
    if (item.ipo_name && !item.company_name) item.company_name = item.ipo_name;
    if (item.buy_price !== undefined) {
      if (item.price_band_min === undefined) item.price_band_min = item.buy_price;
      if (item.price_band_max === undefined) item.price_band_max = item.buy_price;
    }
    if (item.quantity !== undefined && item.lot_size === undefined) {
      item.lot_size = item.quantity;
    }
  }
  return item;
}

export class SyncPush {
  constructor(private db: SQLiteDatabase) {}

  async pushBatchedInserts(tableName: string, payloads: any[], userId?: string): Promise<PushResult> {
    if (payloads.length === 0) return { success: true };

    const remoteTable = getSupabaseTableName(tableName);
    const sanitizedPayloads = payloads.map((p) => sanitizePayload(tableName, p, userId));

    console.log('[DEBUG] Local table:', tableName);
    console.log('[DEBUG] Remote table:', remoteTable);
    console.log('[DEBUG] Operation: UPSERT (Batched)');
    console.log('[DEBUG] Payload count:', sanitizedPayloads.length);
    console.log('[DEBUG] Sample Payload:', JSON.stringify(sanitizedPayloads[0] ?? {}, null, 2));

    const { error } = await supabase.from(remoteTable).upsert(sanitizedPayloads, { onConflict: 'id' });

    if (error) {
      console.error(`[Push] Batched UPSERT error on ${remoteTable}:`, error);
      return { success: false, retryable: true };
    }
    return { success: true };
  }

  async pushBatchedDeletes(tableName: string, ids: string[]): Promise<PushResult> {
    if (ids.length === 0) return { success: true };
    const remoteTable = getSupabaseTableName(tableName);

    console.log('[DEBUG] Local table:', tableName);
    console.log('[DEBUG] Remote table:', remoteTable);
    console.log('[DEBUG] Operation: DELETE (Batched)');
    console.log('[DEBUG] IDs:', ids);

    const { error } = await supabase.from(remoteTable).delete().in('id', ids);

    if (error) {
      console.error(`[Push] Batched DELETE error on ${remoteTable}:`, error);
      return { success: false, retryable: true };
    }
    return { success: true };
  }

  // A generic dispatcher based on queue payload (used for UPDATEs)
  async pushQueueItem(tableName: string, action: string, payload: any, userId?: string): Promise<PushResult> {
    const remoteTable = getSupabaseTableName(tableName);

    if (action === 'INSERT') {
      const item = sanitizePayload(tableName, payload, userId);
      console.log('[DEBUG] Local table:', tableName);
      console.log('[DEBUG] Remote table:', remoteTable);
      console.log('[DEBUG] Operation: INSERT (Single)');
      console.log('[DEBUG] Payload:', JSON.stringify(item, null, 2));

      const { error } = await supabase.from(remoteTable).upsert(item, { onConflict: 'id' });
      if (error) {
        console.error(`[Push] INSERT/UPSERT error on ${remoteTable}:`, error);
        return { success: false, retryable: true };
      }
      return { success: true };
    } 

    if (action === 'DELETE') {
      console.log('[DEBUG] Local table:', tableName);
      console.log('[DEBUG] Remote table:', remoteTable);
      console.log('[DEBUG] Operation: DELETE (Single)');
      console.log('[DEBUG] Record ID:', payload.id);

      const { error } = await supabase.from(remoteTable).delete().eq('id', payload.id);
      if (error) {
        console.error(`[Push] DELETE error on ${remoteTable}:`, error);
        return { success: false, retryable: true };
      }
      return { success: true };
    }

    if (action === 'UPDATE') {
      const expectedVersion = payload.sync_version || 0;
      const nextVersion = expectedVersion + 1;
      const nextUpdatedAt = new Date().toISOString();

      const updatePayload: any = sanitizePayload(tableName, {
        ...payload,
        sync_version: nextVersion,
        updated_at: nextUpdatedAt
      }, userId);

      console.log('[DEBUG] Local table:', tableName);
      console.log('[DEBUG] Remote table:', remoteTable);
      console.log('[DEBUG] Operation: UPDATE (Single)');
      console.log('[DEBUG] Payload:', JSON.stringify(updatePayload, null, 2));

      const { data, error } = await supabase
        .from(remoteTable)
        .update(updatePayload)
        .eq('id', payload.id)
        .eq('sync_version', expectedVersion)
        .select()
        .maybeSingle();

      if (error) {
        console.error(`[Network] UPDATE error on ${remoteTable}:`, error);
        return { success: false, retryable: true };
      }

      if (!data) {
        console.warn(`[Conflict] Sync conflict on ${remoteTable} for id ${payload.id}. Version mismatch.`);
        const { data: remoteRow } = await supabase.from(remoteTable).select('*').eq('id', payload.id).maybeSingle();
        return { success: false, conflict: true, remoteRow };
      }

      console.log(`[Push] UPDATE successful on ${remoteTable}. Updating local sync_version to ${nextVersion}.`);
      await this.db.runAsync(
        `UPDATE ${tableName} SET sync_version = ?, updated_at = ? WHERE id = ?`,
        [nextVersion, nextUpdatedAt, payload.id]
      );

      return { success: true };
    }

    return { success: false };
  }
}
