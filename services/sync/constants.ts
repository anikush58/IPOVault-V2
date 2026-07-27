export interface TableConfig {
  local: string;
  remote: string;
  writable: boolean;
  supportsProfileId: boolean;
  columns: string[];
}

export const TABLES: Record<string, TableConfig> = {
  users: {
    local: 'users_table',
    remote: 'users',
    writable: true,
    supportsProfileId: true,
    columns: [
      'id',
      'profile_id',
      'name',
      'pan',
      'email',
      'phone',
      'dp_id',
      'client_id',
      'upi_id',
      'notes',
      'sync_version',
      'last_synced_at',
      'created_at',
      'updated_at',
      'deleted_at',
    ],
  },
  banks: {
    local: 'bank_accounts',
    remote: 'banks',
    writable: true,
    supportsProfileId: true,
    columns: [
      'id',
      'profile_id',
      'user_id',
      'bank_master_id',
      'account_holder',
      'account_number',
      'ifsc',
      'branch',
      'upi_id',
      'is_default',
      'sync_version',
      'last_synced_at',
      'created_at',
      'updated_at',
      'deleted_at',
    ],
  },
  applications: {
    local: 'ipo_applications',
    remote: 'applications',
    writable: true,
    supportsProfileId: true,
    columns: [
      'id',
      'profile_id',
      'ipo_id',
      'user_id',
      'bank_id',
      'application_number',
      'lots',
      'shares',
      'investment',
      'status',
      'payment_status',
      'upi_reference',
      'mandate_date',
      'allotted_lots',
      'refund_date',
      'listing_gain',
      'listing_return',
      'remarks',
      'sync_version',
      'last_synced_at',
      'created_at',
      'updated_at',
      'deleted_at',
    ],
  },
  ipo_master: {
    local: 'ipo_master',
    remote: 'ipo_master',
    writable: false, // Pull-only master reference data
    supportsProfileId: false,
    columns: [
      'id',
      'company_name',
      'symbol',
      'registrar',
      'exchange',
      'sector',
      'issue_open',
      'issue_close',
      'listing_date',
      'price_low',
      'price_high',
      'lot_size',
      'issue_size',
      'status',
      'gmp',
      'subscription_json',
      'created_at',
      'updated_at',
    ],
  },
};

export const SUPABASE_TABLE_MAP: Record<string, string> = {
  users_table: 'users',
  bank_accounts: 'banks',
  ipo_applications: 'applications',
  ipo_master: 'ipo_master',
};

export function getSupabaseTableName(localTableName: string): string | null {
  return SUPABASE_TABLE_MAP[localTableName] || null;
}

export function isWritableTable(tableName: string): boolean {
  const tableConfig = Object.values(TABLES).find(
    (t) => t.local === tableName || t.remote === tableName
  );
  return tableConfig ? tableConfig.writable : false;
}
