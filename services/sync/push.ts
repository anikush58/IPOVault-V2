import { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '@/sync/supabase';
import { PushResult } from './types';
import { getSupabaseTableName } from './constants';

const ALLOWED_COLUMNS: Record<string, Set<string>> = {
  users_table: new Set([
    'id', 'name', 'pan', 'upi_id', 'dp_id', 'client_id', 'sync_version', 'created_at', 'updated_at', 'deleted_at'
  ]),
  bank_accounts: new Set([
    'id', 'user_id', 'upi_id', 'account_number', 'ifsc', 'sync_version', 'created_at', 'updated_at', 'deleted_at'
  ]),
  ipo_listings: new Set([
    'id', 'company_name', 'symbol', 'lot_size', 'listing_date', 'status', 'created_at', 'updated_at'
  ]),
  ipo_applications: new Set([
    'id', 'user_id', 'ipo_id', 'bank_id', 'status', 'sync_version', 'created_at', 'updated_at', 'deleted_at'
  ]),
};

export function transformForRemote(tableName: string, item: any, userId?: string): any {
  if (!item) return item;
  const transformed: any = {};

  if (tableName === 'users_table') {
    if (item.id !== undefined) transformed.id = item.id;
    if (item.name !== undefined) transformed.name = item.name;
    if (item.pan_number !== undefined) transformed.pan = item.pan_number;
    else if (item.pan !== undefined) transformed.pan = item.pan;

    if (item.upi_app !== undefined) transformed.upi_id = item.upi_app;
    else if (item.upi_id !== undefined) transformed.upi_id = item.upi_id;

    if (item.dp_id !== undefined) transformed.dp_id = item.dp_id;
    if (item.client_id !== undefined) transformed.client_id = item.client_id;

    if (item.sync_version !== undefined) transformed.sync_version = item.sync_version;
    if (item.created_at !== undefined) transformed.created_at = item.created_at;
    if (item.updated_at !== undefined) transformed.updated_at = item.updated_at;
    if (item.deleted_at !== undefined) transformed.deleted_at = item.deleted_at;

    if (item.broker !== undefined) {
      console.log(`[transformForRemote] users_table: Local 'broker' ('${item.broker}') has no remote column on 'users'`);
    }
    if (item.tpin !== undefined) {
      console.log(`[transformForRemote] users_table: Local 'tpin' has no remote column on 'users'`);
    }
    if (item.default_amount_blocked !== undefined) {
      console.log(`[transformForRemote] users_table: Local 'default_amount_blocked' has no remote column on 'users'`);
    }
  } else if (tableName === 'bank_accounts') {
    if (item.id !== undefined) transformed.id = item.id;
    if (item.user_id !== undefined) transformed.user_id = item.user_id;
    else if (userId) transformed.user_id = userId;

    if (item.bank_name !== undefined) transformed.account_number = item.bank_name;
    else if (item.account_number !== undefined) transformed.account_number = item.account_number;

    if (item.upi_id !== undefined) transformed.upi_id = item.upi_id;
    if (item.ifsc !== undefined) transformed.ifsc = item.ifsc;

    if (item.sync_version !== undefined) transformed.sync_version = item.sync_version;
    if (item.created_at !== undefined) transformed.created_at = item.created_at;
    if (item.updated_at !== undefined) transformed.updated_at = item.updated_at;
    if (item.deleted_at !== undefined) transformed.deleted_at = item.deleted_at;

    if (item.balance !== undefined) {
      console.log(`[transformForRemote] bank_accounts: Local 'balance' (${item.balance}) has no remote column on 'banks'`);
    }
  } else if (tableName === 'ipo_listings') {
    if (item.id !== undefined) transformed.id = item.id;

    if (item.ipo_name !== undefined) transformed.company_name = item.ipo_name;
    else if (item.company_name !== undefined) transformed.company_name = item.company_name;

    if (item.symbol !== undefined && item.symbol !== null && item.symbol !== '') {
      transformed.symbol = item.symbol;
    }

    if (item.quantity !== undefined) transformed.lot_size = item.quantity;
    else if (item.lot_size !== undefined) transformed.lot_size = item.lot_size;

    if (item.listing_date !== undefined) transformed.listing_date = item.listing_date;
    if (item.status !== undefined) transformed.status = item.status;

    if (item.created_at !== undefined) transformed.created_at = item.created_at;
    if (item.updated_at !== undefined) transformed.updated_at = item.updated_at;

    if (item.buy_price !== undefined) {
      console.log(`[transformForRemote] ipo_listings: Local 'buy_price' (${item.buy_price}) has no remote column on 'ipo_master'`);
    }
  } else if (tableName === 'ipo_applications') {
    if (item.id !== undefined) transformed.id = item.id;
    if (item.user_id !== undefined) transformed.user_id = item.user_id;
    if (item.ipo_id !== undefined) transformed.ipo_id = item.ipo_id;
    if (item.bank_id !== undefined) transformed.bank_id = item.bank_id;
    if (item.status !== undefined) transformed.status = item.status;

    if (item.sync_version !== undefined) transformed.sync_version = item.sync_version;
    if (item.created_at !== undefined) transformed.created_at = item.created_at;
    if (item.updated_at !== undefined) transformed.updated_at = item.updated_at;
    if (item.deleted_at !== undefined) transformed.deleted_at = item.deleted_at;

    if (item.sell_price !== undefined) {
      console.log(`[transformForRemote] ipo_applications: Local 'sell_price' has no remote column on 'applications'`);
    }
    if (item.tax !== undefined) {
      console.log(`[transformForRemote] ipo_applications: Local 'tax' has no remote column on 'applications'`);
    }
    if (item.user_cut !== undefined) {
      console.log(`[transformForRemote] ipo_applications: Local 'user_cut' has no remote column on 'applications'`);
    }
  } else {
    return { ...item };
  }

  return transformed;
}

function sanitizePayload(tableName: string, payload: any): any {
  const allowed = ALLOWED_COLUMNS[tableName];
  if (!allowed) return payload;

  const cleanItem: any = {};
  for (const key of Object.keys(payload)) {
    if (allowed.has(key)) {
      cleanItem[key] = payload[key];
    }
  }
  return cleanItem;
}

export class SyncPush {
  constructor(private db: SQLiteDatabase) {}

  async pushBatchedInserts(tableName: string, payloads: any[], userId?: string): Promise<PushResult> {
    if (payloads.length === 0) return { success: true };

    const remoteTable = getSupabaseTableName(tableName);

    const transformedPayloads = payloads.map((p) => transformForRemote(tableName, p, userId));
    const sanitizedPayloads = transformedPayloads.map((p) => sanitizePayload(tableName, p));

    console.log(`==========`);
    console.log(`TABLE: ${tableName}`);
    console.log(`REMOTE TABLE: ${remoteTable}`);
    console.log(`RAW SQLITE OBJECT:`, JSON.stringify(payloads, null, 2));
    console.log(`↓`);
    console.log(`TRANSFORMED OBJECT:`, JSON.stringify(transformedPayloads, null, 2));
    console.log(`↓`);
    console.log(`FINAL SANITIZED OBJECT:`, JSON.stringify(sanitizedPayloads, null, 2));
    console.log(`↓`);
    console.log(`JSON SENT TO SUPABASE:`, JSON.stringify(sanitizedPayloads, null, 2));
    console.log(`==========`);

    const { data, error } = await supabase.from(remoteTable).upsert(sanitizedPayloads, { onConflict: 'id' }).select();

    console.log(`[Supabase Response] Data:`, JSON.stringify(data, null, 2));

    if (error) {
      console.error(`[Supabase Error] Table '${remoteTable}' UPSERT failed:`);
      console.error(`  error.code: ${error.code}`);
      console.error(`  error.message: ${error.message}`);
      console.error(`  error.details: ${error.details}`);
      console.error(`  error.hint: ${error.hint}`);
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
