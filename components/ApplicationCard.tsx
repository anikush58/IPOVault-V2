import React, { useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { StatusBadge } from './StatusBadge';
import { formatCurrency } from '@/utils/formatters';
import { calcBuyValue, calcNetProfit, calcProfitLoss, calcSaleValue } from '@/utils/calculations';
import { useColors } from '@/hooks/useColors';
import { useDB } from '@/context/DBContext';
import type { ApplicationStatus, ApplicationWithDetails } from '@/context/DBContext';

type Props = {
  application: ApplicationWithDetails;
  onPress: () => void;
};

// 5 px solid left-border colour per status
const STATUS_BORDER: Record<ApplicationStatus, string> = {
  Applied:       '#A8A29C',
  Allotted:      '#2EBD72',
  'Not Allotted':'#F72650',
  Sold:          '#419AFF',
};

export function ApplicationCard({ application: app, onPress }: Props) {
  const colors = useColors();
  const { toggleFavorite } = useDB();
  const [expanded, setExpanded] = useState(false);

  const borderColor = STATUS_BORDER[app.status] ?? STATUS_BORDER.Applied;
  const isFav = app.is_favorite === 1;

  const buyValue  = calcBuyValue(app.buy_price, app.quantity);
  const isSold    = app.status === 'Sold' && app.sell_price != null;
  const saleValue = isSold ? calcSaleValue(app.sell_price!, app.quantity) : null;
  const pl        = saleValue != null ? calcProfitLoss(saleValue, buyValue) : null;
  const netProfit = pl != null ? calcNetProfit(pl, app.tax ?? 0, app.user_cut ?? 0) : null;
  const isProfit  = netProfit != null && netProfit >= 0;

  return (
    <View style={[styles.wrapper, { borderColor: colors.border, borderLeftColor: borderColor }]}>
      {/* ── Collapsed row — always visible ── */}
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.72}
        style={styles.topRow}
      >
        <View style={styles.nameCol}>
          <Text style={[styles.ipoName, { color: colors.foreground }]} numberOfLines={1}>
            {app.ipo_name}
          </Text>
          <Text style={[styles.userName, { color: colors.mutedForeground }]} numberOfLines={2}>
            {app.user_name}{app.user_broker ? ` · ${app.user_broker}` : ''}{app.user_bank_name ? ` · ${app.user_bank_name}` : ''}{app.user_upi_app ? ` · ${app.user_upi_app}` : ''}
          </Text>
        </View>

        <View style={styles.rightCluster}>
          <StatusBadge status={app.status} />

          {/* Favourite star */}
          <TouchableOpacity
            onPress={() => toggleFavorite(app.id, !isFav)}
            hitSlop={10}
            style={styles.starBtn}
          >
            <Feather
              name={isFav ? 'star' : 'star'}
              size={15}
              color={isFav ? colors.primary : colors.border}
            />
          </TouchableOpacity>

          {/* Expand / collapse toggle */}
          <TouchableOpacity
            onPress={() => setExpanded((v) => !v)}
            hitSlop={12}
            style={styles.chevronBtn}
          >
            <Feather
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* ── Expanded detail row ── */}
      {expanded && (
        <>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.metricsRow}>
            <View style={styles.metricCell}>
              <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Buy Value</Text>
              <Text style={[styles.metaValue, { color: colors.foreground }]}>
                {formatCurrency(buyValue)}
              </Text>
            </View>

            <View style={[styles.sep, { backgroundColor: colors.border }]} />

            <View style={styles.metricCell}>
              <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Sell Value</Text>
              <Text style={[styles.metaValue, { color: saleValue != null ? colors.foreground : colors.mutedForeground }]}>
                {saleValue != null ? formatCurrency(saleValue) : '—'}
              </Text>
            </View>

            <View style={[styles.sep, { backgroundColor: colors.border }]} />

            <View style={styles.metricCell}>
              <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Net Profit</Text>
              {netProfit != null ? (
                <Text style={[styles.metaValue, { color: isProfit ? colors.positive : colors.negative }]}>
                  {formatCurrency(netProfit)}
                </Text>
              ) : (
                <Text style={[styles.metaValue, { color: colors.mutedForeground }]}>—</Text>
              )}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 5,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingLeft: 14,
    paddingRight: 10,
    gap: 10,
  },
  nameCol: { flex: 1, gap: 3 },
  ipoName:  { fontSize: 15, fontFamily: 'DMSans_700Bold', letterSpacing: -0.2 },
  userName: { fontSize: 12, fontFamily: 'DMSans_400Regular' },

  rightCluster: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  starBtn:      { padding: 2 },
  chevronBtn:   { padding: 2 },

  divider: { height: 1, marginHorizontal: 14 },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  metricCell: { flex: 1, gap: 4 },
  sep: { width: 1, marginHorizontal: 10, alignSelf: 'stretch' },
  metaLabel: {
    fontSize: 10,
    fontFamily: 'DMSans_500Medium',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metaValue: { fontSize: 13, fontFamily: 'DMSans_600SemiBold' },
});
