import React, { useRef, useState } from 'react';
import {
  Animated,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { useDB } from '@/context/DBContext';
import { KPICard } from '@/components/KPICard';
import { PerformanceChart } from '@/components/PerformanceChart';
import { Leaderboard } from '@/components/Leaderboard';
import { FilterSheet } from '@/components/FilterSheet';
import { formatCurrency } from '@/utils/formatters';
import {
  calcBuyValue,
  calcNetProfit,
  calcPortfolioCAGR,
  calcProfitLoss,
  calcSaleValue,
} from '@/utils/calculations';

export default function DashboardScreen() {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const { applications, isLoading, refresh } = useDB();
  const insets = useSafeAreaInsets();

  // ── filter state ───────────────────────────────────────────────────────────
  const [filterUserIds, setFilterUserIds] = useState<string[]>([]);
  const [filterBrokers, setFilterBrokers] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState<string | null>(new Date().getFullYear().toString());
  const [filterIpoNames, setFilterIpoNames] = useState<string[]>([]);
  const [showFilter, setShowFilter] = useState(false);

  // ── search state ───────────────────────────────────────────────────────────
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchAnim = useRef(new Animated.Value(0)).current;
  const searchRef = useRef<TextInput>(null);

  const toggleSearch = () => {
    if (showSearch) {
      // close
      Animated.timing(searchAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
      setShowSearch(false);
      setSearchQuery('');
    } else {
      setShowSearch(true);
      Animated.timing(searchAnim, { toValue: 1, duration: 220, useNativeDriver: false }).start(() =>
        searchRef.current?.focus(),
      );
    }
  };

  // ── base filter (user / broker / year / IPO) ──────────────────────────────
  const baseFilteredApps = applications.filter((a) => {
    if (filterUserIds.length > 0 && !filterUserIds.includes(a.user_id)) return false;
    if (filterBrokers.length > 0 && !filterBrokers.includes(a.user_broker ?? '')) return false;
    if (filterIpoNames.length > 0 && !filterIpoNames.includes(a.ipo_name ?? '')) return false;
    if (filterYear) {
      const y = a.open_date ? a.open_date.slice(0, 4) : '';
      if (y !== filterYear) return false;
    }
    return true;
  });

  // ── KPI calculations ───────────────────────────────────────────────────────
  const soldApps = baseFilteredApps.filter((a) => a.status === 'Sold');
  const totalPL = soldApps.reduce((sum, a) => {
    const bv = calcBuyValue(a.buy_price, a.quantity);
    const sv = calcSaleValue(a.sell_price ?? 0, a.quantity);
    return sum + calcProfitLoss(sv, bv);
  }, 0);
  const totalTax = soldApps.reduce((sum, a) => sum + (a.tax ?? 0), 0);
  const totalUserCut = soldApps.reduce((sum, a) => sum + (a.user_cut ?? 0), 0);
  const netProfit = calcNetProfit(totalPL, totalTax, totalUserCut);
  const soldInvested = soldApps.reduce(
    (sum, a) => sum + calcBuyValue(a.buy_price, a.quantity),
    0,
  );
  const profitPct = soldInvested > 0 ? (netProfit / soldInvested) * 100 : null;
  const profitPctLabel = profitPct != null ? `${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(1)}%` : '—';

  // ── display helpers ────────────────────────────────────────────────────────
  const hasFilter = filterUserIds.length > 0 || filterBrokers.length > 0 || filterIpoNames.length > 0;
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const filterUserNames = filterUserIds
    .map((uid) => applications.find((a) => a.user_id === uid)?.user_name)
    .filter(Boolean) as string[];
  const filterChipLabel = [...filterUserNames, ...filterBrokers, ...filterIpoNames].join(' · ');

  const searchBarHeight = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 52],
  });
  const searchBarOpacity = searchAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />

      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border },
        ]}
      >
        <LinearGradient
          colors={[colors.primary + '22', colors.primary + '00']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.headerGlow}
          pointerEvents="none"
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Image
            source={require('@/assets/app-icon.png')}
            style={{ width: 38, height: 38, borderRadius: 10 }}
            resizeMode="contain"
          />
          <View>
            <Text style={[styles.headerEyebrow, { color: colors.primary }]}>IPO Portfolio</Text>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Dashboard</Text>
          </View>
        </View>

        {/* Right: search + filter — 40×40 bordered circles */}
        <View style={styles.headerActions}>
          {false && (
            <TouchableOpacity
              onPress={toggleSearch}
              style={[
                styles.iconBtn,
                {
                  borderColor: showSearch ? colors.primary : colors.border,
                  overflow: 'hidden',
                },
              ]}
            >
              {showSearch ? (
                <LinearGradient
                  colors={[colors.primary, colors.primaryLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
              )}
              <Feather name={showSearch ? 'x' : 'search'} size={15} color={showSearch ? '#fff' : colors.foreground} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => setShowFilter(true)}
            style={[
              styles.iconBtn,
              {
                borderColor: hasFilter ? colors.primary : colors.border,
                overflow: 'hidden',
              },
            ]}
          >
            {hasFilter ? (
              <LinearGradient
                colors={[colors.primary, colors.primaryLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
            )}
            <Feather name="sliders" size={15} color={hasFilter ? '#fff' : colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Collapsible search bar ── */}
      {false && (
        <Animated.View
          style={[
            styles.searchBar,
            {
              height: searchBarHeight,
              opacity: searchBarOpacity,
              backgroundColor: colors.background,
              borderBottomColor: colors.border,
            },
          ]}
          pointerEvents={showSearch ? 'auto' : 'none'}
        >
          <View style={[styles.searchInner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="search" size={14} color={colors.mutedForeground} />
            <TextInput
              ref={searchRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search users or brokers…"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.searchInput, { color: colors.foreground }]}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
                <Feather name="x-circle" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={colors.primary} />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      >
        {/* Active filter chip */}
        {hasFilter && (
          <View
            style={[
              styles.filterBar,
              { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' },
            ]}
          >
            <Feather name="filter" size={12} color={colors.primary} />
            <Text style={[styles.filterBarText, { color: colors.primary }]}>{filterChipLabel}</Text>
            <TouchableOpacity
              onPress={() => { setFilterUserIds([]); setFilterBrokers([]); setFilterIpoNames([]); }}
              hitSlop={8}
            >
              <Feather name="x" size={14} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* KPI 2×2 grid */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiRow}>
            <KPICard
              label="Total P/L"
              value={formatCurrency(totalPL)}
              isPositive={totalPL > 0}
              isNegative={totalPL < 0}
              subtitle="from sold IPOs"
            />
            <KPICard
              label="Net Profit"
              value={formatCurrency(netProfit)}
              isPositive={netProfit > 0}
              isNegative={netProfit < 0}
              subtitle="after tax & cuts"
            />
          </View>
          <View style={styles.kpiRow}>
            <KPICard label="Tax Paid" value={formatCurrency(totalTax)} subtitle="total charges" />
            <KPICard
              label="Portfolio Profit %"
              value={profitPctLabel}
              isPositive={profitPct != null && profitPct > 0}
              isNegative={profitPct != null && profitPct < 0}
              subtitle="absolute return"
            />
          </View>
        </View>

        {/* Performance chart */}
        <PerformanceChart applications={baseFilteredApps} />

        {/* Leaderboard */}
        <Leaderboard applications={baseFilteredApps} searchQuery={searchQuery} />
      </ScrollView>

      <FilterSheet
        visible={showFilter}
        filterUserIds={filterUserIds}
        filterBrokers={filterBrokers}
        filterYear={filterYear}
        filterIpoNames={filterIpoNames}
        onFilterChange={(uids, brokers, year, ipos) => {
          setFilterUserIds(uids);
          setFilterBrokers(brokers);
          setFilterYear(year);
          setFilterIpoNames(ipos);
        }}
        onClose={() => setShowFilter(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    overflow: 'hidden',
  },
  headerGlow: { position: 'absolute', right: 0, top: 0, width: 200, height: 130 },
  headerEyebrow: {
    fontSize: 11,
    fontFamily: 'DMSans_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerTitle: { fontSize: 30, fontFamily: 'DMSans_700Bold', letterSpacing: -0.8, lineHeight: 34 },

  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchBar: {
    borderBottomWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
    padding: 0,
  },

  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
  },
  filterBarText: { flex: 1, fontSize: 13, fontFamily: 'DMSans_600SemiBold' },

  kpiGrid: { paddingHorizontal: 16, paddingTop: 18, gap: 10 },
  kpiRow: { flexDirection: 'row', gap: 10 },
});
