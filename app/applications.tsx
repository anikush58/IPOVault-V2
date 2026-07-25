import React, { useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDB, type ApplicationWithDetails } from '@/context/DBContext';
import { ApplicationCard } from '@/components/ApplicationCard';
import { FilterSheet } from '@/components/FilterSheet';
import { UpdateApplicationModal } from '@/components/UpdateApplicationModal';
import { KPICard } from '@/components/KPICard';
import { calcBuyValue, calcNetProfit, calcProfitLoss, calcSaleValue } from '@/utils/calculations';
import { formatCurrency } from '@/utils/formatters';

// "All" covers Applied too — remove "Applied" as a separate tab
type TabKey = 'Applied' | 'Favorites' | 'Allotted' | 'Not Allotted' | 'Sold';

const TABS: { key: TabKey; label: string; icon?: string }[] = [
  { key: 'Applied',      label: 'Applied' },
  { key: 'Allotted',     label: 'Allotted' },
  { key: 'Not Allotted', label: 'Not Allotted' },
  { key: 'Sold',         label: 'Sold' },
  { key: 'Favorites',    label: 'Favorites', icon: 'star' },
];

export default function ApplicationsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { applications, isLoading, refresh } = useDB();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [activeTab, setActiveTab] = useState<TabKey>('Applied');
  const [selectedApp, setSelectedApp] = useState<ApplicationWithDetails | null>(null);
  const [filterUserIds, setFilterUserIds] = useState<string[]>([]);
  const [filterBrokers, setFilterBrokers] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState<string | null>(new Date().getFullYear().toString());
  const [filterIpoNames, setFilterIpoNames] = useState<string[]>([]);
  const [showFilter, setShowFilter] = useState(false);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchAnim = useRef(new Animated.Value(0)).current;
  const searchRef = useRef<TextInput>(null);

  const toggleSearch = () => {
    if (showSearch) {
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

  const searchBarHeight = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 52],
  });
  const searchBarOpacity = searchAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, 1],
  });

  const hasFilter = filterUserIds.length > 0 || filterBrokers.length > 0 || filterIpoNames.length > 0;

  // Apply user/broker/year/IPO filter first, then tab filter
  const filterBase = applications.filter((a) => {
    if (filterUserIds.length > 0 && !filterUserIds.includes(a.user_id)) return false;
    if (filterBrokers.length > 0 && !filterBrokers.includes(a.user_broker ?? '')) return false;
    if (filterIpoNames.length > 0 && !filterIpoNames.includes(a.ipo_name ?? '')) return false;
    if (filterYear) {
      const y = a.open_date ? a.open_date.slice(0, 4) : '';
      if (y !== filterYear) return false;
    }
    return true;
  });

  const searchFiltered = filterBase.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.user_name.toLowerCase().includes(q) ||
      (a.user_broker ?? '').toLowerCase().includes(q) ||
      (a.ipo_name ?? '').toLowerCase().includes(q)
    );
  });

  const filtered = hasFilter
    ? (activeTab === 'Favorites' ? searchFiltered.filter((a) => a.is_favorite === 1) : searchFiltered)
    : (activeTab === 'Favorites' ? searchFiltered.filter((a) => a.is_favorite === 1) : searchFiltered.filter((a) => a.status === activeTab));

  const countFor = (key: TabKey) => {
    if (key === 'Favorites') return searchFiltered.filter((a) => a.is_favorite === 1).length;
    return searchFiltered.filter((a) => a.status === key).length;
  };

  const filterUserNames = filterUserIds
    .map((uid) => applications.find((a) => a.user_id === uid)?.user_name)
    .filter(Boolean) as string[];
  const filterChipLabel = [...filterUserNames, ...filterBrokers, ...filterIpoNames].join(' · ');

  // ── KPI calculations ───────────────────────────────────────────────────────
  const appliedCount = searchFiltered.length;
  const allottedCount = searchFiltered.filter((a) => a.status === 'Allotted' || a.status === 'Sold').length;

  const ipoProfitMap: Record<string, number> = {};
  const userProfitMap: Record<string, number> = {};
  for (const a of searchFiltered) {
    if (a.status !== 'Sold') continue;
    const bv = calcBuyValue(a.buy_price, a.quantity);
    const sv = calcSaleValue(a.sell_price ?? 0, a.quantity);
    const net = calcNetProfit(calcProfitLoss(sv, bv), a.tax ?? 0, a.user_cut ?? 0);
    ipoProfitMap[a.ipo_name] = (ipoProfitMap[a.ipo_name] ?? 0) + net;
    userProfitMap[a.user_name] = (userProfitMap[a.user_name] ?? 0) + net;
  }

  let bestIpoName = '—';
  let maxIpoProfit = -Infinity;
  for (const [name, profit] of Object.entries(ipoProfitMap)) {
    if (profit > maxIpoProfit && profit > 0) {
      maxIpoProfit = profit;
      bestIpoName = name;
    }
  }

  let bestUserName = '—';
  let maxUserProfit = -Infinity;
  for (const [name, profit] of Object.entries(userProfitMap)) {
    if (profit > maxUserProfit && profit > 0) {
      maxUserProfit = profit;
      bestUserName = name;
    }
  }

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
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          hitSlop={8}
        >
          <Feather name="chevron-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>Portfolio</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Applications</Text>
        </View>
        {/* Actions (Search + Filter) */}
        <View style={styles.headerActions}>
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
            placeholder="Search users, brokers or IPOs…"
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

      {/* Active filter chip */}
      {hasFilter && (
        <View style={[styles.filterBar, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
          <Feather name="filter" size={12} color={colors.primary} />
          <Text style={[styles.filterBarText, { color: colors.primary }]}>
            {filterChipLabel}
          </Text>
          <TouchableOpacity onPress={() => { setFilterUserIds([]); setFilterBrokers([]); setFilterIpoNames([]); }} hitSlop={8}>
            <Feather name="x" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      {/* KPI Cards Grid */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiRow}>
          <KPICard
            label="Applied"
            value={String(appliedCount)}
            subtitle="total applications"
          />
          <KPICard
            label="Allotted"
            value={String(allottedCount)}
            subtitle="allotted or sold"
          />
        </View>
        <View style={styles.kpiRow}>
          <KPICard
            label="Best IPO"
            value={bestIpoName}
            subtitle={maxIpoProfit > 0 ? `+${formatCurrency(maxIpoProfit, false)}` : 'no profit yet'}
            isPositive={maxIpoProfit > 0}
          />
          <KPICard
            label="Top User"
            value={bestUserName}
            subtitle={maxUserProfit > 0 ? `+${formatCurrency(maxUserProfit, false)}` : 'no profit yet'}
            isPositive={maxUserProfit > 0}
          />
        </View>
      </View>

      {/* Tab pills */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <FlatList
          data={TABS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(t) => t.key}
          contentContainerStyle={styles.tabScroll}
          renderItem={({ item: tab }) => {
            const active = hasFilter
              ? (activeTab === 'Favorites' ? tab.key === 'Favorites' : tab.key !== 'Favorites')
              : (activeTab === tab.key);
            const count = countFor(tab.key);
            const isFavTab = tab.key === 'Favorites';
            return (
              <TouchableOpacity
                onPress={() => setActiveTab(tab.key)}
                style={[
                  styles.tab,
                  active
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                {isFavTab && (
                  <Feather name="star" size={12} color={active ? '#fff' : colors.mutedForeground} />
                )}
                <Text style={[styles.tabLabel, { color: active ? '#fff' : colors.mutedForeground }]}>
                  {tab.label}
                </Text>
                {count > 0 && (
                  <View style={[styles.tabBadge, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : colors.muted }]}>
                    <Text style={[styles.tabBadgeText, { color: active ? '#fff' : colors.mutedForeground }]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={colors.primary} />
        }
        renderItem={({ item }) => (
          <ApplicationCard application={item} onPress={() => setSelectedApp(item)} />
        )}
        ListHeaderComponent={() => (
          <View style={styles.listHeader}>
            <Text style={[styles.listCount, { color: colors.mutedForeground }]}>
              {filtered.length} {filtered.length === 1 ? 'application' : 'applications'}
            </Text>
          </View>
        )}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
              <Feather
                name={activeTab === 'Favorites' ? 'star' : 'inbox'}
                size={28}
                color={colors.mutedForeground}
              />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {activeTab === 'Favorites' ? 'No Favourites Yet' : 'No Applications'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {activeTab === 'Applied'
                ? 'Create applications from the Actions tab.'
                : activeTab === 'Favorites'
                ? 'Tap the ★ star on any application card to mark it as a favourite.'
                : `No ${activeTab} applications yet.`}
            </Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 8 }}
      />

      <UpdateApplicationModal application={selectedApp} onClose={() => setSelectedApp(null)} />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    overflow: 'hidden',
  },
  headerGlow: { position: 'absolute', right: 0, top: 0, width: 200, height: 130 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerEyebrow: {
    fontSize: 11,
    fontFamily: 'DMSans_600SemiBold',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 3,
    textAlign: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: -0.6,
    lineHeight: 32,
    textAlign: 'center',
  },

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
    marginTop: 10,
    marginBottom: 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
  },
  filterBarText: { flex: 1, fontSize: 13, fontFamily: 'DMSans_600SemiBold' },

  tabBar: { borderBottomWidth: 1 },
  tabScroll: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tabLabel: { fontSize: 13, fontFamily: 'DMSans_600SemiBold' },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeText: { fontSize: 11, fontFamily: 'DMSans_700Bold' },

  listHeader: { paddingHorizontal: 16, paddingVertical: 6 },
  listCount: { fontSize: 12, fontFamily: 'DMSans_400Regular' },

  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 36 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontFamily: 'DMSans_700Bold', letterSpacing: -0.3, marginBottom: 8 },
  emptyText: { fontSize: 14, fontFamily: 'DMSans_400Regular', textAlign: 'center', lineHeight: 22 },
  kpiGrid: { paddingHorizontal: 16, paddingTop: 12, gap: 10, marginBottom: 6 },
  kpiRow: { flexDirection: 'row', gap: 10 },
});
