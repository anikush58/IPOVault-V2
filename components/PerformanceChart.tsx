import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path, Circle, Line, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { type ApplicationWithDetails } from '@/context/DBContext';
import { calcBuyValue, calcNetProfit, calcProfitLoss, calcSaleValue } from '@/utils/calculations';
import { formatCurrency } from '@/utils/formatters';

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = 'weekly' | 'monthly' | 'yearly';

type BarData = {
  key: string;
  label: string;
  shortLabel: string;
  value: number;
  count: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_H = 170;
const LABEL_H = 18;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PERIOD_TABS: { value: Period; label: string; count: number }[] = [
  { value: 'weekly',    label: 'Weekly',    count: 7 },
  { value: 'monthly',   label: 'Monthly',   count: 12 },
  { value: 'yearly',    label: 'Yearly',    count: 5 },
];

// ── Bucket helpers ────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function formatDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const dateVal = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${dateVal}`;
}

function buildBuckets(period: Period, count: number, applications?: ApplicationWithDetails[]): Omit<BarData, 'value' | 'count'>[] {
  const now = new Date();
  const result: Omit<BarData, 'value' | 'count'>[] = [];

  if (period === 'weekly') {
    const monday = getMonday(now);
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = formatDateKey(d);
      const monthName = MONTHS[d.getMonth()];
      const dayNum = d.getDate();
      const label = `${DAYS[i]}, ${monthName} ${dayNum}`;
      const shortLabel = DAYS[i];
      result.push({ key, label, shortLabel });
    }
    return result;
  }

  if (period === 'monthly') {
    let startYear = now.getFullYear();
    if (applications && applications.length > 0) {
      const saleYears = applications
        .map((a) => (a.sale_date ? new Date(a.sale_date).getFullYear() : null))
        .filter(Boolean) as number[];
      if (saleYears.length > 0) {
        startYear = Math.max(...saleYears);
      } else {
        const openYears = applications
          .map((a) => (a.open_date ? new Date(a.open_date).getFullYear() : null))
          .filter(Boolean) as number[];
        if (openYears.length > 0) {
          startYear = Math.max(...openYears);
        }
      }
    }

    const monthsOrder = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2]; // Apr to Mar
    for (const mIdx of monthsOrder) {
      const year = mIdx < 3 ? startYear + 1 : startYear;
      const key = `${year}-${String(mIdx + 1).padStart(2, '0')}`;
      const yr = String(year).slice(2);
      const label = `${MONTHS[mIdx]} '${yr}`;
      const shortLabel = MONTHS[mIdx]!;
      result.push({ key, label, shortLabel });
    }
    return result;
  }

  for (let i = count - 1; i >= 0; i--) {
    const year = now.getFullYear() - i;
    const key = `${year}`;
    result.push({ key, label: `${year}`, shortLabel: `${year}` });
  }
  return result;
}

function saleKey(period: Period, dateStr: string): string {
  if (period === 'weekly') {
    return dateStr;
  }
  const [y, m] = dateStr.split('-').map(Number);
  if (period === 'monthly') return `${y}-${String(m).padStart(2, '0')}`;
  return `${y}`;
}

function getBezierPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i]!;
    const next = points[i + 1]!;
    const cp1x = curr.x + (next.x - curr.x) / 3;
    const cp1y = curr.y;
    const cp2x = curr.x + 2 * (next.x - curr.x) / 3;
    const cp2y = next.y;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
  }
  return d;
}

