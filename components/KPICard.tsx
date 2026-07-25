import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  label: string;
  value: string;
  isPositive?: boolean;
  isNegative?: boolean;
  subtitle?: string;
  style?: ViewStyle;
};

export function KPICard({ label, value, isPositive, isNegative, subtitle, style }: Props) {
  const colors = useColors();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const valueColor = isPositive
    ? colors.positive
    : isNegative
      ? colors.negative
      : colors.foreground;

  // Pick gradient stops based on sentiment
  const gradColors: [string, string] = isPositive
    ? isDark
      ? [colors.positiveBg, colors.card]
      : ['#EEFAF5', '#FFFFFF']
    : isNegative
      ? isDark
        ? [colors.negativeBg, colors.card]
        : ['#FEF4F3', '#FFFFFF']
      : isDark
        ? [colors.card, colors.surface]
        : ['#FFFFFF', '#F4F1EB'];

  return (
    <LinearGradient
      colors={gradColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { borderColor: colors.border }, style]}
    >
      <Text style={[styles.label, { color: colors.mutedForeground }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.value, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 1,
  },
  label: {
    fontSize: 10,
    fontFamily: 'DMSans_600SemiBold',
    marginBottom: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 24,
    fontFamily: 'PlayfairDisplay_700Bold',
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: 'DMSans_400Regular',
    marginTop: 6,
    letterSpacing: 0.1,
  },
});
