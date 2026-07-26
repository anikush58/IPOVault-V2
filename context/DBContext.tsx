import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { UserRepository, IPORepository, ApplicationRepository, BankRepository } from '@/db/repositories';
import { syncStore } from '@/services/sync/syncStatus';

// ── Types ────────────────────────────────────────────────────────────────────

export type User = {
  id: string;
  name: string;
  pan_number: string;
  broker: string;
  tpin: string;
  upi_app: string;
  bank_name: string;
  default_amount_blocked: number;
};

export type IPOListing = {
  id: string;
  ipo_name: string;
  buy_price: number;
  quantity: number;
  open_date: string;
  close_date: string;
  listing_date: string;
  archived: number;    // 0 = active, 1 = archived
  is_favorite: number; // 0 = no, 1 = yes
  registrar?: string;
  exchange?: string;
  issue_type?: string;
  allotment_date?: string;
};

export type ApplicationStatus = 'Applied' | 'Allotted' | 'Not Allotted' | 'Sold';

export type ApplicationWithDetails = {
  id: string;
  user_id: string;
  ipo_id: string;
  status: ApplicationStatus;
  sell_price: number | null;
  sale_date: string | null;
  tax: number;
  user_cut: number;
  user_name: string;
  user_broker: string;
  user_bank_name: string;
  user_upi_app: string;
  ipo_name: string;
  buy_price: number;
  quantity: number;
  open_date: string;
  is_favorite: number; // 0 = no, 1 = yes
};

export type BankAccount = {
  id: string;
  bank_name: string;
  balance: number;
};

type ImportResult = { users: number; ipos: number; applications: number };