function formatYLabel(val: number): string {
  const sign = val < 0 ? '-' : '';
  const abs = Math.abs(val);
  if (abs === 0) return '₹0';
  if (abs >= 1000) {
    return `${sign}₹${(abs / 1000).toFixed(0)}K`;
  }
  return `${sign}₹${abs}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PeriodTabs({
  period,
  onChange,
  colors,
}: {
  period: Period;
  onChange: (p: Period) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[tabStyles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {PERIOD_TABS.map(t => {
        const active = t.value === period;
        return (
          <TouchableOpacity
            key={t.value}
            onPress={() => onChange(t.value)}
            style={[tabStyles.tab, active && { backgroundColor: colors.primary }]}
            activeOpacity={0.75}
          >
            {active && (
              <LinearGradient
                colors={[colors.primary, colors.primaryLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            <Text style={[tabStyles.label, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 3,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    overflow: 'hidden',
  },
  label: { fontSize: 12, fontFamily: 'DMSans_600SemiBold', letterSpacing: 0.1 },
});

// ── Main component ────────────────────────────────────────────────────────────

type Props = { applications: ApplicationWithDetails[] };

export function PerformanceChart({ applications }: Props) {
  const colors = useColors();
  const [period, setPeriod] = useState<Period>('monthly');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const cfg = PERIOD_TABS.find(p => p.value === period)!;

  // ── Data ──────────────────────────────────────────────────────────────────

  const bars: BarData[] = useMemo(() => {
    const agg: Record<string, { value: number; count: number }> = {};
    for (const a of applications) {
      if (a.status !== 'Sold' || !a.sale_date) continue;
      const key = saleKey(period, a.sale_date);
      const bv = calcBuyValue(a.buy_price, a.quantity);
      const sv = calcSaleValue(a.sell_price ?? 0, a.quantity);
      const net = calcNetProfit(calcProfitLoss(sv, bv), a.tax ?? 0, a.user_cut ?? 0);
      if (!agg[key]) agg[key] = { value: 0, count: 0 };
      agg[key].value += net;
      agg[key].count += 1;
    }
    return buildBuckets(period, cfg.count, applications).map(b => ({
      ...b,
      value: agg[b.key]?.value ?? 0,
      count: agg[b.key]?.count ?? 0,
    }));
  }, [applications, period, cfg.count]);

  // ── Scale ─────────────────────────────────────────────────────────────────

  const values = bars.map(b => b.value);
  const rawMax = Math.max(...values, 0);
  const rawMin = Math.min(...values, 0);

  const getCleanStep = (raw: number): number => {
    const cleanSteps = [1000, 2000, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000];
    for (const s of cleanSteps) {
      if (s >= raw) return s;
    }
    return Math.ceil(raw / 500000) * 500000 || 100000;
  };

  let minY = 0;
  let maxY = 20000;
  let cleanStep = 5000;

  if (rawMin >= 0) {
    minY = 0;
    const limit = Math.max(rawMax, 20000);
    const rawStep = limit / 4;
    cleanStep = getCleanStep(rawStep);
    maxY = cleanStep * 4;
  } else {
    const absMin = Math.abs(rawMin);
    const totalSpan = rawMax + absMin;
    const rawStep = totalSpan / 5;
    cleanStep = getCleanStep(rawStep);
    minY = Math.floor(rawMin / cleanStep) * cleanStep;
    maxY = Math.ceil(rawMax / cleanStep) * cleanStep;
  }

  const totalRange = maxY - minY || 1;
  const PADDING_Y = 6;
  const plotHeight = CHART_H - 2 * PADDING_Y;
  const zeroBase = (CHART_H - PADDING_Y) - ((-minY) / totalRange) * plotHeight;

  const [animProgress, setAnimProgress] = useState(0);

  useEffect(() => {
    setAnimProgress(0);
    let startTime = Date.now();
    const duration = 600;
    let frameId: number;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // Cubic Out
      setAnimProgress(eased);

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [period]);

  const getSvgY = (v: number) => {
    const finalY = zeroBase - (v / totalRange) * plotHeight;
    return zeroBase + (finalY - zeroBase) * animProgress;
  };

  const hasData = bars.some(b => b.count > 0);
  const totalNet = bars.reduce((s, b) => s + b.value, 0);
  const barsWithData = bars.filter(b => b.count > 0);
  const bestBar = barsWithData.length
    ? barsWithData.reduce((a, b) => (b.value > a.value ? b : a))
    : null;
  const lossBars = barsWithData.filter(b => b.value < 0);
  const worstBar = lossBars.length
    ? lossBars.reduce((a, b) => (b.value < a.value ? b : a))
    : null;

  const selected = selectedIdx !== null ? bars[selectedIdx] ?? null : null;

  const getPeriodLabel = () => {
    if (selectedIdx !== null && bars[selectedIdx]) {
      const item = bars[selectedIdx];
      if (period === 'weekly') {
        const d = new Date(item.key);
        const sun = new Date(d);
        sun.setDate(d.getDate() + 6);
        const startM = MONTHS[d.getMonth()];
        const endM = MONTHS[sun.getMonth()];
        const startD = d.getDate();
        const endD = sun.getDate();
        const startY = d.getFullYear();
        const endY = sun.getFullYear();
        if (startY === endY) {
          if (startM === endM) {
            return `${startM} ${startD} - ${endD}, ${startY}`;
          }
          return `${startM} ${startD} - ${endM} ${endD}, ${startY}`;
        }
        return `${startM} ${startD}, ${startY} - ${endM} ${endD}, ${endY}`;
      }
      if (period === 'monthly') {
        const [y, m] = item.key.split('-').map(Number);
        const mName = MONTHS[m - 1];
        return `${mName} ${y}`;
      }
      return item.key;
    }

    if (period === 'weekly') {
      const now = new Date();
      const d = getMonday(now);
      const sun = new Date(d);
      sun.setDate(d.getDate() + 6);
      const startM = MONTHS[d.getMonth()];
      const endM = MONTHS[sun.getMonth()];
      const startD = d.getDate();
      const endD = sun.getDate();
      const startY = d.getFullYear();
      const endY = sun.getFullYear();
      if (startY === endY) {
        if (startM === endM) {
          return `${startM} ${startD} - ${endD}, ${startY}`;
        }
        return `${startM} ${startD} - ${endM} ${endD}, ${startY}`;
      }
      return `${startM} ${startD}, ${startY} - ${endM} ${endD}, ${endY}`;
    }
    if (period === 'monthly') {
      const now = new Date();
      return `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    }
    return String(new Date().getFullYear());
  };

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    setSelectedIdx(null);
  };

  const [chartWidth, setChartWidth] = useState(0);

  // ── Animated Tooltip position ──
  const tooltipX = useRef(new Animated.Value(0)).current;
  const tooltipY = useRef(new Animated.Value(0)).current;
  const tooltipOpacity = useRef(new Animated.Value(0)).current;
  const isTooltipVisible = useRef(false);

  const selectedPointAnim = useRef(new Animated.Value(0)).current;

  const tooltipWidth = 90;
  const tooltipHeight = 52;

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let val = maxY; val >= minY; val -= cleanStep) {
      ticks.push(val);
    }
    return ticks;
  }, [minY, maxY, cleanStep]);

  const points = useMemo(() => {
    if (!chartWidth) return [];
    const paddingX = 0;
    const spacing = (chartWidth - 2 * paddingX) / (bars.length - 1 || 1);
    return bars.map((b, i) => ({
      x: paddingX + i * spacing,
      y: getSvgY(b.value),
      data: b,
      index: i,
    }));
  }, [bars, chartWidth, zeroBase, totalRange, animProgress]);

  const linePath = useMemo(() => getBezierPath(points), [points]);

  const fillPath = useMemo(() => {
    if (points.length === 0) return '';
    return `${linePath} L ${points[points.length - 1]!.x} ${CHART_H} L ${points[0]!.x} ${CHART_H} Z`;
  }, [points, linePath]);

  useEffect(() => {
    if (selectedIdx !== null && points[selectedIdx]) {
      const pt = points[selectedIdx]!;
      const targetX = pt.x - tooltipWidth / 2;
      const targetY = pt.y - tooltipHeight - 6;
      const clampedX = Math.max(8, Math.min(targetX, chartWidth - tooltipWidth - 8));
      const finalY = targetY < 4 ? pt.y + 6 : targetY;

      // Bounce scale animation for selected point
      selectedPointAnim.setValue(0);
      Animated.spring(selectedPointAnim, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }).start();

      if (!isTooltipVisible.current) {
        isTooltipVisible.current = true;
        tooltipX.setValue(clampedX);
        tooltipY.setValue(finalY);
        Animated.timing(tooltipOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start();
      } else {
        Animated.parallel([
          Animated.spring(tooltipX, {
            toValue: clampedX,
            tension: 80,
            friction: 12,
            useNativeDriver: true,
          }),
          Animated.spring(tooltipY, {
            toValue: finalY,
            tension: 80,
            friction: 12,
            useNativeDriver: true,
          }),
        ]).start();
      }
    } else {
      isTooltipVisible.current = false;
      Animated.timing(tooltipOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [selectedIdx, points, chartWidth]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Subtle gradient wash */}
      <LinearGradient
        colors={[colors.primary + '0C', colors.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Header row */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>ANALYTICS</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Performance</Text>
        </View>
        <Text style={[styles.headerPeriod, { color: colors.mutedForeground }]}>
          {getPeriodLabel()}
        </Text>
      </View>

      {/* Period tabs — full width, own row */}
      <View style={styles.tabsRow}>
        <PeriodTabs period={period} onChange={handlePeriodChange} colors={colors} />
      </View>

      {!hasData ? (
        /* Empty state */
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
            <Feather name="bar-chart-2" size={22} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No data yet</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            Performance appears once you mark applications as Sold
          </Text>
        </View>
      ) : (
        <>
          {/* Chart */}
          <View style={styles.chartWrap}>
            <Text style={[styles.yTitle, { color: colors.foreground }]} numberOfLines={1}>IPO Profits (₹)</Text>
            {/* Y-axis */}
            <View style={styles.yAxis}>
              <View style={styles.yTicksContainer}>
                {yTicks.map((val) => (
                  <Text key={val} style={[styles.yLabel, { color: colors.mutedForeground }]}>
                    {formatYLabel(val)}
                  </Text>
                ))}
              </View>
            </View>

            {/* Bars/Plotting area */}
            <View style={styles.barsOuter} onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
              {chartWidth > 0 && (
                <Svg width={chartWidth} height={CHART_H} style={{ position: 'absolute', top: 0, left: 0 }}>
                  <Defs>
                    <SvgLinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0%" stopColor={colors.positive} stopOpacity={0.2} />
                      <Stop offset="100%" stopColor={colors.positive} stopOpacity={0.0} />
                    </SvgLinearGradient>
                  </Defs>

                  {/* Clean dynamic grid lines */}
                  {yTicks.map((val) => {
                    const y = getSvgY(val);
                    return (
                      <Line
                        key={val}
                        x1={0}
                        y1={y}
                        x2={chartWidth}
                        y2={y}
                        stroke={colors.border}
                        strokeWidth={1}
                        strokeDasharray="2 2"
                        opacity={0.25}
                      />
                    );
                  })}

                  {/* Left dotted vertical Y-axis boundary line */}
                  <Line
                    x1={0}
                    y1={PADDING_Y}
                    x2={0}
                    y2={CHART_H - PADDING_Y}
                    stroke={colors.border}
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />



                  {/* Filled area below line */}
                  {points.length > 0 && (
                    <Path d={fillPath} fill="url(#chartGradient)" />
                  )}

                  {/* Curved line */}
                  {points.length > 0 && (
                    <Path d={linePath} fill="none" stroke={colors.positive} strokeWidth={1.8} />
                  )}

                  {/* Dotted vertical guide line */}
                  {selectedIdx !== null && points[selectedIdx] && (
                    <Line
                      x1={points[selectedIdx].x}
                      y1={PADDING_Y}
                      x2={points[selectedIdx].x}
                      y2={CHART_H - PADDING_Y}
                      stroke={colors.borderStrong ?? colors.border}
                      strokeWidth={1}
                      strokeDasharray="4 4"
                    />
                  )}

                  {/* Circular data points */}
                  {points.map((pt, idx) => {
                    const isSelected = selectedIdx === idx;
                    
                    return (
                      <Circle
                        key={pt.data.key}
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelected ? 4 : 2}
                        fill={isSelected ? colors.positive : colors.card}
                        stroke={colors.positive}
                        strokeWidth={1.5}
                      />
                    );
                  })}
                </Svg>
              )}

              {/* Glowing active point pop-up animation */}
              {selectedIdx !== null && points[selectedIdx] && (
                <Animated.View
                  style={{
                    position: 'absolute',
                    left: points[selectedIdx].x - 10,
                    top: points[selectedIdx].y - 10,
                    width: 20,
                    height: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: [{ scale: selectedPointAnim }],
                    pointerEvents: 'none',
                  }}
                >
                  <View
                    style={{
                      position: 'absolute',
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: colors.positive,
                      opacity: 0.15,
                    }}
                  />
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.positive,
                      borderWidth: 1.5,
                      borderColor: colors.card,
                    }}
                  />
                </Animated.View>
              )}

              {/* Floating Tooltip */}
              {selected !== null && (
                <Animated.View
                  style={[
                    styles.floatingTooltip,
                    {
                      opacity: tooltipOpacity,
                      transform: [
                        { translateX: tooltipX },
                        { translateY: tooltipY }
                      ],
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.tooltipPeriod, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {selected.label}
                  </Text>
                  <Text style={[styles.tooltipProfit, { color: selected.value >= 0 ? colors.positive : colors.negative }]} numberOfLines={1}>
                    {selected.value >= 0 ? '+' : ''}{formatCurrency(selected.value, false)}
                  </Text>
                  <Text style={[styles.tooltipSales, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {selected.count} {selected.count === 1 ? 'Sale' : 'Sales'}
                  </Text>
                </Animated.View>
              )}

              {/* Touch columns overlay */}
              <View style={[styles.barsRow, { height: CHART_H }]}>
                {bars.map((bar, i) => {
                  const isSelected = selectedIdx === i;

                  return (
                    <TouchableOpacity
                      key={bar.key}
                      style={styles.barCol}
                      onPress={() => setSelectedIdx(isSelected ? null : i)}
                      activeOpacity={1}
                    />
                  );
                })}
              </View>

              {/* X-axis Labels */}
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: LABEL_H }} pointerEvents="none">
                {points.map((pt, idx) => {
                  const isSelected = selectedIdx === idx;
                  return (
                    <View
                      key={pt.data.key}
                      style={{
                        position: 'absolute',
                        left: pt.x - 20,
                        width: 40,
                        bottom: 0,
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={[
                          styles.barLabel,
                          {
                            color: isSelected ? colors.primary : colors.mutedForeground,
                            fontFamily: isSelected ? 'DMSans_700Bold' : 'DMSans_400Regular',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {pt.data.shortLabel}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Redesigned Summary Cards Section */}
          {(() => {
            const unitLabel = period === 'weekly' ? 'Day' : period === 'monthly' ? 'Month' : 'Year';
            const pluralUnit = period === 'weekly' ? 'days' : period === 'monthly' ? 'months' : 'years';
            return (
              <View style={[styles.summaryContainer, { borderTopColor: colors.border }]}>
                {/* Card 1 */}
                <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>NET PROFIT</Text>
                  <Text style={[styles.cardValue, { color: totalNet >= 0 ? colors.positive : colors.negative }]}>
                    {totalNet >= 0 ? '+' : ''}{formatCurrency(totalNet, false)}
                  </Text>
                  <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                    Total across {bars.length} {pluralUnit}
                  </Text>
                </View>

                {/* Card 2 */}
                <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>BEST {unitLabel.toUpperCase()}</Text>
                  <Text style={[styles.cardValue, { color: colors.foreground }]} numberOfLines={1}>
                    {bestBar ? bestBar.label : '—'}
                  </Text>
                  <Text style={[styles.cardSub, { color: colors.positive, fontFamily: 'DMSans_700Bold' }]}>
                    {bestBar ? (bestBar.value >= 0 ? '+' : '') + formatCurrency(bestBar.value, false) : '—'}
                  </Text>
                </View>

                {/* Card 3 */}
                <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>WORST {unitLabel.toUpperCase()}</Text>
                  <Text style={[styles.cardValue, { color: colors.foreground }]} numberOfLines={1}>
                    {worstBar ? worstBar.label : '—'}
                  </Text>
                  <Text style={[styles.cardSub, { color: worstBar && worstBar.value >= 0 ? colors.positive : colors.negative, fontFamily: 'DMSans_700Bold' }]}>
                    {worstBar ? (worstBar.value >= 0 ? '+' : '') + formatCurrency(worstBar.value, false) : '—'}
                  </Text>
                </View>
              </View>
            );
          })()}
        </>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    paddingTop: 14,
    paddingBottom: 0,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 8,
    gap: 12,
  },
  headerPeriod: {
    fontSize: 14,
    fontFamily: 'DMSans_500Medium',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  tabsRow: {
    paddingHorizontal: 18,
    marginBottom: 18,
  },
  eyebrow: {
    fontSize: 10,
    fontFamily: 'DMSans_600SemiBold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    fontSize: 18,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: -0.3,
  },

  floatingTooltip: {
    position: 'absolute',
    width: 90,
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    justifyContent: 'center',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  tooltipPeriod: {
    fontSize: 9,
    fontFamily: 'DMSans_500Medium',
    lineHeight: 11,
    marginBottom: 1,
  },
  tooltipProfit: {
    fontSize: 11,
    fontFamily: 'DMSans_700Bold',
    lineHeight: 13,
  },
  tooltipSales: {
    fontSize: 9,
    fontFamily: 'DMSans_600SemiBold',
    lineHeight: 11,
    marginTop: 1,
  },

  // Chart
  chartWrap: {
    flexDirection: 'row',
    paddingLeft: 18,
    paddingRight: 24,
    marginBottom: 8,
  },
  yAxis: {
    width: 28,
    height: CHART_H + 24,
    justifyContent: 'flex-end',
    marginRight: 2,
  },
  yTitle: {
    position: 'absolute',
    top: 0,
    left: 18,
    width: 200,
    fontSize: 10,
    fontFamily: 'DMSans_600SemiBold',
    letterSpacing: 0.1,
    textAlign: 'left',
  },
  yTicksContainer: {
    height: CHART_H,
    justifyContent: 'space-between',
  },
  yLabel: {
    fontSize: 8.5,
    fontFamily: 'DMSans_500Medium',
    textAlign: 'left',
    letterSpacing: 0.1,
  },
  barsOuter: {
    flex: 1,
    height: CHART_H + LABEL_H,
    marginTop: 24,
    position: 'relative',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    height: CHART_H + LABEL_H,
  },
  barLabel: {
    fontSize: 9,
    textAlign: 'center',
    marginTop: 5,
    letterSpacing: 0.2,
  },

  // Summary Cards Section
  summaryContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    marginTop: 4,
  },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 1.5,
    elevation: 1.5,
  },
  cardLabel: {
    fontSize: 8,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.6,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  cardValue: {
    fontSize: 12,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: -0.2,
    marginBottom: 1,
  },
  cardSub: {
    fontSize: 8,
    fontFamily: 'DMSans_400Regular',
    textAlign: 'center',
  },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24, gap: 8 },
  emptyIcon: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 15, fontFamily: 'DMSans_700Bold', letterSpacing: -0.2 },
  emptySub: { fontSize: 12, fontFamily: 'DMSans_400Regular', textAlign: 'center', lineHeight: 18 },
});
