export type SyncState = 'Idle' | 'Syncing' | 'Offline' | 'Error';

export interface SyncStatus {
  state: SyncState;
  lastSyncTimestamp: string | null;
  pendingCount: number;
  authState: 'Connected' | 'Disconnected';
  error: string | null;
  rowsUploaded: number;
  rowsDownloaded: number;
  conflicts: number;
  retryCount: number;
  lastFailedSync: string | null;
  avgSyncDurationMs: number;
  supabaseLatencyMs: number;
  lastAutoSyncTimestamp: string | null;
  nextScheduledSyncTimestamp: string | null;
  lastTriggerSource: string | null;
}

export interface SyncQueueItem {
  id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: string; // JSON string
  retry_count: number;
  next_retry_at: string | null;
  created_at: string;
}

export interface PushResult {
  success: boolean;
  conflict?: boolean;
  retryable?: boolean;
  remoteRow?: any;
}

export interface PushPayload {
  users: any[];
  banks: any[];
  ipos: any[];
  applications: any[];
  ipo_master?: any[];
  brokers: any[];
  settings: any[];
  notes: any[];
}

export interface PullPayload {
  users: any[];
  banks: any[];
  ipos: any[];
  applications: any[];
  ipo_master?: any[];
  brokers: any[];
  settings: any[];
  notes: any[];
}
