import { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type { User, IPOListing, ApplicationWithDetails, BankAccount, ApplicationStatus } from '@/context/DBContext';

function getCurrentTime() {
  return new Date().toISOString();
}

async function logSyncEvent(
  db: SQLiteDatabase,
  tableName: string,
  recordId: string,
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: any
) {
  const syncId = Crypto.randomUUID();
  await db.runAsync(
    'INSERT INTO sync_queue (id, table_name, record_id, action, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [syncId, tableName, recordId, action, JSON.stringify(payload), getCurrentTime()]
  );
}

export class UserRepository {
  constructor(private db: SQLiteDatabase) {}

  async getAll(): Promise<User[]> {
    return await this.db.getAllAsync<User>('SELECT * FROM users_table WHERE deleted_at IS NULL ORDER BY name');
  }

  async add(user: Omit<User, 'id'>): Promise<void> {
    const id = Crypto.randomUUID();
    const now = getCurrentTime();
    const payload = { ...user, id, created_at: now, updated_at: now };
    
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'INSERT INTO users_table (id, name, pan_number, broker, tpin, upi_app, bank_name, default_amount_blocked, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [id, user.name, user.pan_number, user.broker, user.tpin, user.upi_app, user.bank_name, user.default_amount_blocked, now, now]
      );
      await logSyncEvent(this.db, 'users_table', id, 'INSERT', payload);
    });
  }

  async update(id: string, user: Omit<User, 'id'>): Promise<void> {
    const now = getCurrentTime();
    const payload = { ...user, id, updated_at: now };
    
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'UPDATE users_table SET name=?, pan_number=?, broker=?, tpin=?, upi_app=?, bank_name=?, default_amount_blocked=?, updated_at=?, sync_version = sync_version + 1 WHERE id=?',
        [user.name, user.pan_number, user.broker, user.tpin, user.upi_app, user.bank_name, user.default_amount_blocked, now, id]
      );
      await logSyncEvent(this.db, 'users_table', id, 'UPDATE', payload);
    });
  }

  async delete(id: string): Promise<void> {
    const now = getCurrentTime();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('UPDATE users_table SET deleted_at=?, updated_at=?, sync_version = sync_version + 1 WHERE id=?', [now, now, id]);
      await logSyncEvent(this.db, 'users_table', id, 'DELETE', { id, deleted_at: now });
    });
  }
}

export class IPORepository {
  constructor(private db: SQLiteDatabase) {}

  async getAll(): Promise<IPOListing[]> {
    return await this.db.getAllAsync<IPOListing>('SELECT * FROM ipo_listings WHERE deleted_at IS NULL ORDER BY created_at DESC');
  }

  async add(ipo: Omit<IPOListing, 'id' | 'is_favorite' | 'archived'>): Promise<void> {
    const id = Crypto.randomUUID();
    const now = getCurrentTime();
    const payload = { ...ipo, id, archived: 0, is_favorite: 0, created_at: now, updated_at: now };

    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'INSERT INTO ipo_listings (id, ipo_name, buy_price, quantity, open_date, close_date, listing_date, registrar, exchange, issue_type, allotment_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          id, ipo.ipo_name, ipo.buy_price, ipo.quantity, ipo.open_date, ipo.close_date, ipo.listing_date,
          ipo.registrar ?? '', ipo.exchange ?? '', ipo.issue_type ?? '', ipo.allotment_date ?? '', now, now
        ]
      );
      await logSyncEvent(this.db, 'ipo_listings', id, 'INSERT', payload);
    });
  }

  async update(id: string, ipo: Omit<IPOListing, 'id' | 'is_favorite'>): Promise<void> {
    const now = getCurrentTime();
    const payload = { ...ipo, id, updated_at: now };

    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'UPDATE ipo_listings SET ipo_name=?, buy_price=?, quantity=?, open_date=?, close_date=?, listing_date=?, registrar=?, exchange=?, issue_type=?, allotment_date=?, updated_at=?, sync_version = sync_version + 1 WHERE id=?',
        [
          ipo.ipo_name, ipo.buy_price, ipo.quantity, ipo.open_date, ipo.close_date, ipo.listing_date,
          ipo.registrar ?? '', ipo.exchange ?? '', ipo.issue_type ?? '', ipo.allotment_date ?? '', now, id
        ]
      );
      await logSyncEvent(this.db, 'ipo_listings', id, 'UPDATE', payload);
    });
  }

  async archive(id: string, isArchived: boolean): Promise<void> {
    const now = getCurrentTime();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('UPDATE ipo_listings SET archived=?, updated_at=?, sync_version = sync_version + 1 WHERE id=?', [isArchived ? 1 : 0, now, id]);
      await logSyncEvent(this.db, 'ipo_listings', id, 'UPDATE', { id, archived: isArchived ? 1 : 0, updated_at: now });
    });
  }

  async toggleFavorite(id: string, isFavorite: boolean): Promise<void> {
    const now = getCurrentTime();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('UPDATE ipo_listings SET is_favorite=?, updated_at=?, sync_version = sync_version + 1 WHERE id=?', [isFavorite ? 1 : 0, now, id]);
      await logSyncEvent(this.db, 'ipo_listings', id, 'UPDATE', { id, is_favorite: isFavorite ? 1 : 0, updated_at: now });
    });
  }

  async delete(id: string): Promise<void> {
    const now = getCurrentTime();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('UPDATE ipo_listings SET deleted_at=?, updated_at=?, sync_version = sync_version + 1 WHERE id=?', [now, now, id]);
      await logSyncEvent(this.db, 'ipo_listings', id, 'DELETE', { id, deleted_at: now });
    });
  }
}

export class ApplicationRepository {
  constructor(private db: SQLiteDatabase) {}

