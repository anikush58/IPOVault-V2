export const SUPABASE_TABLE_MAP: Record<string, string> = {
  users_table: 'users',
  bank_accounts: 'banks',
  ipo_listings: 'ipo_master',
  ipo_applications: 'applications',
};

export function getSupabaseTableName(localTableName: string): string {
  return SUPABASE_TABLE_MAP[localTableName] || localTableName;
}
