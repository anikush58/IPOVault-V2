import { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '@/sync/supabase';
import { PushResult } from './types';
import { getSupabaseTableName, isWritableTable } from './constants';
import { transformForRemote } from './transform';

export { transformForRemote };

function decodeJwtSub(token: string): string {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return 'INVALID_JWT_FORMAT';
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = '';
    for (let i = 0; i < base64.length;) {
      const enc1 = chars.indexOf(base64.charAt(i++));
      const enc2 = chars.indexOf(base64.charAt(i++));
      const enc3 = chars.indexOf(base64.charAt(i++));
      const enc4 = chars.indexOf(base64.charAt(i++));
      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;
      str += String.fromCharCode(chr1);
      if (enc3 !== 64 && chr2 !== 0) str += String.fromCharCode(chr2);
      if (enc4 !== 64 && chr3 !== 0) str += String.fromCharCode(chr3);
    }
    const json = JSON.parse(decodeURIComponent(escape(str)));
    return json.sub || 'NO_SUB_FIELD';
  } catch (e: any) {
    return `DECODE_ERROR (${e?.message})`;
  }
}

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

async function logAuthDetailsBeforeUpsert(remoteTable: string, payloads: any[]) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const { data: userData } = await supabase.auth.getUser();

    const session = sessionData?.session;
    const user = userData?.user;

    console.log(`\n=================== [UPSERT AUTH LOG] ===================`);
    console.log(`Remote Table: '${remoteTable}'`);
    console.log(`- session exists?: ${!!session}`);
    console.log(`- access token exists?: ${!!session?.access_token}`);
    console.log(`- authenticated user id (getUser): ${user?.id ?? 'NONE'}`);
    console.log(`- authenticated user id (getSession): ${session?.user?.id ?? 'NONE'}`);
    console.log(`- expires_at: ${session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'NONE'}`);

    let jwtSub = 'NONE';
    if (session?.access_token) {
      jwtSub = decodeJwtSub(session.access_token);
    }
    console.log(`- JWT subject (user id): ${jwtSub}`);

    payloads.forEach((payload, idx) => {
      const payloadProfileId = payload.profile_id ?? 'NOT_PRESENT';
      const match = jwtSub !== 'NONE' && payloadProfileId !== 'NOT_PRESENT' ? (jwtSub === payloadProfileId ? 'MATCH' : 'MISMATCH') : 'N/A';
      console.log(`- Payload [${idx}] profile_id: '${payloadProfileId}' | JWT sub: '${jwtSub}' | Comparison: ${match}`);
    });
    console.log(`=========================================================\n`);
  } catch (err) {
    console.error('[UPSERT Auth Log Error]', err);
  }
}

export class SyncPush {
  constructor(private db: SQLiteDatabase) {}

  async pushBatchedInserts(tableName: string, payloads: any[], userId?: string): Promise<PushResult> {
    if (payloads.length === 0) return { success: true };

    const remoteTable = getSupabaseTableName(tableName);
    if (!remoteTable || !isWritableTable(tableName)) {
      console.log(`[Push] Skipping push for non-writable/unmapped table '${tableName}'`);
      return { success: true };
    }

    const transformedPayloads = payloads.map((p) => transformForRemote(tableName, p, userId));

    await logAuthDetailsBeforeUpsert(remoteTable, transformedPayloads);

    const { data, error } = await supabase.from(remoteTable).upsert(transformedPayloads, { onConflict: 'id' }).select();

    logSupabaseOperation(remoteTable, 'UPSERT', transformedPayloads, data, error);

    if (error) {
      return { success: false, retryable: true };
    }
    return { success: true };
  }

  async pushBatchedDeletes(tableName: string, ids: string[]): Promise<PushResult> {
    if (ids.length === 0) return { success: true };
    const remoteTable = getSupabaseTableName(tableName);
    if (!remoteTable || !isWritableTable(tableName)) {
      console.log(`[Push] Skipping DELETE push for non-writable/unmapped table '${tableName}'`);
      return { success: true };
    }

    const { data, error } = await supabase.from(remoteTable).delete().in('id', ids).select();

    logSupabaseOperation(remoteTable, 'DELETE', { ids }, data, error);

    if (error) {
      return { success: false, retryable: true };
    }
    return { success: true };
  }

  async pushQueueItem(tableName: string, action: string, payload: any, userId?: string): Promise<PushResult> {
    const remoteTable = getSupabaseTableName(tableName);
    if (!remoteTable || !isWritableTable(tableName)) {
      console.log(`[Push] Skipping push item for non-writable/unmapped table '${tableName}'`);
      return { success: true };
    }

    if (action === 'INSERT') {
      const item = transformForRemote(tableName, payload, userId);
      await logAuthDetailsBeforeUpsert(remoteTable, [item]);

      const { data, error } = await supabase.from(remoteTable).upsert(item, { onConflict: 'id' }).select();

      logSupabaseOperation(remoteTable, 'UPSERT', item, data, error);

      if (error) {
        return { success: false, retryable: true };
      }
      return { success: true };
    } 

    if (action === 'DELETE') {
      const { data, error } = await supabase.from(remoteTable).delete().eq('id', payload.id).select();

      logSupabaseOperation(remoteTable, 'DELETE', { id: payload.id }, data, error);

      if (error) {
        return { success: false, retryable: true };
      }
      return { success: true };
    }

    if (action === 'UPDATE') {
      const expectedVersion = payload.sync_version || 0;
      const nextVersion = expectedVersion + 1;
      const nextUpdatedAt = new Date().toISOString();

      const updatePayload: any = transformForRemote(tableName, {
        ...payload,
        sync_version: nextVersion,
        updated_at: nextUpdatedAt
      }, userId);

      const { data, error } = await supabase
        .from(remoteTable)
        .update(updatePayload)
        .eq('id', payload.id)
        .eq('sync_version', expectedVersion)
        .select()
        .maybeSingle();

      logSupabaseOperation(remoteTable, 'UPDATE', updatePayload, data, error);

      if (error) {
        return { success: false, retryable: true };
      }

      if (!data) {
        console.warn(`[Conflict] Sync conflict on ${remoteTable} for id ${payload.id}. Version mismatch.`);
        const { data: remoteRow, error: remoteError } = await supabase.from(remoteTable).select('*').eq('id', payload.id).maybeSingle();
        logSupabaseOperation(remoteTable, 'SELECT', { id: payload.id }, remoteRow, remoteError);
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