  async getAll(): Promise<ApplicationWithDetails[]> {
    return await this.db.getAllAsync<ApplicationWithDetails>(`
      SELECT a.id, a.user_id, a.ipo_id, a.status, a.sell_price, a.sale_date, a.tax, a.user_cut,
             a.is_favorite,
             u.name    AS user_name,
             u.broker  AS user_broker,
             u.bank_name AS user_bank_name,
             u.upi_app   AS user_upi_app,
             i.ipo_name, i.buy_price, i.quantity, i.open_date
      FROM   ipo_applications a
      JOIN   users_table u ON a.user_id = u.id
      JOIN   ipo_listings i ON a.ipo_id = i.id
      WHERE  a.deleted_at IS NULL AND u.deleted_at IS NULL AND i.deleted_at IS NULL
      ORDER  BY a.created_at DESC
    `);
  }

  async addBulk(ipoId: string, userIds: string[], bankName?: string, upiApp?: string): Promise<void> {
    const now = getCurrentTime();
    await this.db.withTransactionAsync(async () => {
      const existing = await this.db.getAllAsync<{ user_id: string }>(
        'SELECT user_id FROM ipo_applications WHERE ipo_id=? AND deleted_at IS NULL',
        [ipoId]
      );
      const existingSet = new Set(existing.map((e) => e.user_id));
      
      for (const uid of userIds) {
        if (bankName || upiApp) {
          const updates: string[] = [];
          const params: any[] = [];
          if (bankName) { updates.push('bank_name=?'); params.push(bankName); }
          if (upiApp) { updates.push('upi_app=?'); params.push(upiApp); }
          updates.push('updated_at=?'); params.push(now);
          updates.push('sync_version = sync_version + 1');
          params.push(uid);

          await this.db.runAsync(`UPDATE users_table SET ${updates.join(', ')} WHERE id=?`, params);
          await logSyncEvent(this.db, 'users_table', uid, 'UPDATE', { id: uid, bank_name: bankName, upi_app: upiApp, updated_at: now });
        }
        if (!existingSet.has(uid)) {
          const id = Crypto.randomUUID();
          const payload = { id, user_id: uid, ipo_id: ipoId, status: 'Applied', tax: 0, user_cut: 0, created_at: now, updated_at: now };
          
          await this.db.runAsync(
            'INSERT INTO ipo_applications (id, user_id, ipo_id, status, tax, user_cut, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
            [id, uid, ipoId, 'Applied', 0, 0, now, now]
          );
          await logSyncEvent(this.db, 'ipo_applications', id, 'INSERT', payload);
        }
      }
    });
  }

  async update(
    id: string,
    status: ApplicationStatus,
    sellPrice?: number | null,
    saleDate?: string | null,
    tax?: number,
    userCut?: number,
  ): Promise<void> {
    const now = getCurrentTime();
    const payload = { id, status, sell_price: sellPrice ?? null, sale_date: saleDate ?? null, tax: tax ?? 0, user_cut: userCut ?? 0, updated_at: now };

    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'UPDATE ipo_applications SET status=?, sell_price=?, sale_date=?, tax=?, user_cut=?, updated_at=?, sync_version = sync_version + 1 WHERE id=?',
        [status, sellPrice ?? null, saleDate ?? null, tax ?? 0, userCut ?? 0, now, id]
      );
      await logSyncEvent(this.db, 'ipo_applications', id, 'UPDATE', payload);
    });
  }

  async toggleFavorite(id: string, isFavorite: boolean): Promise<void> {
    const now = getCurrentTime();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('UPDATE ipo_applications SET is_favorite=?, updated_at=?, sync_version = sync_version + 1 WHERE id=?', [isFavorite ? 1 : 0, now, id]);
      await logSyncEvent(this.db, 'ipo_applications', id, 'UPDATE', { id, is_favorite: isFavorite ? 1 : 0, updated_at: now });
    });
  }

  async delete(id: string): Promise<void> {
    const now = getCurrentTime();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('UPDATE ipo_applications SET deleted_at=?, updated_at=?, sync_version = sync_version + 1 WHERE id=?', [now, now, id]);
      await logSyncEvent(this.db, 'ipo_applications', id, 'DELETE', { id, deleted_at: now });
    });
  }
}

export class BankRepository {
  constructor(private db: SQLiteDatabase) {}

  async getAll(): Promise<BankAccount[]> {
    return await this.db.getAllAsync<BankAccount>('SELECT * FROM bank_accounts WHERE deleted_at IS NULL ORDER BY bank_name');
  }

  async add(bankName: string, balance: number): Promise<void> {
    const id = Crypto.randomUUID();
    const now = getCurrentTime();
    const payload = { id, bank_name: bankName.trim(), balance, created_at: now, updated_at: now };

    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'INSERT INTO bank_accounts (id, bank_name, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id, bankName.trim(), balance, now, now]
      );
      await logSyncEvent(this.db, 'bank_accounts', id, 'INSERT', payload);
    });
  }

  async updateBalance(id: string, balance: number): Promise<void> {
    const now = getCurrentTime();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('UPDATE bank_accounts SET balance=?, updated_at=?, sync_version = sync_version + 1 WHERE id=?', [balance, now, id]);
      await logSyncEvent(this.db, 'bank_accounts', id, 'UPDATE', { id, balance, updated_at: now });
    });
  }

  async delete(id: string): Promise<void> {
    const now = getCurrentTime();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('UPDATE bank_accounts SET deleted_at=?, updated_at=?, sync_version = sync_version + 1 WHERE id=?', [now, now, id]);
      await logSyncEvent(this.db, 'bank_accounts', id, 'DELETE', { id, deleted_at: now });
    });
  }
}
