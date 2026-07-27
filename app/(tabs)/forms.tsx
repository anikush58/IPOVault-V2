import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { useDB, type ApplicationWithDetails } from '@/context/DBContext';
import { useRouter } from 'expo-router';
import { formatCurrency } from '@/utils/formatters';

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[sc.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={sc.header}>
        <View style={[sc.iconWrap, { backgroundColor: colors.primary + '18' }]}>
          <Feather name={icon as any} size={17} color={colors.primary} />
        </View>
        <Text style={[sc.title, { color: colors.foreground }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}
const sc = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 14, borderRadius: 20, borderWidth: 1, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontFamily: 'DMSans_700Bold', letterSpacing: -0.2 },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FormsScreen() {
  const colors = useColors();
  const { showConfirm, showSuccess, showError } = useDialog();
  const router = useRouter();
  const { users, ipos, applications, bankAccounts, addBulkApplications, updateApplication } = useDB();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // Bulk apply state
  const [bulkIPOId, setBulkIPOId] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkBankName, setBulkBankName] = useState<string | null>(null);
  const [bulkUPIApp, setBulkUPIApp] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Pickers
  const [showIPOPicker, setShowIPOPicker] = useState(false);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [showUPIPicker, setShowUPIPicker] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);

  const UPI_APPS = ['GPay', 'BHIM', 'PayTM', 'PhonePe', 'IDFC ASBA', 'BoB ASBA'];

  const appliedApps = React.useMemo(() => {
    return applications
      .filter((a) => a.status === 'Applied')
      .sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA;
      });
  }, [applications]);

  const activeIPOs = ipos.filter((ipo) => ipo.archived === 0);
  const selectedIPO = ipos.find((i) => i.id === bulkIPOId);
  const selectedBank = bankAccounts.find((b) => b.bank_name === bulkBankName) ?? null;

  // Filter out users who have already applied for the selected IPO
  const appliedUserIdsForSelectedIPO = React.useMemo(() => {
    if (!bulkIPOId) return new Set<string>();
    return new Set(
      applications
        .filter((a) => a.ipo_id === bulkIPOId)
        .map((a) => a.user_id)
    );
  }, [bulkIPOId, applications]);

  const filteredUsers = React.useMemo(() => {
    if (!bulkIPOId) return users;
    return users.filter((u) => !appliedUserIdsForSelectedIPO.has(u.id));
  }, [users, bulkIPOId, appliedUserIdsForSelectedIPO]);

  React.useEffect(() => {
    if (bulkIPOId) {
      setSelectedUserIds((prev) => {
        const next = new Set<string>();
        prev.forEach((id) => {
          if (!appliedUserIdsForSelectedIPO.has(id)) {
            next.add(id);
          }
        });
        return next;
      });
    }
  }, [bulkIPOId, appliedUserIdsForSelectedIPO]);

  const handleBankSelect = (bankName: string) => {
    setBulkBankName(bankName);
    setShowBankPicker(false);
  };

  const handleUPISelect = (upiApp: string) => {
    setBulkUPIApp(upiApp);
    setShowUPIPicker(false);
  };

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  // Bank balance impact for currently selected IPO + users
  const blockedNow = selectedBank
    ? applications
        .filter((a) => (a.status === 'Applied' || a.status === 'Allotted') && a.user_bank_name === bulkBankName)
        .reduce((s, a) => s + a.buy_price * a.quantity, 0)
    : 0;

  const willBlock = selectedIPO
    ? selectedUserIds.size * selectedIPO.buy_price * selectedIPO.quantity
    : 0;

  const balanceAfter = selectedBank ? selectedBank.balance - blockedNow - willBlock : 0;

  const handleBulkCreate = async () => {
    if (!bulkIPOId) { showError('', 'Please select an IPO first.'); return; }
    if (selectedUserIds.size === 0) { showError('', 'Select at least one user.'); return; }
    setBulkLoading(true);
    try {
      await addBulkApplications(bulkIPOId, Array.from(selectedUserIds), bulkBankName ?? undefined, bulkUPIApp ?? undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showSuccess('Done', `Created applications for ${selectedUserIds.size} user(s) under ${selectedIPO?.ipo_name}.`);
      setSelectedUserIds(new Set());
    } catch {
      showError('Error', 'Failed to create applications.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleQuickStatus = (app: ApplicationWithDetails, newStatus: 'Allotted' | 'Not Allotted') => {
    showConfirm({
      title: `Mark as ${newStatus}?`,
      message: `${app.user_name} — ${app.ipo_name}`,
      confirmText: newStatus,
      onConfirm: async () => {
        await updateApplication(app.id, newStatus);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <LinearGradient
          colors={[colors.primary + '22', colors.primary + '00']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.headerGlow}
          pointerEvents="none"
        />
        <View>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>Manage</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Actions</Text>
        </View>
        {/* Spacer keeps title left-aligned, matching other tab headers */}
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 90 }}>

        {/* ── IPO Listings nav card ── */}
        <TouchableOpacity
          onPress={() => router.push('/ipos')}
          activeOpacity={0.75}
          style={[styles.ipoNavCard, { backgroundColor: colors.card, borderColor: colors.border, overflow: 'hidden' }]}
        >
          <LinearGradient
            colors={[colors.primary + '0A', colors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.ipoNavIcon, { backgroundColor: colors.primary + '18' }]}>
            <Feather name="trending-up" size={19} color={colors.primary} />
          </View>
          <View style={styles.ipoNavText}>
            <Text style={[styles.ipoNavLabel, { color: colors.mutedForeground }]}>IPO LISTINGS</Text>
            <Text style={[styles.ipoNavCount, { color: colors.foreground }]}>
              {ipos.length === 0 ? 'No IPOs yet' : `${ipos.length} IPO${ipos.length !== 1 ? 's' : ''}`}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>

        {/* ── Manage Users nav card ── */}
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/users')}
          activeOpacity={0.75}
          style={[styles.ipoNavCard, { backgroundColor: colors.card, borderColor: colors.border, overflow: 'hidden' }]}
        >
          <LinearGradient
            colors={[colors.primary + '0A', colors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.ipoNavIcon, { backgroundColor: colors.primary + '18' }]}>
            <Feather name="users" size={19} color={colors.primary} />
          </View>
          <View style={styles.ipoNavText}>
            <Text style={[styles.ipoNavLabel, { color: colors.mutedForeground }]}>USERS</Text>
            <Text style={[styles.ipoNavCount, { color: colors.foreground }]}>
              {users.length === 0 ? 'No users yet' : `${users.length} User${users.length !== 1 ? 's' : ''}`}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>

        {/* ── Bulk Apply ── */}
        <SectionCard title="Bulk Application Creator" icon="layers">
          <Text style={[styles.desc, { color: colors.mutedForeground }]}>
            Select an IPO, pick a bank to track balance impact, choose users — then create all Applied records in one tap.
          </Text>

          {/* IPO Selector */}
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SELECT IPO</Text>
          <TouchableOpacity
            onPress={() => setShowIPOPicker(true)}
            style={[styles.selector, { borderColor: selectedIPO ? colors.primary : colors.border, backgroundColor: colors.surface }]}
          >
            <Text style={[styles.selectorText, { color: selectedIPO ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
              {selectedIPO
                ? `${selectedIPO.ipo_name} — ${formatCurrency(selectedIPO.buy_price * selectedIPO.quantity)}`
                : 'Tap to select an IPO…'}
            </Text>
            <Feather name="chevron-down" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Bank Selector */}
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SELECT BANK</Text>
          <TouchableOpacity
            onPress={() => setShowBankPicker(true)}
            style={[styles.selector, { borderColor: selectedBank ? colors.primary : colors.border, backgroundColor: colors.surface }]}
          >
            <View style={styles.selectorInner}>
              {selectedBank ? (
                <View style={[styles.bankDot, { backgroundColor: colors.primary }]} />
              ) : (
                <Feather name="credit-card" size={14} color={colors.mutedForeground} />
              )}
              <Text style={[styles.selectorText, { color: selectedBank ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                {selectedBank ? selectedBank.bank_name : 'Tap to select a bank…'}
              </Text>
            </View>
            <Feather name="chevron-down" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* UPI App Selector */}
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SELECT UPI APP / ASBA</Text>
          <TouchableOpacity
            onPress={() => setShowUPIPicker(true)}
            style={[styles.selector, { borderColor: bulkUPIApp ? colors.primary : colors.border, backgroundColor: colors.surface, marginBottom: 0 }]}
          >
            <View style={styles.selectorInner}>
              {bulkUPIApp ? (
                <View style={[styles.bankDot, { backgroundColor: colors.primary }]} />
              ) : (
                <Feather name="smartphone" size={14} color={colors.mutedForeground} />
              )}
              <Text style={[styles.selectorText, { color: bulkUPIApp ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                {bulkUPIApp ? bulkUPIApp : 'Tap to select UPI app…'}
              </Text>
            </View>
            <Feather name="chevron-down" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Balance impact card */}
          {selectedBank && (
            <View style={[styles.balanceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.balanceRow}>
                <Text style={[styles.balanceKey, { color: colors.mutedForeground }]}>Bank Balance</Text>
                <Text style={[styles.balanceVal, { color: colors.foreground }]}>{formatCurrency(selectedBank.balance)}</Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={[styles.balanceKey, { color: colors.mutedForeground }]}>Already Blocked</Text>
                <Text style={[styles.balanceVal, { color: blockedNow > 0 ? colors.negative : colors.mutedForeground }]}>
                  {blockedNow > 0 ? `− ${formatCurrency(blockedNow)}` : '—'}
                </Text>
              </View>
              {willBlock > 0 && (
                <View style={styles.balanceRow}>
                  <Text style={[styles.balanceKey, { color: colors.mutedForeground }]}>
                    Will Block ({selectedUserIds.size} user{selectedUserIds.size !== 1 ? 's' : ''})
                  </Text>
                  <Text style={[styles.balanceVal, { color: colors.negative }]}>− {formatCurrency(willBlock)}</Text>
                </View>
              )}
              <View style={[styles.balanceSep, { backgroundColor: colors.border }]} />
              <View style={styles.balanceRow}>
                <Text style={[styles.balanceKey, { color: colors.mutedForeground, fontFamily: 'DMSans_700Bold' }]}>Remaining</Text>
                <Text style={[styles.balanceVal, {
                  color: balanceAfter < 0 ? colors.negative : balanceAfter < 15000 ? colors.statusApplied : colors.positive,
                  fontFamily: 'DMSans_700Bold',
                }]}>
                  {formatCurrency(Math.max(0, balanceAfter))}
                  {balanceAfter < 0 && ' ⚠'}
                </Text>
              </View>
            </View>
          )}

          {/* Users selector — dropdown */}
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: selectedBank ? 20 : 12 }]}>
            SELECT USERS
          </Text>
          {users.length === 0 ? (
            <Text style={[styles.noData, { color: colors.mutedForeground }]}>
              No users yet — add users in the Users tab.
            </Text>
          ) : filteredUsers.length === 0 ? (
            <Text style={[styles.noData, { color: colors.mutedForeground }]}>
              All users have already applied for this IPO.
            </Text>
          ) : (
            <TouchableOpacity
              onPress={() => setShowUserPicker(true)}
              style={[
                styles.selector,
                {
                  borderColor: selectedUserIds.size > 0 ? colors.primary : colors.border,
                  backgroundColor: colors.surface,
                  marginBottom: 0,
                },
              ]}
            >
              <View style={styles.selectorInner}>
                {selectedUserIds.size > 0 ? (
                  <View style={[styles.bankDot, { backgroundColor: colors.primary }]} />
                ) : (
                  <Feather name="users" size={14} color={colors.mutedForeground} />
                )}
                <Text
                  style={[styles.selectorText, { color: selectedUserIds.size > 0 ? colors.foreground : colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {selectedUserIds.size === 0
                    ? 'Tap to select users…'
                    : selectedUserIds.size === filteredUsers.length
                    ? `All ${filteredUsers.length} users selected`
                    : `${selectedUserIds.size} of ${filteredUsers.length} user${selectedUserIds.size !== 1 ? 's' : ''} selected`}
                </Text>
              </View>
              <Feather name="chevron-down" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleBulkCreate}
            disabled={bulkLoading || !bulkIPOId || selectedUserIds.size === 0}
            style={[styles.primaryBtn, { marginTop: 16, overflow: 'hidden', opacity: bulkLoading || !bulkIPOId || selectedUserIds.size === 0 ? 0.4 : 1 }]}
          >
            <LinearGradient colors={[colors.primary, colors.primaryLight]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            <Feather name="zap" size={15} color="#fff" />
            <Text style={styles.primaryBtnText}>
              {bulkLoading ? 'Creating…' : `Create Applications${selectedUserIds.size > 0 ? ` (${selectedUserIds.size})` : ''}`}
            </Text>
          </TouchableOpacity>
        </SectionCard>

        {/* ── Quick Status ── */}
        <SectionCard title="Quick Status Switcher" icon="toggle-left">
          <Text style={[styles.desc, { color: colors.mutedForeground }]}>
            Mark Applied IPOs as Allotted or Not Allotted once results are announced.
          </Text>

          {appliedApps.length === 0 ? (
            <View style={[styles.emptySmall, { backgroundColor: colors.surface }]}>
              <Feather name="check-circle" size={24} color={colors.mutedForeground} />
              <Text style={[styles.emptySmallText, { color: colors.mutedForeground }]}>No pending applications</Text>
            </View>
          ) : (
            appliedApps.map((app, idx) => (
              <View
                key={app.id}
                style={[styles.quickRow, { borderBottomColor: colors.border }, idx === appliedApps.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={styles.quickLeft}>
                  <Text style={[styles.quickTitle, { color: colors.foreground }]}>{app.user_name}</Text>
                  <Text style={[styles.quickSub, { color: colors.mutedForeground }]}>
                    {app.ipo_name} · {formatCurrency(app.buy_price * app.quantity)}
                  </Text>
                </View>
                <View style={styles.quickBtns}>
                  <TouchableOpacity onPress={() => handleQuickStatus(app, 'Allotted')} style={[styles.quickBtn, { backgroundColor: colors.statusAllottedBg }]}>
                    <Feather name="check" size={16} color={colors.statusAllotted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleQuickStatus(app, 'Not Allotted')} style={[styles.quickBtn, { backgroundColor: colors.statusNotAllottedBg }]}>
                    <Feather name="x" size={16} color={colors.statusNotAllotted} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </SectionCard>
      </ScrollView>

      {/* ── Modals ── */}

      {/* IPO Picker */}
      <Modal visible={showIPOPicker} transparent animationType="slide" onRequestClose={() => setShowIPOPicker(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setShowIPOPicker(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.background, borderTopColor: colors.border }]} onPress={() => {}}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.pickerSheetTitle, { color: colors.foreground, borderBottomColor: colors.border }]}>Select IPO</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {activeIPOs.length === 0 ? (
                <Text style={[styles.noData, { color: colors.mutedForeground, padding: 24 }]}>No active IPOs added yet.</Text>
              ) : (
                activeIPOs.map((ipo) => (
                  <TouchableOpacity
                    key={ipo.id}
                    onPress={() => { setBulkIPOId(ipo.id); setShowIPOPicker(false); }}
                    style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: bulkIPOId === ipo.id ? colors.surface : 'transparent' }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerRowName, { color: colors.foreground }]}>{ipo.ipo_name}</Text>
                      <Text style={[styles.pickerRowSub, { color: colors.mutedForeground }]}>
                        {formatCurrency(ipo.buy_price)} × {ipo.quantity} = {formatCurrency(ipo.buy_price * ipo.quantity)}
                      </Text>
                    </View>
                    {bulkIPOId === ipo.id && <Feather name="check" size={16} color={colors.primary} />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Bank Picker */}
      <Modal visible={showBankPicker} transparent animationType="slide" onRequestClose={() => setShowBankPicker(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setShowBankPicker(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.background, borderTopColor: colors.border }]} onPress={() => {}}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.pickerSheetTitle, { color: colors.foreground, borderBottomColor: colors.border }]}>Select Bank</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {bankAccounts.length === 0 ? (
                <Text style={[styles.noData, { color: colors.mutedForeground, padding: 24 }]}>
                  No bank accounts added yet — go to the Banks tab.
                </Text>
              ) : (
                bankAccounts.map((bank) => {
                  const blocked = applications
                    .filter((a) => (a.status === 'Applied' || a.status === 'Allotted') && a.user_bank_name === bank.bank_name)
                    .reduce((s, a) => s + a.buy_price * a.quantity, 0);
                  const available = Math.max(0, bank.balance - blocked);
                  const appliedCount = applications.filter(
                    (a) => a.status === 'Applied' && a.user_bank_name === bank.bank_name
                  ).length;
                  const ipoCost = selectedIPO ? (selectedIPO.buy_price * selectedIPO.quantity) : 15000;
                  const canApplyCount = Math.floor(available / ipoCost);

                  return (
                    <TouchableOpacity
                      key={bank.id}
                      onPress={() => handleBankSelect(bank.bank_name)}
                      style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: bulkBankName === bank.bank_name ? colors.surface : 'transparent' }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pickerRowName, { color: colors.foreground }]}>{bank.bank_name}</Text>
                        <Text style={[styles.pickerRowSub, { color: colors.mutedForeground }]}>
                          Available {formatCurrency(available)} · {appliedCount} Applied · {canApplyCount} can be applied
                        </Text>
                      </View>
                      {bulkBankName === bank.bank_name && <Feather name="check" size={16} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* UPI App Picker */}
      <Modal visible={showUPIPicker} transparent animationType="slide" onRequestClose={() => setShowUPIPicker(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setShowUPIPicker(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.background, borderTopColor: colors.border }]} onPress={() => {}}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.pickerSheetTitle, { color: colors.foreground, borderBottomColor: colors.border }]}>Select UPI App / ASBA</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {UPI_APPS.map((app) => (
                <TouchableOpacity
                  key={app}
                  onPress={() => handleUPISelect(app)}
                  style={[
                    styles.pickerRow,
                    {
                      borderBottomColor: colors.border,
                      backgroundColor: bulkUPIApp === app ? colors.surface : 'transparent',
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickerRowName, { color: colors.foreground }]}>{app}</Text>
                  </View>
                  {bulkUPIApp === app && <Feather name="check" size={16} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* User Picker */}
      <Modal visible={showUserPicker} transparent animationType="slide" onRequestClose={() => setShowUserPicker(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setShowUserPicker(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.background, borderTopColor: colors.border }]} onPress={() => {}}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
            {/* Header row with title + select-all */}
            <View style={[styles.pickerHeaderRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerSheetTitleInline, { color: colors.foreground }]}>Select Users</Text>
              <TouchableOpacity
                onPress={() =>
                  setSelectedUserIds(
                    selectedUserIds.size === filteredUsers.length
                      ? new Set()
                      : new Set(filteredUsers.map((u) => u.id))
                  )
                }
                style={[styles.selectAllBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.selectAllBtnText, { color: colors.primary }]}>
                  {selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0
                    ? 'Deselect All'
                    : 'Select All'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {filteredUsers.map((u) => {
                const isSelected = selectedUserIds.has(u.id);
                const perAccountBlock = selectedIPO ? selectedIPO.buy_price * selectedIPO.quantity : null;
                return (
                  <TouchableOpacity
                    key={u.id}
                    onPress={() => toggleUser(u.id)}
                    style={[
                      styles.pickerRow,
                      {
                        borderBottomColor: colors.border,
                        backgroundColor: isSelected ? colors.primary + '0E' : 'transparent',
                      },
                    ]}
                  >
                    {/* Checkbox */}
                    <View style={[
                      styles.checkbox,
                      {
                        borderColor: isSelected ? colors.primary : colors.mutedForeground,
                        backgroundColor: isSelected ? colors.primary : 'transparent',
                      },
                    ]}>
                      {isSelected && <Feather name="check" size={11} color="#fff" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerRowName, { color: colors.foreground }]}>{u.name}</Text>
                      <Text style={[styles.pickerRowSub, { color: colors.mutedForeground }]}>
                        {u.broker || 'No broker'}
                      </Text>
                    </View>
                    {perAccountBlock && isSelected && (
                      <Text style={[styles.userBlockAmt, { color: colors.negative }]}>
                        −{formatCurrency(perAccountBlock)}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Done button */}
            <View style={[styles.pickerDoneWrap, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => setShowUserPicker(false)}
                style={[styles.pickerDoneBtn, { overflow: 'hidden' }]}
              >
                <LinearGradient
                  colors={[colors.primary, colors.primaryLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.pickerDoneBtnText}>
                  {selectedUserIds.size === 0
                    ? 'Done'
                    : `Done — ${selectedUserIds.size} user${selectedUserIds.size !== 1 ? 's' : ''} selected`}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, overflow: 'hidden', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headerGlow: { position: 'absolute', right: 0, top: 0, width: 200, height: 130 },
  headerEyebrow: { fontSize: 11, fontFamily: 'DMSans_600SemiBold', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 },
  headerTitle: { fontSize: 30, fontFamily: 'DMSans_700Bold', letterSpacing: -0.8, lineHeight: 34 },
  desc: { fontSize: 13, fontFamily: 'DMSans_400Regular', marginBottom: 16, lineHeight: 20 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, paddingVertical: 14 },
  primaryBtnText: { color: '#fff', fontSize: 14, fontFamily: 'DMSans_700Bold', letterSpacing: 0.1 },

  // IPO nav card
  ipoNavCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  ipoNavIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ipoNavText: { flex: 1 },
  ipoNavLabel: { fontSize: 10, fontFamily: 'DMSans_600SemiBold', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  ipoNavCount: { fontSize: 22, fontFamily: 'DMSans_700Bold', letterSpacing: -0.4 },

  // Bulk apply
  fieldLabel: { fontSize: 10, fontFamily: 'DMSans_600SemiBold', letterSpacing: 0.9, marginBottom: 8, textTransform: 'uppercase' },
  selector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 20 },
  selectorInner: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
  selectorText: { fontSize: 14, fontFamily: 'DMSans_400Regular', flex: 1 },
  bankDot: { width: 8, height: 8, borderRadius: 4 },

  // Balance impact
  balanceCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginTop: 10,
    marginBottom: 6,
    gap: 9,
  },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceKey: { fontSize: 12, fontFamily: 'DMSans_400Regular' },
  balanceVal: { fontSize: 13, fontFamily: 'DMSans_600SemiBold' },
  balanceSep: { height: 1, marginVertical: 2 },

  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  userBlockAmt: { fontSize: 12, fontFamily: 'DMSans_600SemiBold' },
  pickerHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  pickerSheetTitleInline: { fontSize: 17, fontFamily: 'DMSans_700Bold', letterSpacing: -0.3 },
  selectAllBtn: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  selectAllBtnText: { fontSize: 13, fontFamily: 'DMSans_500Medium' },
  pickerDoneWrap: { padding: 16, borderTopWidth: 1 },
  pickerDoneBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  pickerDoneBtnText: { color: '#fff', fontSize: 14, fontFamily: 'DMSans_700Bold', letterSpacing: 0.1 },
  noData: { fontSize: 13, fontFamily: 'DMSans_400Regular', fontStyle: 'italic' },
  emptySmall: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 12 },
  emptySmallText: { fontSize: 13, fontFamily: 'DMSans_400Regular' },

  quickRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1 },
  quickLeft: { flex: 1 },
  quickTitle: { fontSize: 14, fontFamily: 'DMSans_600SemiBold' },
  quickSub: { fontSize: 12, fontFamily: 'DMSans_400Regular', marginTop: 2 },
  quickBtns: { flexDirection: 'row', gap: 8 },
  quickBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  // Modals
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: 520, borderTopWidth: 1 },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  pickerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  pickerRowTitle: { fontSize: 17, fontFamily: 'DMSans_700Bold', letterSpacing: -0.3 },
  pickerSheetTitle: { fontSize: 17, fontFamily: 'DMSans_700Bold', padding: 20, paddingBottom: 14, borderBottomWidth: 1, letterSpacing: -0.3 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, gap: 12 },
  pickerRowName: { fontSize: 15, fontFamily: 'DMSans_500Medium' },
  pickerRowSub: { fontSize: 12, fontFamily: 'DMSans_400Regular', marginTop: 2 },

});
