import React, { useState } from 'react';
import {
  Alert,
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
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/context/DialogContext';
import { useDB } from '@/context/DBContext';
import { formatCurrency, todayISO } from '@/utils/formatters';
import { fetchIPODetails } from '@workspace/api-client-react';

type Props = { visible: boolean; onClose: () => void };

type DateField = 'openDate' | 'closeDate' | 'listingDate' | 'allotmentDate';

function isoToDate(iso: string): Date {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date() : d;
}

function dateToISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function AddIPOModal({ visible, onClose }: Props) {
  const colors = useColors();
  const { addIPO } = useDB();
  const insets = useSafeAreaInsets();
  const today = todayISO();

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');
  const [openDate, setOpenDate] = useState(today);
  const [closeDate, setCloseDate] = useState('');
  const [listingDate, setListingDate] = useState('');
  const [allotmentDate, setAllotmentDate] = useState('');
  const [registrar, setRegistrar] = useState('');
  const [exchange, setExchange] = useState('');
  const [issueType, setIssueType] = useState('Mainboard');
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);

  // Date picker state
  const [pickerField, setPickerField] = useState<DateField | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const resetForm = () => {
    setName(''); setPrice(''); setQty('');
    setOpenDate(today); setCloseDate(''); setListingDate(''); setAllotmentDate('');
    setRegistrar(''); setExchange(''); setIssueType('Mainboard');
  };

  const { showError } = useDialog();

  const handleFetchDetails = async () => {
    if (!name.trim()) {
      showError('Required', 'Please enter an IPO / Company Name first.');
      return;
    }
    setFetching(true);
    try {
      const data = await fetchIPODetails({ name: name.trim() });
      if (data) {
        if (data.ipo_name) setName(data.ipo_name);
        if (data.buy_price) setPrice(String(data.buy_price));
        if (data.quantity) setQty(String(data.quantity));
        if (data.open_date) setOpenDate(data.open_date);
        if (data.close_date) setCloseDate(data.close_date);
        if (data.listing_date) setListingDate(data.listing_date);
        if (data.allotment_date) setAllotmentDate(data.allotment_date);
        if (data.registrar) setRegistrar(data.registrar);
        if (data.exchange) setExchange(data.exchange);
        if (data.issue_type) setIssueType(data.issue_type);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      console.error(err);
      showError('Fetch Failed', err?.message || 'Could not fetch details. You can still enter them manually.');
    } finally {
      setFetching(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !price || !qty) {
      showError('Required', 'Please fill in IPO name, cut-off price, and lot size.');
      return;
    }
    const parsedPrice = parseFloat(price);
    const parsedQty = parseInt(qty, 10);
    if (isNaN(parsedPrice) || parsedPrice <= 0) { showError('Invalid', 'Enter a valid cut-off price.'); return; }
    if (isNaN(parsedQty) || parsedQty <= 0) { showError('Invalid', 'Enter a valid lot size.'); return; }

    setSaving(true);
    try {
      await addIPO({
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
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetForm();
      onClose();
    } catch {
      showError('Error', 'Failed to add IPO. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const openDatePicker = (field: DateField) => {
    setPickerField(field);
    setShowPicker(true);
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

  const previewBuyValue = price && qty ? parseFloat(price) * parseInt(qty, 10) : null;

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const dateFields: { label: string; field: DateField; value: string }[] = [
    { label: 'Open Date', field: 'openDate', value: openDate },
    { label: 'Close Date', field: 'closeDate', value: closeDate },
    { label: 'Allotment Date', field: 'allotmentDate', value: allotmentDate },
    { label: 'Listing Date', field: 'listingDate', value: listingDate },
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior="height">
        {/* Header */}
        <View style={[styles.header, { paddingTop: topPad + 14, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
          <TouchableOpacity onPress={onClose} style={[styles.headerIcon, { backgroundColor: colors.surface }]} hitSlop={8}>
            <Feather name="x" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Add IPO Listing</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} style={[styles.saveChip, { backgroundColor: saving ? colors.muted : colors.primary }]}>
            <Text style={[styles.saveBtnText, { color: saving ? colors.mutedForeground : '#fff' }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          {/* IPO Name */}
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>IPO / Company Name *</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Advit Jewels"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
            />
          </View>

          {/* Fetch Details Button */}
          <TouchableOpacity
            onPress={handleFetchDetails}
            disabled={fetching}
            style={[
              styles.fetchBtn,
              {
                backgroundColor: colors.surface,
                borderColor: colors.primary,
              },
            ]}
          >
            <Feather name="search" size={14} color={colors.primary} />
            <Text style={[styles.fetchBtnText, { color: colors.primary }]}>
              {fetching ? 'Fetching Details…' : 'Fetch Details'}
            </Text>
          </TouchableOpacity>

          {/* Numeric fields */}
          {[
            { label: 'Cut-off Price (₹) *', value: price, setter: setPrice, placeholder: 'e.g. 56', numeric: true },
            { label: 'Lot Size (Qty) *', value: qty, setter: setQty, placeholder: 'e.g. 2000', numeric: true },
          ].map(({ label, value, setter, placeholder, numeric }) => (
            <View key={label} style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
                value={value}
                onChangeText={setter}
                placeholder={placeholder}
                placeholderTextColor={colors.mutedForeground}
                keyboardType={numeric ? 'decimal-pad' : 'default'}
              />
            </View>
          ))}

          {/* Registrar */}
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Registrar</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
              value={registrar}
              onChangeText={setRegistrar}
              placeholder="e.g. KFin Technologies Limited"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
            />
          </View>

          {/* Exchange */}
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Exchange</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.foreground }]}
              value={exchange}
              onChangeText={setExchange}
              placeholder="e.g. BSE SME"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
            />
          </View>

          {/* Issue Type */}
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Issue Type</Text>
            <View style={styles.issueTypeContainer}>
              {['Mainboard', 'SME'].map((t) => {
                const active = issueType === t;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setIssueType(t)}
                    style={[
                      styles.typePill,
                      {
                        backgroundColor: active ? colors.primary : colors.surface,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.typePillText, { color: active ? '#fff' : colors.foreground }]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Date fields with calendar picker */}
          {dateFields.map(({ label, field, value }) => (
            <View key={field} style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
              <TouchableOpacity
                onPress={() => openDatePicker(field)}
                style={[styles.dateRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.dateText, { color: value ? colors.foreground : colors.mutedForeground }]}>
                  {value || 'Select date'}
                </Text>
                <Feather name="calendar" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
          ))}

          {previewBuyValue != null && !isNaN(previewBuyValue) && previewBuyValue > 0 ? (
            <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.previewLabel, { color: colors.mutedForeground }]}>Buy value per person</Text>
              <Text style={[styles.previewValue, { color: colors.primary }]}>
                {formatCurrency(previewBuyValue)}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date picker */}
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

const styles = StyleSheet.create({
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
  fetchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 20,
  },
  fetchBtnText: {
    fontSize: 14,
    fontFamily: 'DMSans_600SemiBold',
  },
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