type DBContextType = {
  users: User[];
  ipos: IPOListing[];
  applications: ApplicationWithDetails[];
  bankAccounts: BankAccount[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  // User CRUD
  addUser: (user: Omit<User, 'id'>) => Promise<void>;
  updateUser: (id: string, user: Omit<User, 'id'>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  // IPO CRUD
  addIPO: (ipo: Omit<IPOListing, 'id' | 'is_favorite' | 'archived'>) => Promise<void>;
  updateIPO: (id: string, ipo: Omit<IPOListing, 'id' | 'is_favorite'>) => Promise<void>;
  archiveIPO: (id: string) => Promise<void>;
  unarchiveIPO: (id: string) => Promise<void>;
  deleteIPO: (id: string) => Promise<void>;
  toggleIPOFavorite: (id: string, isFavorite: boolean) => Promise<void>;
  // Applications
  addBulkApplications: (ipoId: string, userIds: string[], bankName?: string, upiApp?: string) => Promise<void>;
  updateApplication: (
    id: string,
    status: ApplicationStatus,
    sellPrice?: number | null,
    saleDate?: string | null,
    tax?: number,
    userCut?: number,
  ) => Promise<void>;
  deleteApplication: (id: string) => Promise<void>;
  toggleFavorite: (id: string, isFavorite: boolean) => Promise<void>;
  // Bank accounts
  addBankAccount: (bankName: string, balance: number) => Promise<void>;
  updateBankBalance: (id: string, balance: number) => Promise<void>;
  deleteBankAccount: (id: string) => Promise<void>;
  // Data management
  loadSampleData: () => Promise<void>;
  clearAllData: () => Promise<void>;
  exportCSV: () => string;
  importCSV: (csv: string) => Promise<ImportResult>;
  exportJSON: () => string;
  importJSON: (json: string) => Promise<ImportResult>;
  autoExportEnabled: boolean;
  setAutoExportEnabled: (val: boolean) => Promise<void>;
};

// ── CSV helpers ──────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

// ── DB init ──────────────────────────────────────────────────────────────────

import { initDB } from '@/db/schema';

// ── Inner provider (uses useSQLiteContext) ────────────────────────────────────

const DBContext = createContext<DBContextType | null>(null);

function DBProviderInner({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [users, setUsers] = useState<User[]>([]);
  const [ipos, setIPOs] = useState<IPOListing[]>([]);
  const [applications, setApplications] = useState<ApplicationWithDetails[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const userRows = await db.getAllAsync<User>(
      'SELECT * FROM users_table ORDER BY name',
    );
    setUsers(userRows);

    const ipoRows = await db.getAllAsync<IPOListing>(
      'SELECT * FROM ipo_listings ORDER BY id DESC',
    );
    setIPOs(ipoRows);

    const appRows = await db.getAllAsync<ApplicationWithDetails>(`
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
      ORDER  BY a.id DESC
    `);
    setApplications(appRows);

    const bankRows = await db.getAllAsync<BankAccount>(
      'SELECT * FROM bank_accounts ORDER BY bank_name',
    );
    setBankAccounts(bankRows);

    setIsLoading(false);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Automatically refresh UI state when cloud sync pipeline finishes
  useEffect(() => {
    let prevSyncState = syncStore.getStatus().state;
    return syncStore.subscribe((status) => {
      if (prevSyncState === 'Syncing' && status.state === 'Idle') {
        refresh();
      }
      prevSyncState = status.state;
    });
  }, [refresh]);

  // ── User CRUD ──────────────────────────────────────────────────────────────

  const addUser = async (user: Omit<User, 'id'>) => {
    const repo = new UserRepository(db);
    await repo.add(user);
    await refresh();
  };

  const updateUser = async (id: string, user: Omit<User, 'id'>) => {
    const repo = new UserRepository(db);
    await repo.update(id, user);
    await refresh();
  };

  const deleteUser = async (id: string) => {
    const repo = new UserRepository(db);
    await repo.delete(id);
    await refresh();
  };

  // ── IPO CRUD ───────────────────────────────────────────────────────────────

  const addIPO = async (ipo: Omit<IPOListing, 'id' | 'is_favorite' | 'archived'>) => {
    const repo = new IPORepository(db);
    await repo.add(ipo);
    await refresh();
  };

  const updateIPO = async (id: string, ipo: Omit<IPOListing, 'id' | 'is_favorite'>) => {
    const repo = new IPORepository(db);
    await repo.update(id, ipo);
    await refresh();
  };

  const archiveIPO = async (id: string) => {
    const repo = new IPORepository(db);
    await repo.archive(id, true);
    await refresh();
  };

  const unarchiveIPO = async (id: string) => {
    const repo = new IPORepository(db);
    await repo.archive(id, false);
    await refresh();
  };

  const toggleIPOFavorite = async (id: string, isFavorite: boolean) => {
    const repo = new IPORepository(db);
    await repo.toggleFavorite(id, isFavorite);
    await refresh();
  };

  const deleteIPO = async (id: string) => {
    const repo = new IPORepository(db);
    await repo.delete(id);
    await refresh();
  };

  // ── Applications ───────────────────────────────────────────────────────────

  const addBulkApplications = async (ipoId: string, userIds: string[], bankName?: string, upiApp?: string) => {
    const repo = new ApplicationRepository(db);
    await repo.addBulk(ipoId, userIds, bankName, upiApp);
    await refresh();
  };

  const updateApplication = async (
    id: string,
    status: ApplicationStatus,
    sellPrice?: number | null,
    saleDate?: string | null,
    tax?: number,
    userCut?: number,
  ) => {
    const repo = new ApplicationRepository(db);
    await repo.update(id, status, sellPrice, saleDate, tax, userCut);
    await refresh();
  };

  const deleteApplication = async (id: string) => {
    const repo = new ApplicationRepository(db);
    await repo.delete(id);
    await refresh();
  };

  const toggleFavorite = async (id: string, isFavorite: boolean) => {
    await db.runAsync('UPDATE ipo_applications SET is_favorite=? WHERE id=?', [isFavorite ? 1 : 0, id]);
    await refresh();
  };

  // ── Bank accounts ──────────────────────────────────────────────────────────

  const addBankAccount = async (bankName: string, balance: number) => {
    const repo = new BankRepository(db);
    await repo.add(bankName, balance);
    await refresh();
  };

  const updateBankBalance = async (id: string, balance: number) => {
    const repo = new BankRepository(db);
    await repo.updateBalance(id, balance);
    await refresh();
  };

  const deleteBankAccount = async (id: string) => {
    const repo = new BankRepository(db);
    await repo.delete(id);
    await refresh();
  };

  // ── Data management ────────────────────────────────────────────────────────

  const clearAllData = async () => {
    await db.execAsync('DELETE FROM ipo_applications');
    await db.execAsync('DELETE FROM ipo_listings');
    await db.execAsync('DELETE FROM users_table');
    await db.execAsync('DELETE FROM bank_accounts');
    await refresh();
  };

  const loadSampleData = async () => {
    await db.execAsync('DELETE FROM ipo_applications');
    await db.execAsync('DELETE FROM ipo_listings');
    await db.execAsync('DELETE FROM users_table');
    await db.execAsync('DELETE FROM bank_accounts');

    // Users
    await db.runAsync(
      'INSERT INTO users_table (name,pan_number,broker,tpin,upi_app,bank_name,default_amount_blocked) VALUES (?,?,?,?,?,?,?)',
      ['Dhiru', 'AAAPD1234A', 'Dhan', '123456', 'PhonePe', 'Kotak M Bank', 14998],
    );
    await db.runAsync(
      'INSERT INTO users_table (name,pan_number,broker,tpin,upi_app,bank_name,default_amount_blocked) VALUES (?,?,?,?,?,?,?)',
      ['Vishal', 'BBBPV5678B', 'Upstox', '234567', 'GPay', 'Axis Bank', 14998],
    );
    await db.runAsync(
      'INSERT INTO users_table (name,pan_number,broker,tpin,upi_app,bank_name,default_amount_blocked) VALUES (?,?,?,?,?,?,?)',
      ['Umesh', 'CCCU9012C', 'Groww', '345678', 'BHIM', 'HDFC Bank', 14998],
    );

    // Bank accounts with sample balances
    await db.runAsync(
      'INSERT INTO bank_accounts (bank_name, balance) VALUES (?, ?)',
      ['Kotak M Bank', 75000],
    );
    await db.runAsync(
      'INSERT INTO bank_accounts (bank_name, balance) VALUES (?, ?)',
      ['Axis Bank', 50000],
    );
    await db.runAsync(
      'INSERT INTO bank_accounts (bank_name, balance) VALUES (?, ?)',
      ['HDFC Bank', 90000],
    );

    // IPOs
    await db.runAsync(
      'INSERT INTO ipo_listings (ipo_name,buy_price,quantity,open_date,close_date,listing_date) VALUES (?,?,?,?,?,?)',
      ['Advit Jewels', 56, 2000, '2025-11-10', '2025-11-12', '2025-11-15'],
    );
    await db.runAsync(
      'INSERT INTO ipo_listings (ipo_name,buy_price,quantity,open_date,close_date,listing_date) VALUES (?,?,?,?,?,?)',
      ['HDB Financial', 500, 35, '2025-10-28', '2025-10-30', '2025-11-04'],
    );
    await db.runAsync(
      'INSERT INTO ipo_listings (ipo_name,buy_price,quantity,open_date,close_date,listing_date) VALUES (?,?,?,?,?,?)',
      ['Ola Electric', 76, 195, '2025-10-15', '2025-10-17', '2025-10-20'],
    );

    // Get IDs
    const u1 = await db.getFirstAsync<{ id: string }>('SELECT id FROM users_table WHERE name=?', ['Dhiru']);
    const u2 = await db.getFirstAsync<{ id: string }>('SELECT id FROM users_table WHERE name=?', ['Vishal']);
    const u3 = await db.getFirstAsync<{ id: string }>('SELECT id FROM users_table WHERE name=?', ['Umesh']);
    const i1 = await db.getFirstAsync<{ id: string }>('SELECT id FROM ipo_listings WHERE ipo_name=?', ['Advit Jewels']);
    const i2 = await db.getFirstAsync<{ id: string }>('SELECT id FROM ipo_listings WHERE ipo_name=?', ['HDB Financial']);
    const i3 = await db.getFirstAsync<{ id: string }>('SELECT id FROM ipo_listings WHERE ipo_name=?', ['Ola Electric']);

    if (!u1 || !u2 || !u3 || !i1 || !i2 || !i3) return;

    // Applications
    await db.runAsync(
      'INSERT INTO ipo_applications (id, user_id, ipo_id, status, sell_price, sale_date, tax, user_cut, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [Crypto.randomUUID(), u1.id, i1.id, 'Sold', 72, '2025-11-15', 150, 500, new Date().toISOString(), new Date().toISOString()],
    );
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?)', [Crypto.randomUUID(), u2.id, i1.id, 'Allotted', new Date().toISOString(), new Date().toISOString()]);
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?)', [Crypto.randomUUID(), u3.id, i1.id, 'Not Allotted', new Date().toISOString(), new Date().toISOString()]);
    await db.runAsync(
      'INSERT INTO ipo_applications (id, user_id, ipo_id, status, sell_price, sale_date, tax, user_cut, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [Crypto.randomUUID(), u1.id, i2.id, 'Sold', 620, '2025-11-04', 200, 500, new Date().toISOString(), new Date().toISOString()],
    );
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?)', [Crypto.randomUUID(), u2.id, i2.id, 'Applied', new Date().toISOString(), new Date().toISOString()]);
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?)', [Crypto.randomUUID(), u3.id, i2.id, 'Applied', new Date().toISOString(), new Date().toISOString()]);
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?)', [Crypto.randomUUID(), u1.id, i3.id, 'Not Allotted', new Date().toISOString(), new Date().toISOString()]);
    await db.runAsync('INSERT INTO ipo_applications (id, user_id, ipo_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?)', [Crypto.randomUUID(), u2.id, i3.id, 'Applied', new Date().toISOString(), new Date().toISOString()]);

    await refresh();
  };

  // ── JSON export / import ─────────────────────────────────────────────────

  const exportJSON = (): string => {
    return JSON.stringify(
      {
        version: 1,
        exported_at: new Date().toISOString(),
        banks: bankAccounts,
        users,
        ipos,
        applications: applications.map((a) => ({
          id: a.id,
          user_id: a.user_id,
          ipo_id: a.ipo_id,
          status: a.status,
          sell_price: a.sell_price,
          sale_date: a.sale_date,
          tax: a.tax,
          user_cut: a.user_cut,
        })),
      },
      null,
      2,
    );
  };

    const importJSON = async (json: string): Promise<ImportResult> => {
    const data = JSON.parse(json) as {
      version?: number;
      banks?: BankAccount[];
      users?: User[];
      ipos?: IPOListing[];
      applications?: Array<{
        id: string; user_id: string; ipo_id: string; status: ApplicationStatus;
        sell_price: number | null; sale_date: string | null; tax: number; user_cut: number;
      }>;
    };

    let bankImported = 0; let userCount = 0; let ipoCount = 0; let appCount = 0;
    const userIdMap = new Map<string, string>();
    const ipoIdMap = new Map<string, string>();
    const now = new Date().toISOString();

    for (const bank of data.banks ?? []) {
      const existing = await db.getFirstAsync('SELECT id FROM bank_accounts WHERE bank_name=?', [bank.bank_name]);
      if (!existing) {
        await db.runAsync('INSERT INTO bank_accounts (id, bank_name, balance, created_at, updated_at) VALUES (?,?,?,?,?)', [Crypto.randomUUID(), bank.bank_name, bank.balance ?? 0, now, now]);
        bankImported++;
      }
    }

    for (const u of data.users ?? []) {
      const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM users_table WHERE pan_number=?', [u.pan_number]);
      if (existing) {
        userIdMap.set(u.id, existing.id);
      } else {
        const newId = Crypto.randomUUID();
        await db.runAsync(
          'INSERT INTO users_table (id, name,pan_number,broker,tpin,upi_app,bank_name,default_amount_blocked, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [newId, u.name, u.pan_number, u.broker, u.tpin, u.upi_app, u.bank_name, u.default_amount_blocked ?? 0, now, now]
        );
        userIdMap.set(u.id, newId);
        userCount++;
      }
    }

    for (const ipo of data.ipos ?? []) {
      const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM ipo_listings WHERE ipo_name=?', [ipo.ipo_name]);
      if (existing) {
        ipoIdMap.set(ipo.id, existing.id);
      } else {
        const newId = Crypto.randomUUID();
        await db.runAsync(
          'INSERT INTO ipo_listings (id, ipo_name,buy_price,quantity,open_date,close_date,listing_date, archived, is_favorite, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          [newId, ipo.ipo_name, ipo.buy_price, ipo.quantity, ipo.open_date, ipo.close_date, ipo.listing_date, 0, 0, now, now]
        );
        ipoIdMap.set(ipo.id, newId);
        ipoCount++;
      }
    }

    for (const app of data.applications ?? []) {
      const newUserId = userIdMap.get(app.user_id) ?? app.user_id;
      const newIpoId = ipoIdMap.get(app.ipo_id) ?? app.ipo_id;
      const dup = await db.getFirstAsync('SELECT id FROM ipo_applications WHERE user_id=? AND ipo_id=?', [newUserId, newIpoId]);
      if (!dup) {
        await db.runAsync(
          'INSERT INTO ipo_applications (id, user_id, ipo_id, status, sell_price, sale_date, tax, user_cut, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [Crypto.randomUUID(), newUserId, newIpoId, app.status, app.sell_price, app.sale_date, app.tax, app.user_cut, now, now]
        );
        appCount++;
      }
    }

    await refresh();
    return { users: userCount, ipos: ipoCount, applications: appCount };
  };

  const exportCSV = (): string => {
    const userMap = new Map(users.map((u) => [u.id, u]));
    const ipoMap = new Map(ipos.map((i) => [i.id, i]));
    let csv = 'ID,User,PAN,TPIN,Broker,UPI App,Bank,IPO Name,Buy Price,Qty,IPO Open,IPO Close,IPO Listing,Status,Sell Price,Sale Date,Tax,User Cut\n';
    for (const app of applications) {
      const u = userMap.get(app.user_id);
      const ipo = ipoMap.get(app.ipo_id);
      csv += [
        app.id,
        `"${app.user_name}"`,
        `"${u?.pan_number ?? ''}"`,
        `"${u?.tpin ?? ''}"`,
        `"${app.user_broker}"`,
        `"${u?.upi_app ?? ''}"`,
        `"${app.user_bank_name}"`,
        `"${app.ipo_name}"`,
        app.buy_price,
        app.quantity,
        `"${ipo?.open_date ?? ''}"`,
        `"${ipo?.close_date ?? ''}"`,
        `"${ipo?.listing_date ?? ''}"`,
        `"${app.status}"`,
        app.sell_price ?? '',
        `"${app.sale_date ?? ''}"`,
        app.tax ?? 0,
        app.user_cut ?? 0,
      ].join(',') + '\n';
    }
    return csv;
  };

  const importCSV = async (csv: string): Promise<ImportResult> => {
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error('No data rows found');
    const rows = lines.slice(1).map(parseCSVLine);

    // Collect unique entities
    const userMap = new Map<string, Omit<User, 'id'>>();   // PAN → user data
    const ipoMap  = new Map<string, Omit<IPOListing, 'id'>>();  // name → ipo data
    const bankSet = new Set<string>();

    type PendingApp = {
      pan: string; ipoName: string; status: ApplicationStatus;
      sellPrice: number | null; saleDate: string | null; tax: number; userCut: number;
    };
    const pendingApps: PendingApp[] = [];

    for (const row of rows) {
      if (row.length < 18) continue;
      const [, name, pan, tpin, broker, upiApp, bank, ipoName,
             buyPriceStr, qtyStr, ipoOpen, ipoClose, ipoListing,
             status, sellPriceStr, saleDate, taxStr, userCutStr] = row.map((c) => c.trim());
      if (!pan || !name) continue;

      if (!userMap.has(pan)) {
        userMap.set(pan, {
          name, pan_number: pan, tpin, broker,
          upi_app: upiApp, bank_name: bank, default_amount_blocked: 0,
        });
      }
      if (bank) bankSet.add(bank);
      if (ipoName && !ipoMap.has(ipoName)) {
        ipoMap.set(ipoName, {
          ipo_name: ipoName,
          buy_price: parseFloat(buyPriceStr) || 0,
          quantity: parseInt(qtyStr) || 0,
          open_date: ipoOpen, close_date: ipoClose, listing_date: ipoListing,
          archived: 0,
          is_favorite: 0,
        });
      }
      pendingApps.push({
        pan, ipoName,
        status: status as ApplicationStatus,
        sellPrice: sellPriceStr ? parseFloat(sellPriceStr) : null,
        saleDate: saleDate || null,
        tax: parseFloat(taxStr) || 0,
        userCut: parseFloat(userCutStr) || 0,
      });
    }

    // Insert / upsert users
    const panToId = new Map<string, string>();
    for (const [pan, u] of userMap) {
      const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM users_table WHERE pan_number=?', [pan]);
      if (existing) {
        panToId.set(pan, existing.id);
      } else {
        const newId = Crypto.randomUUID();
        const now = new Date().toISOString();
        await db.runAsync(
          'INSERT INTO users_table (id, name,pan_number,broker,tpin,upi_app,bank_name,default_amount_blocked, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [newId, u.name, pan, u.broker, u.tpin, u.upi_app, u.bank_name, 0, now, now],
        );
        panToId.set(pan, newId);
      }
    }

    // Insert banks (balance = 0 if new)
    const now = new Date().toISOString();
    for (const bankName of bankSet) {
      const existing = await db.getFirstAsync('SELECT id FROM bank_accounts WHERE bank_name=?', [bankName]);
      if (!existing) {
        await db.runAsync(
          'INSERT INTO bank_accounts (id, bank_name, balance, created_at, updated_at) VALUES (?,?,?,?,?)',
          [Crypto.randomUUID(), bankName, 0, now, now]
        );
      }
    }

    // Insert / upsert IPOs
    const ipoNameToId = new Map<string, string>();
    for (const [name, ipo] of ipoMap) {
      const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM ipo_listings WHERE ipo_name=?', [name]);
      if (existing) {
        ipoNameToId.set(name, existing.id);
      } else {
        const newId = Crypto.randomUUID();
        await db.runAsync(
          'INSERT INTO ipo_listings (id, ipo_name,buy_price,quantity,open_date,close_date,listing_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
          [newId, ipo.ipo_name, ipo.buy_price, ipo.quantity, ipo.open_date, ipo.close_date, ipo.listing_date, now, now],
        );
        ipoNameToId.set(name, newId);
      }
    }

    // Insert applications (skip duplicates)
    let appCount = 0;
    for (const app of pendingApps) {
      const userId = panToId.get(app.pan);
      const ipoId  = ipoNameToId.get(app.ipoName);
      if (!userId || !ipoId) continue;
      const dup = await db.getFirstAsync('SELECT id FROM ipo_applications WHERE user_id=? AND ipo_id=?', [userId, ipoId]);
      if (!dup) {
        await db.runAsync(
          'INSERT INTO ipo_applications (id, user_id, ipo_id, status, sell_price, sale_date, tax, user_cut, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [Crypto.randomUUID(), userId, ipoId, app.status, app.sellPrice, app.saleDate, app.tax, app.userCut, now, now],
        );
        appCount++;
      }
    }

    await refresh();
    return { users: userMap.size, ipos: ipoMap.size, applications: appCount };
  };

  const [autoExportEnabled, setAutoExportEnabledState] = useState(true);

  // Load auto export toggle from storage
  useEffect(() => {
    AsyncStorage.getItem('auto_export_enabled').then((val) => {
      if (val !== null) {
        setAutoExportEnabledState(val === 'true');
      }
    });
  }, []);

  const setAutoExportEnabled = async (val: boolean) => {
    setAutoExportEnabledState(val);
    await AsyncStorage.setItem('auto_export_enabled', val ? 'true' : 'false');
  };

  // Run auto-export check
  useEffect(() => {
    if (isLoading) return;
    if (!autoExportEnabled) return;
    // Don't auto-export if there is no data
    if (users.length === 0 && ipos.length === 0 && applications.length === 0 && bankAccounts.length === 0) return;

    const runAutoExport = async () => {
      try {
        const lastExportDate = await AsyncStorage.getItem('last_auto_export_date');
        const now = new Date();
        const targetDate = new Date(now);
        if (now.getHours() < 3) {
          targetDate.setDate(targetDate.getDate() - 1);
        }
        const targetDateString = targetDate.toISOString().slice(0, 10);

        if (lastExportDate !== targetDateString) {
          // Perform export
          const backup = exportJSON();
          const autoBackupDir = `${FileSystem.documentDirectory}backups/`;
          const dirInfo = await FileSystem.getInfoAsync(autoBackupDir);
          if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(autoBackupDir, { intermediates: true });
          }
          const fileUri = `${autoBackupDir}ipovault_auto_backup_${targetDateString}.json`;
          await FileSystem.writeAsStringAsync(fileUri, backup, { encoding: FileSystem.EncodingType.UTF8 });

          // Prune old backups (keep last 7)
          const files = await FileSystem.readDirectoryAsync(autoBackupDir);
          const backupFiles = files.filter((f) => f.startsWith('ipovault_auto_backup_') && f.endsWith('.json')).sort();
          if (backupFiles.length > 7) {
            for (let i = 0; i < backupFiles.length - 7; i++) {
              await FileSystem.deleteAsync(`${autoBackupDir}${backupFiles[i]}`, { idempotent: true });
            }
          }

          await AsyncStorage.setItem('last_auto_export_date', targetDateString);
          console.log('[IPOVault] Auto-backup completed for date:', targetDateString);
        }
      } catch (err) {
        console.error('[IPOVault] Auto-backup failed:', err);
      }
    };

    runAutoExport();
  }, [isLoading, autoExportEnabled, users, ipos, applications, bankAccounts, exportJSON]);

  return (
    <DBContext.Provider
      value={{
        users,
        ipos,
        applications,
        bankAccounts,
        isLoading,
        refresh,
        addUser,
        updateUser,
        deleteUser,
        addIPO,
        updateIPO,
        archiveIPO,
        unarchiveIPO,
        toggleIPOFavorite,
        deleteIPO,
        addBulkApplications,
        updateApplication,
        deleteApplication,
        toggleFavorite,
        addBankAccount,
        updateBankBalance,
        deleteBankAccount,
        loadSampleData,
        clearAllData,
        exportCSV,
        importCSV,
        exportJSON,
        importJSON,
        autoExportEnabled,
        setAutoExportEnabled,
      }}
    >
      {children}
    </DBContext.Provider>
  );
}

// ── Public provider & hook ────────────────────────────────────────────────────

export function DBProvider({ children }: { children: React.ReactNode }) {
  return (
    <SQLiteProvider databaseName="ipo_tracker.db" onInit={initDB}>
      <DBProviderInner>{children}</DBProviderInner>
    </SQLiteProvider>
  );
}

export function useDB(): DBContextType {
  const ctx = useContext(DBContext);
  if (!ctx) throw new Error('useDB must be used within DBProvider');
  return ctx;
}
