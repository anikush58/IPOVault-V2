import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSQLiteContext } from 'expo-sqlite';
import { useAuth } from '@/context/AuthContext';
import { SyncEngine } from '@/services/sync/syncEngine';
import { syncStore } from '@/services/sync/syncStatus';

export const AUTO_SYNC_ENABLED_KEY = 'settings_auto_sync_enabled';
export const SYNC_INTERVAL_MINUTES_KEY = 'settings_sync_interval_minutes';

export function useAutoSync() {
  const db = useSQLiteContext();
  const { session, user } = useAuth();
  const appState = useRef(AppState.currentState);
  const syncEngine = useRef(new SyncEngine(db));

  const doSync = async (source: string) => {
    if (!user) return;
    const status = syncStore.getStatus();
    if (status.state === 'Syncing') return; // Prevent concurrent syncs

    const now = new Date().toISOString();
    syncStore.update({
      lastTriggerSource: source,
    });

    await syncEngine.current.runSyncPipeline(user.id);
    
    syncStore.update({
      lastAutoSyncTimestamp: now,
    });
  };

  const calculateNextSync = async () => {
    const isEnabledStr = await AsyncStorage.getItem(AUTO_SYNC_ENABLED_KEY);
    const isEnabled = isEnabledStr !== 'false'; // default true
    if (!isEnabled) {
      syncStore.update({ nextScheduledSyncTimestamp: null });
      return;
    }
    const intervalStr = await AsyncStorage.getItem(SYNC_INTERVAL_MINUTES_KEY);
    const intervalMinutes = intervalStr ? parseInt(intervalStr, 10) : 15;
    
    const nextDate = new Date(Date.now() + intervalMinutes * 60000);
    syncStore.update({ nextScheduledSyncTimestamp: nextDate.toISOString() });
  };

  // Trigger on App Resume
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground
        AsyncStorage.getItem(AUTO_SYNC_ENABLED_KEY).then(isEnabled => {
          if (isEnabled !== 'false') {
            doSync('App Resume');
            calculateNextSync();
          }
        });
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [user]);

  // Trigger on Successful Login / App Launch
  useEffect(() => {
    if (user) {
      AsyncStorage.getItem(AUTO_SYNC_ENABLED_KEY).then(isEnabled => {
        if (isEnabled !== 'false') {
          doSync('App Launch / Login');
          calculateNextSync();
        }
      });
    }
  }, [user]);

  // Trigger on Network Reconnected
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        AsyncStorage.getItem(AUTO_SYNC_ENABLED_KEY).then(isEnabled => {
          if (isEnabled !== 'false') {
            doSync('Network Reconnected');
            calculateNextSync();
          }
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  // Interval Sync
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    const tick = async () => {
      const isEnabledStr = await AsyncStorage.getItem(AUTO_SYNC_ENABLED_KEY);
      if (isEnabledStr === 'false') return;

      const intervalStr = await AsyncStorage.getItem(SYNC_INTERVAL_MINUTES_KEY);
      const intervalMinutes = intervalStr ? parseInt(intervalStr, 10) : 15;
      
      const status = syncStore.getStatus();
      if (!status.lastAutoSyncTimestamp) {
        doSync('Interval');
        calculateNextSync();
        return;
      }

      const timeSinceLastSync = Date.now() - new Date(status.lastAutoSyncTimestamp).getTime();
      if (timeSinceLastSync >= intervalMinutes * 60000) {
        doSync('Interval');
        calculateNextSync();
      }
    };

    // Run interval every minute to check if it's time to sync
    intervalId = setInterval(tick, 60000);

    return () => clearInterval(intervalId);
  }, [user]);
}
