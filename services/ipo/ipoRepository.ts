import { SQLiteDatabase } from 'expo-sqlite';
import { IPOMasterRecord } from './types';
import { IPOParser } from './ipoParser';

export class IPORepository {
  constructor(private db: SQLiteDatabase) {}

  async upsertBatch(records: Partial<IPOMasterRecord>[]): Promise<number> {
    if (records.length === 0) return 0;
    
    let updatedCount = 0;
    
    await this.db.withTransactionAsync(async () => {
      for (const raw of records) {
        const record = IPOParser.parse(raw);
        
        // Check if exists and sync_version
        const existing = await this.db.getFirstAsync<{ sync_version: number; updated_at: string }>(
          'SELECT sync_version, updated_at FROM ipo_master WHERE id = ?',
          [record.id]
        );

        if (existing) {
          // Compare dates to avoid duplicate writes if no actual change
          if (new Date(record.updated_at) <= new Date(existing.updated_at)) {
            continue;
          }
          
          await this.db.runAsync(
            `UPDATE ipo_master SET 
              company_name=?, ipo_name=?, symbol=?, exchange=?, issue_type=?, 
              price_band_min=?, price_band_max=?, lot_size=?, issue_size=?, 
              listing_date=?, open_date=?, close_date=?, allotment_date=?, refund_date=?, demat_credit_date=?,
              registrar=?, lead_manager=?, status=?, logo_url=?, sector=?, description=?, website=?, prospectus_url=?,
              retail_sub=?, qib_sub=?, nii_sub=?, employee_sub=?, shareholder_sub=?, anchor_sub=?, total_sub=?, subscription_timestamp=?,
              registrar_website=?, allotment_link=?,
              listing_price=?, listing_gain_percent=?, current_price=?, current_price_updated_at=?,
              sync_version=?, updated_at=?, deleted_at=?
             WHERE id = ?`,
            [
              record.company_name, record.ipo_name, record.symbol, record.exchange, record.issue_type,
              record.price_band_min, record.price_band_max, record.lot_size, record.issue_size,
              record.listing_date, record.open_date, record.close_date, record.allotment_date, record.refund_date, record.demat_credit_date,
              record.registrar, record.lead_manager, record.status, record.logo_url, record.sector, record.description, record.website, record.prospectus_url,
              record.retail_sub, record.qib_sub, record.nii_sub, record.employee_sub, record.shareholder_sub, record.anchor_sub, record.total_sub, record.subscription_timestamp,
              record.registrar_website, record.allotment_link,
              record.listing_price, record.listing_gain_percent, record.current_price, record.current_price_updated_at,
              record.sync_version + 1, record.updated_at, record.deleted_at,
              record.id
            ]
          );
          updatedCount++;
        } else {
          await this.db.runAsync(
            `INSERT INTO ipo_master (
              id, company_name, ipo_name, symbol, exchange, issue_type,
              price_band_min, price_band_max, lot_size, issue_size,
              listing_date, open_date, close_date, allotment_date, refund_date, demat_credit_date,
              registrar, lead_manager, status, logo_url, sector, description, website, prospectus_url,
              retail_sub, qib_sub, nii_sub, employee_sub, shareholder_sub, anchor_sub, total_sub, subscription_timestamp,
              registrar_website, allotment_link,
              listing_price, listing_gain_percent, current_price, current_price_updated_at,
              sync_version, created_at, updated_at, deleted_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              record.id, record.company_name, record.ipo_name, record.symbol, record.exchange, record.issue_type,
              record.price_band_min, record.price_band_max, record.lot_size, record.issue_size,
              record.listing_date, record.open_date, record.close_date, record.allotment_date, record.refund_date, record.demat_credit_date,
              record.registrar, record.lead_manager, record.status, record.logo_url, record.sector, record.description, record.website, record.prospectus_url,
              record.retail_sub, record.qib_sub, record.nii_sub, record.employee_sub, record.shareholder_sub, record.anchor_sub, record.total_sub, record.subscription_timestamp,
              record.registrar_website, record.allotment_link,
              record.listing_price, record.listing_gain_percent, record.current_price, record.current_price_updated_at,
              record.sync_version, record.created_at, record.updated_at, record.deleted_at
            ]
          );
          updatedCount++;
        }
      }
    });

    return updatedCount;
  }

  async getUpcoming(): Promise<IPOMasterRecord[]> {
    return this.db.getAllAsync<IPOMasterRecord>(
      "SELECT * FROM ipo_master WHERE deleted_at IS NULL AND (status = 'Upcoming' OR open_date > date('now')) ORDER BY open_date ASC"
    );
  }

  async getOpen(): Promise<IPOMasterRecord[]> {
    return this.db.getAllAsync<IPOMasterRecord>(
      "SELECT * FROM ipo_master WHERE deleted_at IS NULL AND status = 'Open' ORDER BY close_date ASC"
    );
  }

  async getClosed(): Promise<IPOMasterRecord[]> {
    return this.db.getAllAsync<IPOMasterRecord>(
      "SELECT * FROM ipo_master WHERE deleted_at IS NULL AND status IN ('Closed', 'Allotment') ORDER BY close_date DESC"
    );
  }

  async getListed(): Promise<IPOMasterRecord[]> {
    return this.db.getAllAsync<IPOMasterRecord>(
      "SELECT * FROM ipo_master WHERE deleted_at IS NULL AND status = 'Listed' ORDER BY listing_date DESC"
    );
  }

  async getById(id: string): Promise<IPOMasterRecord | null> {
    return this.db.getFirstAsync<IPOMasterRecord>(
      "SELECT * FROM ipo_master WHERE id = ?",
      [id]
    );
  }

  async search(query: string): Promise<IPOMasterRecord[]> {
    const q = `%${query}%`;
    return this.db.getAllAsync<IPOMasterRecord>(
      "SELECT * FROM ipo_master WHERE deleted_at IS NULL AND (company_name LIKE ? OR symbol LIKE ? OR sector LIKE ? OR registrar LIKE ?) ORDER BY open_date DESC LIMIT 50",
      [q, q, q, q]
    );
  }

  async getLastUpdatedTimestamp(): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ max_updated: string }>(
      "SELECT MAX(updated_at) as max_updated FROM ipo_master"
    );
    return row?.max_updated || null;
  }
}
