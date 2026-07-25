import { SQLiteDatabase } from 'expo-sqlite';

export async function initDB(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('PRAGMA foreign_keys = ON');

  // We are creating a fresh schema for V1 offline-first architecture.
  // Tables use TEXT PRIMARY KEY (UUIDs) and include sync metadata.

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS users_table (
      id TEXT PRIMARY KEY,
      owner_id TEXT, -- Supabase auth user_id
      name TEXT NOT NULL DEFAULT '',
      pan_number TEXT DEFAULT '',
      broker TEXT DEFAULT '',
      tpin TEXT DEFAULT '',
      upi_app TEXT DEFAULT '',
      bank_name TEXT DEFAULT '',
      default_amount_blocked REAL DEFAULT 0,
      sync_version INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ipo_listings (
      id TEXT PRIMARY KEY,
      owner_id TEXT, -- Supabase auth user_id
      ipo_name TEXT NOT NULL DEFAULT '',
      buy_price REAL NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 0,
      open_date TEXT DEFAULT '',
      close_date TEXT DEFAULT '',
      listing_date TEXT DEFAULT '',
      archived INTEGER DEFAULT 0,
      registrar TEXT DEFAULT '',
      exchange TEXT DEFAULT '',
      issue_type TEXT DEFAULT '',
      allotment_date TEXT DEFAULT '',
      is_favorite INTEGER DEFAULT 0,
      sync_version INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ipo_applications (
      id TEXT PRIMARY KEY,
      owner_id TEXT, -- Supabase auth user_id
      user_id TEXT NOT NULL,
      ipo_id TEXT NOT NULL,
      status TEXT DEFAULT 'Applied',
      sell_price REAL,
      sale_date TEXT,
      tax REAL DEFAULT 0,
      user_cut REAL DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      sync_version INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users_table(id) ON DELETE CASCADE,
      FOREIGN KEY (ipo_id) REFERENCES ipo_listings(id) ON DELETE CASCADE
    )
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id TEXT PRIMARY KEY,
      owner_id TEXT, -- Supabase auth user_id
      bank_name TEXT NOT NULL,
      balance REAL DEFAULT 0,
      sync_version INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
      payload TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      next_retry_at TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ipo_master (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL DEFAULT '',
      ipo_name TEXT NOT NULL DEFAULT '',
      symbol TEXT DEFAULT '',
      exchange TEXT DEFAULT '',
      issue_type TEXT DEFAULT '',
      price_band_min REAL,
      price_band_max REAL,
      lot_size INTEGER,
      issue_size REAL,
      listing_date TEXT,
      open_date TEXT,
      close_date TEXT,
      allotment_date TEXT,
      refund_date TEXT,
      demat_credit_date TEXT,
      registrar TEXT DEFAULT '',
      lead_manager TEXT DEFAULT '',
      status TEXT DEFAULT '',
      logo_url TEXT DEFAULT '',
      sector TEXT DEFAULT '',
      description TEXT DEFAULT '',
      website TEXT DEFAULT '',
      prospectus_url TEXT DEFAULT '',
      
      retail_sub REAL,
      qib_sub REAL,
      nii_sub REAL,
      employee_sub REAL,
      shareholder_sub REAL,
      anchor_sub REAL,
      total_sub REAL,
      subscription_timestamp TEXT,
      
      registrar_website TEXT DEFAULT '',
      allotment_link TEXT DEFAULT '',
      
      listing_price REAL,
      listing_gain_percent REAL,
      current_price REAL,
      current_price_updated_at TEXT,
      
      sync_version INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);

  // ── Schema Migrations for Existing Databases ────────────────────────────────
  const migrations = [
    // users_table migrations
    'ALTER TABLE users_table ADD COLUMN owner_id TEXT',
    'ALTER TABLE users_table ADD COLUMN sync_version INTEGER DEFAULT 0',
    'ALTER TABLE users_table ADD COLUMN created_at TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE users_table ADD COLUMN updated_at TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE users_table ADD COLUMN deleted_at TEXT',

    // ipo_listings migrations
    'ALTER TABLE ipo_listings ADD COLUMN owner_id TEXT',
    'ALTER TABLE ipo_listings ADD COLUMN archived INTEGER DEFAULT 0',
    'ALTER TABLE ipo_listings ADD COLUMN registrar TEXT DEFAULT ""',
    'ALTER TABLE ipo_listings ADD COLUMN exchange TEXT DEFAULT ""',
    'ALTER TABLE ipo_listings ADD COLUMN issue_type TEXT DEFAULT ""',
    'ALTER TABLE ipo_listings ADD COLUMN allotment_date TEXT DEFAULT ""',
    'ALTER TABLE ipo_listings ADD COLUMN is_favorite INTEGER DEFAULT 0',
    'ALTER TABLE ipo_listings ADD COLUMN sync_version INTEGER DEFAULT 0',
    'ALTER TABLE ipo_listings ADD COLUMN created_at TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE ipo_listings ADD COLUMN updated_at TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE ipo_listings ADD COLUMN deleted_at TEXT',

    // ipo_applications migrations
    'ALTER TABLE ipo_applications ADD COLUMN owner_id TEXT',
    'ALTER TABLE ipo_applications ADD COLUMN is_favorite INTEGER DEFAULT 0',
    'ALTER TABLE ipo_applications ADD COLUMN sync_version INTEGER DEFAULT 0',
    'ALTER TABLE ipo_applications ADD COLUMN created_at TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE ipo_applications ADD COLUMN updated_at TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE ipo_applications ADD COLUMN deleted_at TEXT',

    // bank_accounts migrations
    'ALTER TABLE bank_accounts ADD COLUMN owner_id TEXT',
    'ALTER TABLE bank_accounts ADD COLUMN sync_version INTEGER DEFAULT 0',
    'ALTER TABLE bank_accounts ADD COLUMN created_at TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE bank_accounts ADD COLUMN updated_at TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE bank_accounts ADD COLUMN deleted_at TEXT',

    // sync_queue migrations
    'ALTER TABLE sync_queue ADD COLUMN retry_count INTEGER DEFAULT 0',
    'ALTER TABLE sync_queue ADD COLUMN next_retry_at TEXT',
  ];

  for (const statement of migrations) {
    try {
      await db.execAsync(statement);
    } catch {
      // Column already exists or table structure is compliant
    }
  }
}
