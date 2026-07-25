import React, { useState, useEffect } from 'react';
import { Alert, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDB } from '@/context/DBContext';
import { type ThemePreference, useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncStore } from '@/services/sync/syncStatus';
import { SyncEngine } from '@/services/sync/syncEngine';
import { AUTO_SYNC_ENABLED_KEY, SYNC_INTERVAL_MINUTES_KEY } from '@/hooks/useAutoSync';

async function shareFile(content: string, filename: string, mimeType: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  }

  if (Platform.OS === 'android') {
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return false;

    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      permission.directoryUri,
      filename,
      mimeType,
    );
    await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });
    Alert.alert('Backup Saved', `Saved ${filename} to the folder you selected.`);
    return true;
  }

  // Use a temporary file before opening iOS's native share sheet.
  const path = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(path, { mimeType, dialogTitle: 'Export IPO Data' });
  } else {
    Alert.alert('Saved', `File saved to:\n${path}`);
  }
  return true;
}

export function SettingRow({ icon, iconBg, title, subtitle, onPress, danger, disabled }: {
  icon: string; iconBg?: string; title: string; subtitle?: string; onPress: () => void; danger?: boolean; disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.row, { borderBottomColor: colors.border, opacity: disabled ? 0.45 : 1 }]}
      activeOpacity={0.7}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: iconBg ?? (danger ? colors.destructiveBg : colors.surface) }]}>
        <Feather name={icon as any} size={17} color={danger ? colors.destructive : colors.primary} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: danger ? colors.destructive : colors.foreground }]}>{title}</Text>
        {subtitle ? <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
      </View>
      <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

function ToggleRow({ icon, title, subtitle, value, onValueChange }: {
  icon: string; title: string; subtitle?: string; value: boolean; onValueChange: (val: boolean) => void;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={() => { onValueChange(!value); Haptics.selectionAsync(); }}
      style={[styles.row, { borderBottomColor: colors.border }]}
      activeOpacity={0.7}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: colors.surface }]}>
        <Feather name={icon as any} size={17} color={colors.primary} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
      </View>
      <View style={[
        styles.switch,
        {
          borderColor: value ? colors.primary : colors.border,
          backgroundColor: value ? colors.primary : colors.surface,
        }
      ]}>
        <View style={[
          styles.switchThumb,
          {
            backgroundColor: value ? '#fff' : colors.mutedForeground,
            transform: [{ translateX: value ? 14 : 0 }],
          }
        ]} />
      </View>
    </TouchableOpacity>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'system', label: 'System', icon: 'smartphone' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
];

