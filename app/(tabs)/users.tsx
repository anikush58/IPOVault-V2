import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDB, type User } from '@/context/DBContext';
import { UserCard } from '@/components/UserCard';
import { AddUserModal } from '@/components/AddUserModal';

export default function UsersScreen() {
  const colors = useColors();
  const router = useRouter();
  const { users, applications, isLoading, refresh, deleteUser } = useDB();
  const insets = useSafeAreaInsets();
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // Per-user strike rate stats derived from applications
  const statsForUser = (userId: string) => {
    const userApps = applications.filter((a) => a.user_id === userId);
    const applied = userApps.length;
    const allotted = userApps.filter((a) => a.status === 'Allotted' || a.status === 'Sold').length;
    return { applied, allotted };
  };

  const handleDelete = (user: User) => {
    const doDelete = async () => {
      try {
        await deleteUser(user.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch (e) {
        Alert.alert('Error', 'Failed to delete user.');
      }
    };

    if (Platform.OS === 'web') {
      // Browser Alert.alert only shows OK; use window.confirm instead
      if ((globalThis as any).confirm?.(`Remove ${user.name} and all their applications?`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete User',
        `Remove ${user.name} and all their applications?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ],
      );
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
        {/* Back to Actions */}
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/forms')}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          hitSlop={8}
        >
          <Feather name="chevron-left" size={20} color={colors.foreground} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>Manage</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Users</Text>
        </View>

        <TouchableOpacity
          onPress={() => { setEditingUser(null); setShowModal(true); }}
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

      <FlatList
        data={users}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={() =>
          users.length > 0 ? (
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {users.length} {users.length === 1 ? 'user' : 'users'}
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          const { applied, allotted } = statsForUser(item.id);
          return (
            <UserCard
              user={item}
              applied={applied}
              allotted={allotted}
              onEdit={() => { setEditingUser(item); setShowModal(true); }}
              onDelete={() => handleDelete(item)}
            />
          );
        }}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
              <Feather name="users" size={28} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Users Yet</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Add users to start tracking their IPO applications and allotment strike rate.
            </Text>
            <TouchableOpacity
              onPress={() => { setEditingUser(null); setShowModal(true); }}
              style={[styles.emptyBtn, { overflow: 'hidden' }]}
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <Feather name="plus" size={16} color="#fff" />
              <Text style={styles.emptyBtnText}>Add First User</Text>
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 90 }}
      />

      <AddUserModal
        visible={showModal}
        user={editingUser}
        onClose={() => { setShowModal(false); setEditingUser(null); }}
      />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
  },
  headerGlow: { position: 'absolute', right: 0, top: 0, width: 200, height: 130 },
  headerEyebrow: { fontSize: 11, fontFamily: 'DMSans_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 3, textAlign: 'center' },
  headerTitle: { fontSize: 28, fontFamily: 'DMSans_700Bold', letterSpacing: -0.6, lineHeight: 32, textAlign: 'center' },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

  sectionLabel: {
    fontSize: 11,
    fontFamily: 'DMSans_500Medium',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
  },

  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 36 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontFamily: 'DMSans_700Bold', letterSpacing: -0.3, marginBottom: 8 },
  emptyText: { fontSize: 14, fontFamily: 'DMSans_400Regular', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 14 },
  emptyBtnText: { color: '#fff', fontSize: 15, fontFamily: 'DMSans_600SemiBold' },
});
