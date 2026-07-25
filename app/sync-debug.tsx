import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useDB } from '@/context/DBContext';
import { syncStore } from '@/services/sync/syncStatus';
import { SyncEngine } from '@/services/sync/syncEngine';
import { ipoDiagnosticsStore } from '@/services/ipo/ipoUpdater';
import { SettingRow } from './(tabs)/settings';

export default function SyncDebugScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const db = useSQLiteContext();
  const { session, user } = useAuth();
  const { users, applications, bankAccounts } = useDB();
  
  const [syncStatus, setSyncStatus] = useState(syncStore.getStatus());
  const [ipoStats, setIpoStats] = useState(ipoDiagnosticsStore.get());
  const [engine] = useState(() => new SyncEngine(db));
  
  useEffect(() => {
    const unsub1 = syncStore.subscribe(setSyncStatus);
    const unsub2 = ipoDiagnosticsStore.subscribe(setIpoStats);
    return () => { unsub1(); unsub2(); };
  }, []);

  useEffect(() => {
    db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM sync_queue')
      .then(res => {
        if (res && res.count !== syncStatus.pendingCount) {
          syncStore.update({ pendingCount: res.count });
        }
      })
      .catch(() => {});
  }, [db, users, applications, bankAccounts]);

  const brokersCount = new Set(users.map(u => u.broker).filter(Boolean)).size;

  const handleRunSync = async () => {
    await engine.runSyncPipeline(user?.id);
  };

  if (!__DEV__) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <Stack.Screen options={{ title: 'Sync Debug' }} />
        <Text style={{ color: colors.foreground, margin: 20 }}>This screen is only available in development mode.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Developer Sync Debug' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40, padding: 16 }}>
        <Text style={[styles.sectionHeader, { color: colors.primary }]}>AUTHENTICATION</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
          <SettingRow icon="user" title="Provider" subtitle={user?.app_metadata?.provider ? String(user.app_metadata.provider).toUpperCase() : 'None'} onPress={() => {}} disabled />
          <SettingRow icon="key" title="User ID" subtitle={user?.id ?? 'Not authenticated'} onPress={() => {}} disabled />
          <SettingRow icon="mail" title="Email" subtitle={user?.email ?? 'Unknown'} onPress={() => {}} disabled />
          <SettingRow icon="clock" title="Token Expiry" subtitle={session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'No session'} onPress={() => {}} disabled />
        </View>

        <Text style={[styles.sectionHeader, { color: colors.destructive }]}>SYNC ENGINE</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.destructiveBg, borderWidth: 1.5 }]}>
          <SettingRow icon="play" title="Run Sync Engine" subtitle={`State: ${syncStatus.state}`} onPress={handleRunSync} disabled={syncStatus.state === 'Syncing'} />
          <SettingRow icon="refresh-cw" title="Trigger Source" subtitle={syncStatus.lastTriggerSource || 'Manual'} onPress={() => {}} disabled />
          <SettingRow icon="clock" title="Last Auto Sync" subtitle={syncStatus.lastAutoSyncTimestamp ? new Date(syncStatus.lastAutoSyncTimestamp).toLocaleString() : 'Never'} onPress={() => {}} disabled />
          <SettingRow icon="calendar" title="Next Auto Sync" subtitle={syncStatus.nextScheduledSyncTimestamp ? new Date(syncStatus.nextScheduledSyncTimestamp).toLocaleString() : 'Disabled'} onPress={() => {}} disabled />
          <SettingRow icon="list" title="Pending Sync Queue" subtitle={`${syncStatus.pendingCount} mutations pending`} onPress={() => {}} disabled />
          <SettingRow icon="alert-triangle" title="Sync Conflicts" subtitle={`${syncStatus.conflicts} conflicts resolved`} onPress={() => {}} disabled />
          <SettingRow icon="upload-cloud" title="Rows Uploaded" subtitle={`${syncStatus.rowsUploaded} rows pushed`} onPress={() => {}} disabled />
          <SettingRow icon="download-cloud" title="Rows Downloaded" subtitle={`${syncStatus.rowsDownloaded} rows pulled`} onPress={() => {}} disabled />
          <SettingRow icon="clock" title="Last Successful Sync" subtitle={syncStatus.lastSyncTimestamp ? new Date(syncStatus.lastSyncTimestamp).toLocaleString() : 'Never'} onPress={() => {}} disabled />
          <SettingRow icon="x-circle" title="Last Failed Sync" subtitle={syncStatus.lastFailedSync ? new Date(syncStatus.lastFailedSync).toLocaleString() : 'None'} onPress={() => {}} disabled />
          <SettingRow icon="activity" title="Avg Sync Duration" subtitle={`${syncStatus.avgSyncDurationMs} ms`} onPress={() => {}} disabled />
          <SettingRow icon="wifi" title="Supabase Latency" subtitle={`${syncStatus.supabaseLatencyMs} ms`} onPress={() => {}} disabled />
          <SettingRow icon="hard-drive" title="SQLite Records" subtitle={`Users: ${users.length} | Apps: ${applications.length} | Banks: ${bankAccounts.length} | Brokers: ${brokersCount} | Settings: 0 | Notes: 0`} onPress={() => {}} disabled />
        </View>

        <Text style={[styles.sectionHeader, { color: '#0ea5e9' }]}>IPO MASTER ENGINE</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: '#0ea5e9', borderWidth: 1.5 }]}>
          <SettingRow icon="clock" title="Last IPO Update" subtitle={ipoStats.lastUpdateTimestamp ? new Date(ipoStats.lastUpdateTimestamp).toLocaleString() : 'Never'} onPress={() => {}} disabled />
          <SettingRow icon="plus-circle" title="Rows Upserted" subtitle={`${ipoStats.totalRowsUpserted} rows total`} onPress={() => {}} disabled />
          <SettingRow icon="activity" title="API Response Time" subtitle={`${ipoStats.apiResponseTimeMs} ms`} onPress={() => {}} disabled />
          <SettingRow icon="hourglass" title="Cache Age" subtitle={`${Math.floor(ipoStats.cacheAgeMs / 1000)} seconds`} onPress={() => {}} disabled />
          <SettingRow icon="x-circle" title="Last Failure" subtitle={ipoStats.lastFailure || 'None'} onPress={() => {}} disabled />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 16,
    opacity: 0.8,
  },
});
