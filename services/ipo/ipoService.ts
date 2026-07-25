import { SQLiteDatabase } from 'expo-sqlite';
import { IPORepository } from './ipoRepository';
import { IPOUpdater, MockIPOProvider } from './ipoUpdater';
import { IPOScheduler } from './ipoScheduler';

export class IPOService {
  public repository: IPORepository;
  public updater: IPOUpdater;
  public scheduler: IPOScheduler;

  constructor(db: SQLiteDatabase) {
    this.repository = new IPORepository(db);
    
    // In the future, this provider can be swapped or chosen via factory.
    const provider = new MockIPOProvider();
    
    this.updater = new IPOUpdater(this.repository, provider);
    this.scheduler = new IPOScheduler(this.updater);
  }

  // Helper to start scheduling lifecycle
  startBackgroundUpdates() {
    this.scheduler.start();
  }

  // Helper to stop
  stopBackgroundUpdates() {
    this.scheduler.stop();
  }
}
