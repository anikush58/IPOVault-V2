import { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

export async function logSyncEvent(
  db: SQLiteDatabase,
  tableName: string,
  recordId: string,
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: any
) {
  const syncId = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO sync_queue (id, table_name, record_id, action, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [syncId, tableName, recordId, action, JSON.stringify(payload), now]
  );
}
