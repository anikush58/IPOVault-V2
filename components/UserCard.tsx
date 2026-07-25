import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { User } from '@/context/DBContext';

type Props = {
  user: User;
  applied: number;
  allotted: number;
  onEdit: () => void;
  onDelete: () => void;
};

export function UserCard({ user, applied, allotted, onEdit, onDelete }: Props) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  const strikeRate = applied > 0 ? Math.round((allotted / applied) * 100) : null;

  const srColor =
    strikeRate == null
      ? colors.mutedForeground
      : strikeRate >= 60
      ? colors.positive
      : strikeRate >= 30
      ? colors.primary
      : colors.negative;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* ── Top row: avatar · name/PAN · edit/delete ── */}
      <View style={styles.topRow}>
        <LinearGradient
          colors={['#C49346', '#A67C3A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
        </LinearGradient>

        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.foreground }]}>{user.name}</Text>
          <Text style={[styles.pan, { color: colors.mutedForeground }]}>
            {user.pan_number || 'No PAN'}
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={onEdit}
            style={[styles.actionBtn, { backgroundColor: colors.surface }]}
            hitSlop={8}
          >
            <Feather name="edit-2" size={14} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDelete}
            style={[styles.actionBtn, { backgroundColor: colors.destructiveBg }]}
            hitSlop={8}
          >
            <Feather name="trash-2" size={14} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Bottom row: broker chip (left) · chevron (right) ── tap to expand ── */}
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
        style={styles.metaExpandRow}
      >
        <View style={styles.chips}>
          {user.broker ? (
            <View style={[styles.chip, { backgroundColor: colors.surface }]}>
              <Feather name="briefcase" size={11} color={colors.mutedForeground} />
              <Text style={[styles.chipText, { color: colors.secondaryForeground }]}>{user.broker}</Text>
            </View>
          ) : null}
          {user.tpin ? (
            <View style={[styles.chip, { backgroundColor: colors.surface }]}>
              <Feather name="lock" size={11} color={colors.mutedForeground} />
              <Text style={[styles.chipText, { color: colors.secondaryForeground }]}>
                {user.tpin}
              </Text>
            </View>
          ) : null}
        </View>
        <Feather
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.mutedForeground}
        />
      </TouchableOpacity>

      {/* ── Stats (collapsible) ── */}
      {expanded && (
        <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{applied}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Applied</Text>
          </View>
          <View style={[styles.statSep, { backgroundColor: colors.border }]} />
          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: colors.positive }]}>{allotted}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Allotted</Text>
          </View>
          <View style={[styles.statSep, { backgroundColor: colors.border }]} />
          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: srColor }]}>
              {strikeRate != null ? `${strikeRate}%` : '—'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Strike Rate</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 17, fontFamily: 'DMSans_700Bold', color: '#fff' },
  info: { flex: 1 },
  name: { fontSize: 15, fontFamily: 'DMSans_700Bold', letterSpacing: -0.2 },
  pan: { fontSize: 12, fontFamily: 'DMSans_400Regular', marginTop: 2, letterSpacing: 0.3 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  metaExpandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', flex: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  chipText: { fontSize: 12, fontFamily: 'DMSans_500Medium' },

  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    gap: 3,
  },
  statSep: { width: 1, alignSelf: 'stretch' },
  statValue: { fontSize: 16, fontFamily: 'DMSans_700Bold', letterSpacing: -0.3 },
  statLabel: { fontSize: 10, fontFamily: 'DMSans_500Medium', letterSpacing: 0.4, textTransform: 'uppercase' },
});
