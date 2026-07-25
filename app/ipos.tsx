import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDB, type IPOListing } from '@/context/DBContext';
import { AddIPOModal } from '@/components/AddIPOModal';
import { formatCurrency } from '@/utils/formatters';

// ── Date helpers ──────────────────────────────────────────────────────────────

function isoToDate(iso: string): Date {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date() : d;
}
function dateToISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

type DateField = 'openDate' | 'closeDate' | 'listingDate' | 'allotmentDate';

type EditModalProps = {
  ipo: IPOListing | null;
  onClose: () => void;
};

function EditIPOModal({ ipo, onClose }: EditModalProps) {
  const colors = useColors();
  const { updateIPO } = useDB();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(ipo?.ipo_name ?? '');
  const [price, setPrice] = useState(String(ipo?.buy_price ?? ''));
  const [qty, setQty] = useState(String(ipo?.quantity ?? ''));
  const [openDate, setOpenDate] = useState(ipo?.open_date ?? '');
  const [closeDate, setCloseDate] = useState(ipo?.close_date ?? '');
  const [listingDate, setListingDate] = useState(ipo?.listing_date ?? '');
  const [allotmentDate, setAllotmentDate] = useState(ipo?.allotment_date ?? '');
  const [registrar, setRegistrar] = useState(ipo?.registrar ?? '');
  const [exchange, setExchange] = useState(ipo?.exchange ?? '');
  const [issueType, setIssueType] = useState(ipo?.issue_type ?? 'Mainboard');
  const [saving, setSaving] = useState(false);
  const [pickerField, setPickerField] = useState<DateField | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Re-seed state when ipo changes (modal re-opens with different item)
  React.useEffect(() => {
    if (ipo) {
      setName(ipo.ipo_name);
      setPrice(String(ipo.buy_price));
      setQty(String(ipo.quantity));
      setOpenDate(ipo.open_date);
      setCloseDate(ipo.close_date);
      setListingDate(ipo.listing_date);
      setAllotmentDate(ipo.allotment_date ?? '');
      setRegistrar(ipo.registrar ?? '');
      setExchange(ipo.exchange ?? '');
      setIssueType(ipo.issue_type ?? 'Mainboard');
    }
  }, [ipo]);

  const handleSave = async () => {
    if (!ipo) return;
    if (!name.trim() || !price || !qty) {
      Alert.alert('Required', 'Please fill in IPO name, cut-off price, and lot size.');
      return;
    }
    const parsedPrice = parseFloat(price);
    const parsedQty = parseInt(qty, 10);
    if (isNaN(parsedPrice) || parsedPrice <= 0) { Alert.alert('Invalid', 'Enter a valid cut-off price.'); return; }
    if (isNaN(parsedQty) || parsedQty <= 0) { Alert.alert('Invalid', 'Enter a valid lot size.'); return; }

    setSaving(true);
    try {
      await updateIPO(ipo.id, {
        ipo_name: name.trim(),
        buy_price: parsedPrice,
        quantity: parsedQty,
        open_date: openDate,
        close_date: closeDate,
        listing_date: listingDate,
        allotment_date: allotmentDate,
        registrar: registrar.trim(),
        exchange: exchange.trim(),
        issue_type: issueType,
        archived: ipo.archived,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch {
      Alert.alert('Error', 'Failed to update IPO. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const getDateValue = (field: DateField): string => {
    if (field === 'openDate') return openDate;
    if (field === 'closeDate') return closeDate;
    if (field === 'listingDate') return listingDate;
    return allotmentDate;
  };

  const onDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'dismissed') { setShowPicker(false); return; }
    if (!selected || !pickerField) return;
    const iso = dateToISO(selected);
    if (pickerField === 'openDate') setOpenDate(iso);
    else if (pickerField === 'closeDate') setCloseDate(iso);
    else if (pickerField === 'listingDate') setListingDate(iso);
    else setAllotmentDate(iso);
    if (Platform.OS === 'ios') setShowPicker(false);
  };

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const previewBuyValue = price && qty ? parseFloat(price) * parseInt(qty, 10) : null;

  const dateFields: { label: string; field: DateField; value: string }[] = [
    { label: 'Open Date', field: 'openDate', value: openDate },
    { label: 'Close Date', field: 'closeDate', value: closeDate },
    { label: 'Allotment Date', field: 'allotmentDate', value: allotmentDate },
    { label: 'Listing Date', field: 'listingDate', value: listingDate },
  ];

  return (
    <Modal visible={!!ipo} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[em.flex, { backgroundColor: colors.background }]} behavior="height">
        {/* Header */}
        <View style={[em.header, { paddingTop: topPad + 14, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
          <TouchableOpacity onPress={onClose} style={[em.headerIcon, { backgroundColor: colors.surface }]} hitSlop={8}>
            <Feather name="x" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[em.headerTitle, { color: colors.foreground }]}>Edit IPO</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={[em.saveChip, { backgroundColor: saving ? colors.muted : colors.primary }]}
          >
            <Text style={[em.saveBtnText, { color: saving ? colors.mutedForeground : '#fff' }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[em.form, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Text fields */}
          {[
            { label: 'IPO / Company Name *', value: name, setter: setName, placeholder: 'e.g. Advit Jewels', autoCapitalize: 'words' as const },
            { label: 'Cut-off Price (₹) *', value: price, setter: setPrice, placeholder: 'e.g. 56', numeric: true },
            { label: 'Lot Size (Qty) *', value: qty, setter: setQty, placeholder: 'e.g. 2000', numeric: true },
          ].map(({ label, value, setter, placeholder, autoCapitalize, numeric }) => (
            <View key={label} style={em.field}>
              <Text style={[em.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
              <TextInput
                style={[em.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
                value={value}
                onChangeText={setter}
                placeholder={placeholder}
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize={autoCapitalize ?? 'none'}
                keyboardType={numeric ? 'decimal-pad' : 'default'}
              />
            </View>
          ))}

          {/* Registrar */}
          <View style={em.field}>
            <Text style={[em.fieldLabel, { color: colors.mutedForeground }]}>Registrar</Text>
            <TextInput
              style={[em.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
              value={registrar}
              onChangeText={setRegistrar}
              placeholder="e.g. KFin Technologies Limited"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
            />
          </View>

          {/* Exchange */}
          <View style={em.field}>
            <Text style={[em.fieldLabel, { color: colors.mutedForeground }]}>Exchange</Text>
            <TextInput
              style={[em.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
              value={exchange}
              onChangeText={setExchange}
              placeholder="e.g. BSE SME"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
            />
          </View>

          {/* Issue Type */}
          <View style={em.field}>
            <Text style={[em.fieldLabel, { color: colors.mutedForeground }]}>Issue Type</Text>
            <View style={em.issueTypeContainer}>
              {['Mainboard', 'SME'].map((t) => {
                const active = issueType === t;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setIssueType(t)}
                    style={[
                      em.typePill,
                      {
                        backgroundColor: active ? colors.primary : colors.surface,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[em.typePillText, { color: active ? '#fff' : colors.foreground }]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Date fields */}
          {dateFields.map(({ label, field, value }) => (
            <View key={field} style={em.field}>
              <Text style={[em.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
              <TouchableOpacity
                onPress={() => { setPickerField(field); setShowPicker(true); }}
                style={[em.dateRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
                activeOpacity={0.7}
              >
                <Text style={[em.dateText, { color: value ? colors.foreground : colors.mutedForeground }]}>
                  {value || 'Select date'}
                </Text>
                <Feather name="calendar" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
          ))}

          {previewBuyValue != null && !isNaN(previewBuyValue) && previewBuyValue > 0 && (
            <View style={[em.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[em.previewLabel, { color: colors.mutedForeground }]}>Buy value per person</Text>
              <Text style={[em.previewValue, { color: colors.primary }]}>{formatCurrency(previewBuyValue)}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {showPicker && pickerField && (
        <DateTimePicker
          value={isoToDate(getDateValue(pickerField))}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDateChange}
        />
      )}
    </Modal>
  );
}

// ── IPO Card ──────────────────────────────────────────────────────────────────

type IPOCardProps = {
  ipo: IPOListing;
  applicationCount: number;
  onEdit: () => void;
  onUnarchive?: () => void;
  onToggleFavorite: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
};

function IPOCard({ ipo, applicationCount, onEdit, onUnarchive, onToggleFavorite, onArchive, onDelete }: IPOCardProps) {
  const colors = useColors();
  const lotValue = ipo.buy_price * ipo.quantity;
  const isFav = ipo.is_favorite === 1;

  return (
    <View style={[card.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Top row */}
      <View style={card.topRow}>
        <View style={[card.iconWrap, { backgroundColor: colors.primary + '18' }]}>
          <Feather name="trending-up" size={15} color={colors.primary} />
        </View>
        <View style={card.titleWrap}>
          <Text style={[card.name, { color: colors.foreground }]} numberOfLines={1}>{ipo.ipo_name}</Text>
          <Text style={[card.sub, { color: colors.mutedForeground }]}>
            ₹{ipo.buy_price} × {ipo.quantity} lot · {applicationCount} application{applicationCount !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={card.rightCluster}>
          {/* Favourite star */}
          <TouchableOpacity onPress={onToggleFavorite} hitSlop={10} style={card.starBtn}>
            <Feather
              name="star"
              size={16}
              color={isFav ? colors.primary : colors.border}
            />
          </TouchableOpacity>
          <Text style={[card.value, { color: colors.primary }]}>{formatCurrency(lotValue)}</Text>
        </View>
      </View>

      {/* Date chips */}
      {(ipo.open_date || ipo.close_date || ipo.listing_date) && (
        <View style={card.dates}>
          {ipo.open_date ? (
            <View style={[card.chip, { backgroundColor: colors.surface }]}>
              <Text style={[card.chipLabel, { color: colors.mutedForeground }]}>Open</Text>
              <Text style={[card.chipVal, { color: colors.foreground }]}>{ipo.open_date}</Text>
            </View>
          ) : null}
          {ipo.close_date ? (
            <View style={[card.chip, { backgroundColor: colors.surface }]}>
              <Text style={[card.chipLabel, { color: colors.mutedForeground }]}>Close</Text>
              <Text style={[card.chipVal, { color: colors.foreground }]}>{ipo.close_date}</Text>
            </View>
          ) : null}
          {ipo.listing_date ? (
            <View style={[card.chip, { backgroundColor: colors.surface }]}>
              <Text style={[card.chipLabel, { color: colors.mutedForeground }]}>Lists</Text>
              <Text style={[card.chipVal, { color: colors.foreground }]}>{ipo.listing_date}</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Actions */}
      <View style={[card.actions, { borderTopColor: colors.border }]}>
        {ipo.archived === 1 ? (
          <TouchableOpacity onPress={onUnarchive} style={[card.actionBtn, { backgroundColor: colors.primary + '12' }]}>
            <Feather name="rotate-ccw" size={14} color={colors.primary} />
            <Text style={[card.actionLabel, { color: colors.primary }]}>Unarchive</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onEdit} style={[card.actionBtn, { backgroundColor: colors.primary + '12' }]}>
            <Feather name="edit-2" size={14} color={colors.primary} />
            <Text style={[card.actionLabel, { color: colors.primary }]}>Edit</Text>
          </TouchableOpacity>
        )}
        {onArchive ? (
          <TouchableOpacity onPress={onArchive} style={[card.actionBtn, { backgroundColor: colors.primary + '12' }]}>
            <Feather name="archive" size={14} color={colors.primary} />
            <Text style={[card.actionLabel, { color: colors.primary }]}>Archive</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onDelete} style={[card.actionBtn, { backgroundColor: colors.negative + '12' }]}>
            <Feather name="trash-2" size={14} color={colors.negative} />
            <Text style={[card.actionLabel, { color: colors.negative }]}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const card = StyleSheet.create({
  container: { marginHorizontal: 16, marginBottom: 12, borderRadius: 20, borderWidth: 1, padding: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1 },
  name: { fontSize: 15, fontFamily: 'DMSans_700Bold', letterSpacing: -0.2 },
  sub: { fontSize: 12, fontFamily: 'DMSans_400Regular', marginTop: 2 },
  rightCluster: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  starBtn: { padding: 2 },
  value: { fontSize: 15, fontFamily: 'DMSans_700Bold', letterSpacing: -0.3 },
  dates: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  chip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chipLabel: { fontSize: 9, fontFamily: 'DMSans_600SemiBold', letterSpacing: 0.6, textTransform: 'uppercase' },
  chipVal: { fontSize: 12, fontFamily: 'DMSans_500Medium', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12 },
  actionLabel: { fontSize: 13, fontFamily: 'DMSans_600SemiBold' },
});

// ── Screen ────────────────────────────────────────────────────────────────────

type IPOTab = 'active' | 'favorites' | 'archived';

const IPO_TABS: { key: IPOTab; label: string }[] = [
  { key: 'active',    label: 'Active' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'archived',  label: 'Archived' },
];

export default function IPOsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { ipos, applications, archiveIPO, unarchiveIPO, deleteIPO, toggleIPOFavorite } = useDB();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [editingIPO, setEditingIPO] = useState<IPOListing | null>(null);
  const [showAddIPO, setShowAddIPO] = useState(false);
  const [activeTab, setActiveTab] = useState<IPOTab>('active');

  // Count applications per IPO
  const appCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of applications) {
      m.set(a.ipo_id, (m.get(a.ipo_id) ?? 0) + 1);
    }
    return m;
  }, [applications]);

  // Split IPOs by status
  const { activeIPOs, archivedIPOs, favoritedIPOs } = useMemo(() => {
    const active: IPOListing[] = [];
    const archived: IPOListing[] = [];
    const favorited: IPOListing[] = [];
    for (const ipo of ipos) {
      if (ipo.archived === 1) archived.push(ipo);
      else active.push(ipo);
      if (ipo.is_favorite === 1) favorited.push(ipo);
    }
    return { activeIPOs: active, archivedIPOs: archived, favoritedIPOs: favorited };
  }, [ipos]);

  const displayedIPOs =
    activeTab === 'active'    ? activeIPOs :
    activeTab === 'favorites' ? favoritedIPOs :
    archivedIPOs;

  const countFor = (tab: IPOTab) => {
    if (tab === 'active')    return activeIPOs.length;
    if (tab === 'favorites') return favoritedIPOs.length;
    return archivedIPOs.length;
  };

  const handleArchive = (ipo: IPOListing) => {
    const doArchive = async () => {
      await archiveIPO(ipo.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };
    if (Platform.OS === 'web') {
      if ((globalThis as any).confirm?.(`Archive "${ipo.ipo_name}"? It will be moved to the Archived tab.`)) doArchive();
    } else {
      Alert.alert(
        `Archive "${ipo.ipo_name}"?`,
        'It will be moved to the Archived tab and kept for records.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Archive', onPress: doArchive },
        ],
      );
    }
  };

  const handleUnarchive = (ipo: IPOListing) => {
    const doUnarchive = async () => {
      await unarchiveIPO(ipo.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };
    if (Platform.OS === 'web') {
      if ((globalThis as any).confirm?.(`Unarchive "${ipo.ipo_name}"? It will be moved to the Active tab.`)) doUnarchive();
    } else {
      Alert.alert(
        `Unarchive "${ipo.ipo_name}"?`,
        'It will be moved to the Active tab and can be edited.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Unarchive', onPress: doUnarchive },
        ],
      );
    }
  };

  const handleDelete = (ipo: IPOListing) => {
    const count = appCountMap.get(ipo.id) ?? 0;
    const doDelete = async () => {
      await deleteIPO(ipo.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    };
    if (Platform.OS === 'web') {
      const msg = count > 0
        ? `Delete "${ipo.ipo_name}" and ${count} linked application${count !== 1 ? 's' : ''}? This cannot be undone.`
        : `Delete "${ipo.ipo_name}"? This cannot be undone.`;
      if ((globalThis as any).confirm?.(msg)) doDelete();
    } else {
      const message = count > 0
        ? `This will also delete ${count} linked application${count !== 1 ? 's' : ''}. This cannot be undone.`
        : 'This cannot be undone.';
      Alert.alert(`Delete "${ipo.ipo_name}"?`, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
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
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} hitSlop={8}>
          <Feather name="chevron-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>Manage</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>IPO Listings</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowAddIPO(true)}
          style={[styles.addBtn, { overflow: 'hidden', borderColor: colors.primaryLight }]}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Feather name="plus" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tabs: Active / Favorites / Archived */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        {IPO_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = countFor(tab.key);
          const isFavTab = tab.key === 'favorites';
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tabItem, isActive && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            >
              {isFavTab && (
                <Feather name="star" size={13} color={isActive ? colors.primary : colors.mutedForeground} />
              )}
              <Text style={[styles.tabLabel, { color: isActive ? colors.primary : colors.mutedForeground }]}>
                {tab.label}
              </Text>
              <View style={[styles.tabBadge, { backgroundColor: isActive ? colors.primary + '18' : colors.surface }]}>
                <Text style={[styles.tabBadgeText, { color: isActive ? colors.primary : colors.mutedForeground }]}>
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={displayedIPOs}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <IPOCard
            ipo={item}
            applicationCount={appCountMap.get(item.id) ?? 0}
            onEdit={() => setEditingIPO(item)}
            onUnarchive={() => handleUnarchive(item)}
            onToggleFavorite={() => toggleIPOFavorite(item.id, item.is_favorite !== 1)}
            onArchive={item.archived === 0 ? () => handleArchive(item) : undefined}
            onDelete={item.archived === 1 ? () => handleDelete(item) : undefined}
          />
        )}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={() =>
          displayedIPOs.length > 0 ? (
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {displayedIPOs.length} {displayedIPOs.length === 1 ? 'listing' : 'listings'}
            </Text>
          ) : null
        }
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
              <Feather
                name={activeTab === 'favorites' ? 'star' : activeTab === 'active' ? 'trending-up' : 'archive'}
                size={28}
                color={colors.mutedForeground}
              />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {activeTab === 'active'    ? 'No Active IPOs' :
               activeTab === 'favorites' ? 'No Favourites Yet' :
               'No Archived IPOs'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {activeTab === 'active'
                ? 'Tap the + button to add your first IPO listing.'
                : activeTab === 'favorites'
                ? 'Tap the ★ star on any IPO card to mark it as a favourite.'
                : 'IPOs whose listing date has passed will appear here.'}
            </Text>
            {activeTab === 'active' && (
              <TouchableOpacity
                onPress={() => setShowAddIPO(true)}
                style={[styles.emptyBtn, { overflow: 'hidden' }]}
              >
                <LinearGradient
                  colors={[colors.primary, colors.primaryLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <Feather name="plus" size={16} color="#fff" />
                <Text style={styles.emptyBtnText}>Add First IPO</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      <EditIPOModal ipo={editingIPO} onClose={() => setEditingIPO(null)} />
      <AddIPOModal visible={showAddIPO} onClose={() => setShowAddIPO(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  headerGlow: { position: 'absolute', right: 0, top: 0, width: 200, height: 130 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  headerText: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerEyebrow: { fontSize: 11, fontFamily: 'DMSans_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 3, textAlign: 'center' },
  headerTitle: { fontSize: 28, fontFamily: 'DMSans_700Bold', letterSpacing: -0.6, lineHeight: 32, textAlign: 'center' },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 20,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 13,
    marginRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: { fontSize: 14, fontFamily: 'DMSans_600SemiBold' },
  tabBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  tabBadgeText: { fontSize: 12, fontFamily: 'DMSans_700Bold' },

  sectionLabel: {
    fontSize: 11,
    fontFamily: 'DMSans_500Medium',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },

  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 36 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontFamily: 'DMSans_700Bold', letterSpacing: -0.3, marginBottom: 8 },
  emptyText: { fontSize: 14, fontFamily: 'DMSans_400Regular', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 14 },
  emptyBtnText: { color: '#fff', fontSize: 15, fontFamily: 'DMSans_600SemiBold' },
});

// Edit modal styles
const em = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'DMSans_700Bold', letterSpacing: -0.2 },
  saveChip: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20 },
  saveBtnText: { fontSize: 14, fontFamily: 'DMSans_600SemiBold' },
  form: { paddingHorizontal: 20, paddingTop: 24 },
  field: { marginBottom: 20 },
  fieldLabel: { fontSize: 10, fontFamily: 'DMSans_600SemiBold', marginBottom: 8, letterSpacing: 0.8, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, fontFamily: 'DMSans_400Regular' },
  issueTypeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  typePill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typePillText: {
    fontSize: 14,
    fontFamily: 'DMSans_600SemiBold',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  dateText: { fontSize: 15, fontFamily: 'DMSans_400Regular' },
  preview: { borderRadius: 16, padding: 20, marginTop: 4, alignItems: 'center', gap: 6, borderWidth: 1 },
  previewLabel: { fontSize: 11, fontFamily: 'DMSans_500Medium', letterSpacing: 0.3 },
  previewValue: { fontSize: 28, fontFamily: 'PlayfairDisplay_700Bold', letterSpacing: -0.8 },
});
