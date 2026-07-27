import { TABLES } from './constants';

function filterAllowedFields(payload: Record<string, any>, allowedColumns: string[]): Record<string, any> {
  const allowedSet = new Set(allowedColumns);
  const result: Record<string, any> = {};
  for (const key of Object.keys(payload)) {
    if (allowedSet.has(key) && payload[key] !== undefined) {
      result[key] = payload[key];
    }
  }
  return result;
}

/**
 * Payload builder for `users` remote table.
 * Mapped against verified production schema:
 * [id, profile_id, name, pan, email, phone, dp_id, client_id, upi_id, notes, sync_version, last_synced_at, created_at, updated_at, deleted_at]
 *
 * Note on local columns without direct remote matches:
 * TODO: Local 'broker' has no matching remote column on 'users'
 * TODO: Local 'tpin' has no matching remote column on 'users'
 * TODO: Local 'bank_name' has no matching remote column on 'users'
 * TODO: Local 'default_amount_blocked' has no matching remote column on 'users'
 */
export function buildUsersPayload(item: any, userId?: string): Record<string, any> {
  if (!item) return {};

  const profileId = item.profile_id ?? userId;
  const rawPayload: Record<string, any> = {
    id: item.id,
    profile_id: profileId,
    name: item.name,
    pan: item.pan_number !== undefined ? item.pan_number : item.pan,
    email: item.email,
    phone: item.phone,
    dp_id: item.dp_id,
    client_id: item.client_id,
    upi_id: item.upi_app !== undefined ? item.upi_app : item.upi_id,
    notes: item.notes,
    sync_version: item.sync_version,
    last_synced_at: item.last_synced_at,
    created_at: item.created_at,
    updated_at: item.updated_at,
    deleted_at: item.deleted_at,
  };

  return filterAllowedFields(rawPayload, TABLES.users.columns);
}

/**
 * Payload builder for `banks` remote table.
 * Mapped against verified production schema:
 * [id, profile_id, user_id, bank_master_id, account_holder, account_number, ifsc, branch, upi_id, is_default, sync_version, last_synced_at, created_at, updated_at, deleted_at]
 *
 * Note on local columns without direct remote matches:
 * TODO: Local 'bank_name' is not mapped to 'account_number' (field names and semantic meanings differ).
 * TODO: Local 'balance' has no matching remote column on 'banks'.
 */
export function buildBanksPayload(item: any, userId?: string): Record<string, any> {
  if (!item) return {};

  const profileId = item.profile_id ?? userId;
  const rawPayload: Record<string, any> = {
    id: item.id,
    profile_id: profileId,
    user_id: item.user_id,
    bank_master_id: item.bank_master_id,
    account_holder: item.account_holder,
    account_number: item.account_number,
    ifsc: item.ifsc,
    branch: item.branch,
    upi_id: item.upi_id,
    is_default: item.is_default,
    sync_version: item.sync_version,
    last_synced_at: item.last_synced_at,
    created_at: item.created_at,
    updated_at: item.updated_at,
    deleted_at: item.deleted_at,
  };

  return filterAllowedFields(rawPayload, TABLES.banks.columns);
}

/**
 * Payload builder for `applications` remote table.
 * Mapped against verified production schema:
 * [id, profile_id, ipo_id, user_id, bank_id, application_number, lots, shares, investment, status, payment_status, upi_reference, mandate_date, allotted_lots, refund_date, listing_gain, listing_return, remarks, sync_version, last_synced_at, created_at, updated_at, deleted_at]
 *
 * Note on local columns without direct remote matches:
 * TODO: Local 'sell_price' has no matching remote column on 'applications'
 * TODO: Local 'sale_date' has no matching remote column on 'applications'
 * TODO: Local 'tax' has no matching remote column on 'applications'
 * TODO: Local 'user_cut' has no matching remote column on 'applications'
 * TODO: Local 'is_favorite' has no matching remote column on 'applications'
 */
export function buildApplicationsPayload(item: any, userId?: string): Record<string, any> {
  if (!item) return {};

  const profileId = item.profile_id ?? userId;
  const rawPayload: Record<string, any> = {
    id: item.id,
    profile_id: profileId,
    ipo_id: item.ipo_id,
    user_id: item.user_id,
    bank_id: item.bank_id,
    application_number: item.application_number,
    lots: item.lots,
    shares: item.shares,
    investment: item.investment,
    status: item.status,
    payment_status: item.payment_status,
    upi_reference: item.upi_reference,
    mandate_date: item.mandate_date,
    allotted_lots: item.allotted_lots,
    refund_date: item.refund_date,
    listing_gain: item.listing_gain,
    listing_return: item.listing_return,
    remarks: item.remarks,
    sync_version: item.sync_version,
    last_synced_at: item.last_synced_at,
    created_at: item.created_at,
    updated_at: item.updated_at,
    deleted_at: item.deleted_at,
  };

  return filterAllowedFields(rawPayload, TABLES.applications.columns);
}

/**
 * Payload builder for `ipo_master` remote table.
 * `ipo_master` is pull-only reference data and is never uploaded.
 * Returns an empty object.
 */
export function buildIpoMasterPayload(_item: any): Record<string, any> {
  return {};
}

/**
 * Main payload transformation dispatcher.
 */
export function transformForRemote(tableName: string, item: any, userId?: string): Record<string, any> {
  switch (tableName) {
    case 'users_table':
    case 'users':
      return buildUsersPayload(item, userId);
    case 'bank_accounts':
    case 'banks':
      return buildBanksPayload(item, userId);
    case 'ipo_applications':
    case 'applications':
      return buildApplicationsPayload(item, userId);
    case 'ipo_master':
      return buildIpoMasterPayload(item);
    default:
      return {};
  }
}