function ThemeToggle() {
  const colors = useColors();
  const { preference, setPreference } = useTheme();
  return (
    <View style={[themeStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[themeStyles.label, { color: colors.mutedForeground }]}>APPEARANCE</Text>
      <View style={[themeStyles.segmented, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {THEME_OPTIONS.map((opt) => {
          const active = preference === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => { setPreference(opt.value); Haptics.selectionAsync(); }}
              style={[
                themeStyles.segment,
                active && { backgroundColor: colors.primary },
              ]}
              activeOpacity={0.75}
            >
              <Feather
                name={opt.icon as any}
                size={14}
                color={active ? colors.primaryForeground : colors.mutedForeground}
              />
              <Text style={[themeStyles.segmentLabel, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const themeStyles = StyleSheet.create({
  card: { margin: 16, marginBottom: 0, borderRadius: 20, borderWidth: 1, padding: 20 },
  label: { fontSize: 10, fontFamily: 'DMSans_600SemiBold', letterSpacing: 1, marginBottom: 14, textTransform: 'uppercase' },
  segmented: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 3, gap: 3 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 11 },
  segmentLabel: { fontSize: 13, fontFamily: 'DMSans_600SemiBold' },
});

// The SyncDebugSection has been moved to /sync-debug.tsx

export default function SettingsScreen() {
  const colors = useColors();
  const {
    exportJSON,
    importJSON,
    importCSV,
    clearAllData,
    applications,
    users,
    ipos,
    bankAccounts,
    autoExportEnabled,
    setAutoExportEnabled,
  } = useDB();
  const { session, user, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  
  const [autoSync, setAutoSync] = useState(true);
  const [syncInterval, setSyncInterval] = useState(15);
  
  useEffect(() => {
    AsyncStorage.getItem(AUTO_SYNC_ENABLED_KEY).then(val => {
      if (val !== null) setAutoSync(val === 'true');
    });
    AsyncStorage.getItem(SYNC_INTERVAL_MINUTES_KEY).then(val => {
      if (val !== null) setSyncInterval(parseInt(val, 10));
    });
  }, []);

  const handleToggleAutoSync = (val: boolean) => {
    setAutoSync(val);
    AsyncStorage.setItem(AUTO_SYNC_ENABLED_KEY, String(val));
  };
  
  const handleNextInterval = () => {
    const intervals = [5, 15, 30, 60];
    const currentIndex = intervals.indexOf(syncInterval);
    const nextIndex = (currentIndex + 1) % intervals.length;
    const nextInterval = intervals[nextIndex];
    setSyncInterval(nextInterval);
    AsyncStorage.setItem(SYNC_INTERVAL_MINUTES_KEY, String(nextInterval));
  };

  const [syncStatus, setSyncStatus] = useState(syncStore.getStatus());

  useEffect(() => {
    return syncStore.subscribe((status) => {
      setSyncStatus(status);
    });
  }, []);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const hasData = users.length > 0 || ipos.length > 0 || bankAccounts.length > 0 || applications.length > 0;

  const handleExport = async () => {
    setBusy(true);
    try {
      const backup = exportJSON();
      const date = new Date().toISOString().slice(0, 10);
      const saved = await shareFile(backup, `ipovault_backup_${date}.json`, 'application/json');
      if (!saved) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Could not create or share the export file.';
      Alert.alert('Export Failed', message);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      setBusy(true);
      let text: string;
      if (Platform.OS === 'web') {
        const response = await fetch(result.assets[0].uri);
        text = await response.text();
      } else {
        text = await FileSystem.readAsStringAsync(result.assets[0].uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      const isJSON = result.assets[0].name?.endsWith('.json') || text.trimStart().startsWith('{');
      const stats = isJSON ? await importJSON(text) : await importCSV(text);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Import Complete',
        `Successfully imported:\n• ${stats.users} user(s)\n• ${stats.ipos} IPO(s)\n• ${stats.applications} application(s)\n\nExisting records were kept.`,
      );
    } catch (e: any) {
      Alert.alert('Import Failed', e?.message ?? 'Could not read or parse the file. Make sure it was exported from this app.');
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    if (Platform.OS === 'web') {
      if ((globalThis as any).confirm?.('Permanently delete all data? This cannot be undone.')) {
        setBusy(true);
        clearAllData()
          .then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error))
          .finally(() => setBusy(false));
      }
      return;
    }
    Alert.alert('Clear All Data', 'Permanently deletes all users, IPOs, and applications. Cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear Everything', style: 'destructive', onPress: async () => {
        setBusy(true);
        try { await clearAllData(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); }
        finally { setBusy(false); }
      }},
    ]);
  };

  const stats = [
    { label: 'Users', value: users.length, icon: 'users' },
    { label: 'IPOs', value: ipos.length, icon: 'trending-up' },
    { label: 'Applications', value: applications.length, icon: 'file-text' },
  ];

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return 'Never synced';
    const date = new Date(timestamp);
    return `Synced ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <LinearGradient
          colors={[colors.primary + '22', colors.primary + '00']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.headerGlow}
          pointerEvents="none"
        />
        <View>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>App</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Settings</Text>
        </View>
        <Image
          source={require('@/assets/app-icon.png')}
          style={styles.headerIcon}
          resizeMode="contain"
        />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}>
        {/* 1. Appearance */}
        <ThemeToggle />

        {/* 2. Database */}
        <View style={[styles.statsCard, { borderColor: colors.border }]}>
          <LinearGradient
            colors={[colors.primary + '18', colors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
          />
          {/* Diagonal stripe pattern */}
          {[0,1,2,3,4,5].map((i) => (
            <View key={i} pointerEvents="none" style={{
              position: 'absolute', left: i * 28 - 10, top: -20, width: 1, height: 160,
              backgroundColor: colors.primary, opacity: 0.04, transform: [{ rotate: '35deg' }],
            }} />
          ))}
          <View style={styles.databaseHeaderRow}>
            <Text style={[styles.statsEyebrow, { color: colors.mutedForeground, marginBottom: 0 }]}>DATABASE</Text>
            <Text style={[styles.syncTimeBadge, { color: colors.primary }]}>
              {session ? formatLastSync(syncStatus.lastSyncTimestamp) : 'Local Storage'}
            </Text>
          </View>
          <View style={[styles.statsRow, { marginTop: 14 }]}>
            {stats.map(({ label, value, icon }) => (
              <View key={label} style={styles.statItem}>
                <LinearGradient
                  colors={[colors.primary + '28', colors.primary + '10']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.statIconWrap}
                >
                  <Feather name={icon as any} size={18} color={colors.primary} />
                </LinearGradient>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 3. Account Section */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>ACCOUNT</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
          {session ? (
            <View>
              <View style={[styles.profileHeader, { borderBottomColor: colors.border }]}>
                {user?.user_metadata?.avatar_url ? (
                  <Image source={{ uri: user.user_metadata.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '22' }]}>
                    <Feather name="user" size={24} color={colors.primary} />
                  </View>
                )}
                <View style={styles.profileInfo}>
                  <Text style={[styles.profileName, { color: colors.foreground }]}>
                    {user?.user_metadata?.full_name || user?.user_metadata?.name || 'My Profile'}
                  </Text>
                  <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>
                    {user?.email}
                  </Text>
                  <View style={[styles.providerBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Feather name={user?.app_metadata?.provider === 'google' ? 'globe' : 'mail'} size={12} color={colors.foreground} />
                    <Text style={[styles.providerText, { color: colors.foreground }]}>
                      {user?.app_metadata?.provider === 'google' ? 'Google' : 'Email'}
                    </Text>
                  </View>
                </View>
              </View>
              <SettingRow
                icon="log-out"
                title="Sign Out"
                danger
                onPress={signOut}
              />
            </View>
          ) : (
            <SettingRow
              icon="log-in"
              title="Sign In / Register"
              subtitle="Enable cloud backup & sync"
              onPress={() => router.push('/auth')}
            />
          )}
        </View>

        {/* 4. Synchronization */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>SYNCHRONIZATION</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
          <ToggleRow
            icon="refresh-cw"
            title="Auto Sync"
            subtitle="Automatically back up to cloud in the background"
            value={autoSync}
            onValueChange={handleToggleAutoSync}
          />
          {autoSync && (
            <SettingRow
              icon="clock"
              title="Sync Interval"
              subtitle={`Every ${syncInterval} minutes`}
              onPress={handleNextInterval}
            />
          )}
        </View>

        {/* 5. Data Management */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>DATA MANAGEMENT</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
          <SettingRow
            icon="download"
            title="Export Backup"
            subtitle="Save all app data as a JSON backup file"
            onPress={handleExport}
            disabled={busy || !hasData}
          />
          <SettingRow
            icon="upload"
            title="Import Backup"
            subtitle="Restore from a JSON or CSV backup file"
            onPress={handleImport}
            disabled={busy}
          />
          <SettingRow
            icon="trash-2"
            title="Clear All Data"
            subtitle="Permanently delete everything"
            onPress={handleClear}
            danger
            disabled={busy}
          />
        </View>

        {/* 6. Developer */}
        {__DEV__ && (
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionHeader, { color: colors.destructive }]}>DEVELOPER</Text>
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.destructiveBg, borderWidth: 1.5 }]}>
              <SettingRow 
                icon="terminal" 
                title="Sync Debug" 
                subtitle="View diagnostic stats and queue state"
                onPress={() => router.push('/sync-debug')} 
              />
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={[styles.footerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.footerBrand, { color: colors.primary }]}>IPOVault</Text>
          <Text style={[styles.footerTitle, { color: colors.foreground }]}>IPO Investment Tracker</Text>
          <Text style={[styles.footerSub, { color: colors.mutedForeground }]}>
            All data stored locally on your device.{'\n'}No internet connection required.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, overflow: 'hidden', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
 headerIcon: { width: 40, height: 40, borderRadius: 10, marginBottom: 4 },
  headerGlow: { position: 'absolute', right: 0, top: 0, width: 200, height: 130 },
  headerEyebrow: { fontSize: 11, fontFamily: 'DMSans_600SemiBold', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 },
  headerTitle: { fontSize: 30, fontFamily: 'DMSans_700Bold', letterSpacing: -0.8, lineHeight: 34 },
  statsCard: { margin: 16, borderRadius: 20, borderWidth: 1, padding: 20, overflow: 'hidden' },
  databaseHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  syncTimeBadge: { fontSize: 11, fontFamily: 'DMSans_500Medium' },
  statsEyebrow: { fontSize: 10, fontFamily: 'DMSans_600SemiBold', letterSpacing: 1, marginBottom: 18, textTransform: 'uppercase' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: 8 },
  statIconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 30, fontFamily: 'PlayfairDisplay_700Bold', letterSpacing: -0.8 },
  statLabel: { fontSize: 11, fontFamily: 'DMSans_500Medium' },
  sectionHeader: { fontSize: 10, fontFamily: 'DMSans_600SemiBold', letterSpacing: 1, paddingHorizontal: 20, paddingBottom: 10, textTransform: 'uppercase' },
  section: { marginHorizontal: 16, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, gap: 14 },
  rowIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontFamily: 'DMSans_500Medium' },
  rowSub: { fontSize: 12, fontFamily: 'DMSans_400Regular', marginTop: 2, lineHeight: 17 },
  footerCard: { marginHorizontal: 16, marginTop: 0, marginBottom: 16, borderRadius: 20, borderWidth: 1, padding: 24, alignItems: 'center', gap: 10 },
  footerBrand: { fontSize: 22, fontFamily: 'DMSans_700Bold', letterSpacing: -0.5, marginBottom: 2 },
  footerTitle: { fontSize: 15, fontFamily: 'DMSans_700Bold', letterSpacing: -0.2 },
  footerSub: { fontSize: 12, fontFamily: 'DMSans_400Regular', textAlign: 'center', lineHeight: 19 },
  switch: { width: 36, height: 22, borderRadius: 11, borderWidth: 1.5, padding: 2, justifyContent: 'center' },
  switchThumb: { width: 14, height: 14, borderRadius: 7 },
  profileHeader: { flexDirection: 'row', padding: 20, alignItems: 'center', gap: 16, borderBottomWidth: 1 },
  avatar: { width: 60, height: 60, borderRadius: 30 },
  avatarPlaceholder: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  profileInfo: { flex: 1, justifyContent: 'center' },
  profileName: { fontSize: 18, fontFamily: 'DMSans_700Bold', marginBottom: 2 },
  profileEmail: { fontSize: 13, fontFamily: 'DMSans_400Regular', marginBottom: 8 },
  providerBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, alignSelf: 'flex-start', gap: 6 },
  providerText: { fontSize: 11, fontFamily: 'DMSans_600SemiBold', textTransform: 'capitalize' },
});

