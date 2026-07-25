import { IPOMasterRecord } from './types';

export class IPOParser {
  static parse(raw: Partial<IPOMasterRecord>): IPOMasterRecord {
    const now = new Date().toISOString();
    return {
      id: raw.id || crypto.randomUUID(),
      company_name: raw.company_name || '',
      ipo_name: raw.ipo_name || '',
      symbol: raw.symbol || '',
      exchange: raw.exchange || '',
      issue_type: raw.issue_type || '',
      price_band_min: raw.price_band_min ?? null,
      price_band_max: raw.price_band_max ?? null,
      lot_size: raw.lot_size ?? null,
      issue_size: raw.issue_size ?? null,
      listing_date: raw.listing_date || null,
      open_date: raw.open_date || null,
      close_date: raw.close_date || null,
      allotment_date: raw.allotment_date || null,
      refund_date: raw.refund_date || null,
      demat_credit_date: raw.demat_credit_date || null,
      registrar: raw.registrar || '',
      lead_manager: raw.lead_manager || '',
      status: raw.status || '',
      logo_url: raw.logo_url || '',
      sector: raw.sector || '',
      description: raw.description || '',
      website: raw.website || '',
      prospectus_url: raw.prospectus_url || '',
      
      retail_sub: raw.retail_sub ?? null,
      qib_sub: raw.qib_sub ?? null,
      nii_sub: raw.nii_sub ?? null,
      employee_sub: raw.employee_sub ?? null,
      shareholder_sub: raw.shareholder_sub ?? null,
      anchor_sub: raw.anchor_sub ?? null,
      total_sub: raw.total_sub ?? null,
      subscription_timestamp: raw.subscription_timestamp || null,
      
      registrar_website: raw.registrar_website || '',
      allotment_link: raw.allotment_link || '',
      
      listing_price: raw.listing_price ?? null,
      listing_gain_percent: raw.listing_gain_percent ?? null,
      current_price: raw.current_price ?? null,
      current_price_updated_at: raw.current_price_updated_at || null,
      
      sync_version: raw.sync_version ?? 0,
      created_at: raw.created_at || now,
      updated_at: raw.updated_at || now,
      deleted_at: raw.deleted_at || null,
    };
  }
}
