export interface IPOMasterRecord {
  id: string;
  company_name: string;
  ipo_name: string;
  symbol: string;
  exchange: string;
  issue_type: string;
  price_band_min: number | null;
  price_band_max: number | null;
  lot_size: number | null;
  issue_size: number | null;
  listing_date: string | null;
  open_date: string | null;
  close_date: string | null;
  allotment_date: string | null;
  refund_date: string | null;
  demat_credit_date: string | null;
  registrar: string;
  lead_manager: string;
  status: string;
  logo_url: string;
  sector: string;
  description: string;
  website: string;
  prospectus_url: string;
  
  retail_sub: number | null;
  qib_sub: number | null;
  nii_sub: number | null;
  employee_sub: number | null;
  shareholder_sub: number | null;
  anchor_sub: number | null;
  total_sub: number | null;
  subscription_timestamp: string | null;
  
  registrar_website: string;
  allotment_link: string;
  
  listing_price: number | null;
  listing_gain_percent: number | null;
  current_price: number | null;
  current_price_updated_at: string | null;
  
  sync_version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface IPOProvider {
  /**
   * Fetch IPO records modified since the given timestamp.
   * If since is null, fetch all active/recent IPOs.
   */
  fetchIPOs(since: string | null): Promise<Partial<IPOMasterRecord>[]>;
}
