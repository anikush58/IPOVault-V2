import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { IPOUpdater } from './ipoUpdater';

export class IPOScheduler {
  private updateIntervalId: ReturnType<typeof setInterval> | null = null;
  private cacheAgeIntervalId: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private netInfoSubscription: (() => void) | null = null;
  private currentAppState = AppState.currentState;

  constructor(private updater: IPOUpdater) {}

  start() {
    console.log('[Scheduler] Starting IPO Scheduler');
    
    // 1. Trigger on App Launch
    this.updater.runUpdate();

    // 2. Trigger every 6 hours while app is open (6 * 60 * 60 * 1000 = 21600000 ms)
    this.updateIntervalId = setInterval(() => {
      this.updater.runUpdate();
    }, 21600000);

    // Minor interval just to update cache age in diagnostics
    this.cacheAgeIntervalId = setInterval(() => {
      this.updater.updateCacheAge();
    }, 60000);

    // 3. Trigger on App Resume
    this.appStateSubscription = AppState.addEventListener('change', nextAppState => {
      if (this.currentAppState.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[Scheduler] App resumed. Triggering IPO update.');
        this.updater.runUpdate();
      }
      this.currentAppState = nextAppState;
    });

    // 4. Trigger on Network Reconnected (if offline -> online)
    this.netInfoSubscription = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        console.log('[Scheduler] Network reconnected. Triggering IPO update.');
        this.updater.runUpdate();
      }
    });
  }

  stop() {
    if (this.updateIntervalId) clearInterval(this.updateIntervalId);
    if (this.cacheAgeIntervalId) clearInterval(this.cacheAgeIntervalId);
    if (this.appStateSubscription) this.appStateSubscription.remove();
    if (this.netInfoSubscription) this.netInfoSubscription();
  }
}
