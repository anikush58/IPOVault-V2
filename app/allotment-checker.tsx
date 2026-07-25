import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useDB, type ApplicationWithDetails, type ApplicationStatus } from '@/context/DBContext';
import { checkAllotment, useGetRegistrarHealth, useSolveAllotmentSession } from '@workspace/api-client-react';

type UserCheckState = {
  applicationId: string;
  userId: string;
  userName: string;
  pan: string;
  status: 'pending' | 'checking' | 'allotted' | 'not_allotted' | 'no_record' | 'error' | 'waiting';
  sharesAllotted?: number;
  appliedQuantity: number;
  errorCode?: string;
};

export default function AllotmentCheckerScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { applications, ipos, users, updateApplication, refresh } = useDB();

  // Query health metrics from the API
  const { data: healthData } = useGetRegistrarHealth();

  // Selected IPO state
  const [selectedIpoId, setSelectedIpoId] = useState<string | null>(null);
  const [showIpoPicker, setShowIpoPicker] = useState(false);

  // Checker running state
  const [checking, setChecking] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userStates, setUserStates] = useState<UserCheckState[]>([]);

  // Session / CAPTCHA states
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showCaptchaModal, setShowCaptchaModal] = useState(false);
  const [captchaImage, setCaptchaImage] = useState<string | null>(null);
  const [captchaSolution, setCaptchaSolution] = useState('');
  const [solvingCaptcha, setSolvingCaptcha] = useState(false);

  const solveMutation = useSolveAllotmentSession();

  // Filter IPOs that have at least one application
  const iposWithApps = ipos.filter((ipo) =>
    applications.some((app) => app.ipo_id === ipo.id)
  );

  const selectedIpo = ipos.find((i) => i.id === selectedIpoId);

  // Health matching helper
  const getRegistrarHealthStatus = () => {
    if (!selectedIpo?.registrar || !healthData) return null;
    const match = healthData.find((h) => 
      h.registrarName.trim().toUpperCase().includes(selectedIpo.registrar!.trim().toUpperCase()) ||
      selectedIpo.registrar!.trim().toUpperCase().includes(h.registrarName.trim().toUpperCase())
    );
    return match || null;
  };

  const regHealth = getRegistrarHealthStatus();

  const handleSolveCaptcha = async () => {
    if (!sessionId || !captchaSolution.trim()) return;
    setSolvingCaptcha(true);

    try {
      const res = await solveMutation.mutateAsync({
        data: {
          session_id: sessionId,
          solution: captchaSolution,
        },
      });

      if (res.status === 'authenticated') {
        setShowCaptchaModal(false);
        setCaptchaSolution('');
        // Resume checking from current index!
        setChecking(true);
      } else {
        Alert.alert('Verification Failed', 'Incorrect CAPTCHA solution, please try again.');
      }
    } catch (err) {
      console.error('Failed to solve captcha:', err);
      Alert.alert('Error', 'Unable to verify CAPTCHA. Please check your network connection.');
    } finally {
      setSolvingCaptcha(false);
    }
  };

  // Trigger allotment checking sequence
  const startChecking = async (ipoId: string) => {
    const ipo = ipos.find((i) => i.id === ipoId);
    if (!ipo) return;

    // Get all applications for this IPO
    const ipoApps = applications.filter((app) => app.ipo_id === ipoId);
    if (ipoApps.length === 0) return;

    // Map to checker states
    const states: UserCheckState[] = ipoApps.map((app) => {
      const user = users.find((u) => u.id === app.user_id);
      return {
        applicationId: app.id,
        userId: app.user_id,
        userName: app.user_name || user?.name || 'Unknown',
        pan: user?.pan_number || '',
        status: 'pending',
        appliedQuantity: app.quantity || ipo.quantity || 0,
      };
    });

    setUserStates(states);
    setChecking(true);
    setCurrentIndex(0);
    setSessionId(null);
    setCaptchaImage(null);
    setCaptchaSolution('');
    setShowCaptchaModal(false);
  };

  // Run the sequence step-by-step
  useEffect(() => {
    if (!checking || userStates.length === 0) return;
    if (currentIndex >= userStates.length) {
      setChecking(false);
      return;
    }

    let active = true;

    const checkNext = async () => {
      const currentUser = userStates[currentIndex];
      
      // Update state to "checking"
      setUserStates((prev) =>
        prev.map((u, i) => (i === currentIndex ? { ...u, status: 'checking' } : u))
      );

      try {
        if (!currentUser.pan) {
          throw new Error('PAN not available');
        }

        const registrarName = selectedIpo?.registrar || 'Link Intime';
        
        // Query API endpoint for this single applicant
        const res = await checkAllotment({
          ipo_name: selectedIpo?.ipo_name || '',
          registrar: registrarName,
          session_id: sessionId || undefined,
          applicants: [{ pan: currentUser.pan, name: currentUser.userName }],
        });

        if (!active) return;

        if (res && res.status === 'captcha_required') {
          // Pause checking loop
          setChecking(false);
          setSessionId(res.session_id || null);
          setCaptchaImage(res.captcha_image || null);
          
          // Mark all remaining cards as 'waiting'
          setUserStates((prev) =>
            prev.map((u, i) =>
              i >= currentIndex && u.status !== 'allotted' && u.status !== 'not_allotted' && u.status !== 'no_record'
                ? { ...u, status: 'waiting' }
                : u
            )
          );
          
          setShowCaptchaModal(true);
          return;
        }

        const result = res?.results?.[0];
        if (result) {
          // Map backend status to DB status
          let newStatus: ApplicationStatus = 'Applied';
          let stateStatus: UserCheckState['status'] = 'no_record';

          if (result.status === 'allotted') {
            newStatus = 'Allotted';
            stateStatus = 'allotted';
          } else if (result.status === 'not_allotted') {
            newStatus = 'Not Allotted';
            stateStatus = 'not_allotted';
          } else if (result.status === 'no_record') {
            newStatus = 'Applied'; // reset to Applied if no record
            stateStatus = 'no_record';
          } else {
            stateStatus = 'error';
          }

          // Update local state card
          setUserStates((prev) =>
            prev.map((u, i) =>
              i === currentIndex
                ? {
                    ...u,
                    status: stateStatus,
                    sharesAllotted: stateStatus === 'allotted' ? currentUser.appliedQuantity : 0,
                    errorCode: result.error_code || undefined,
                  }
                : u
            )
          );

          // Persist directly to local SQLite
          await updateApplication(currentUser.applicationId, newStatus);
        } else {
          throw new Error('Empty response');
        }
      } catch (err: any) {
        console.error('Allotment query error:', err);
        if (!active) return;
        setUserStates((prev) =>
          prev.map((u, i) =>
            i === currentIndex ? { ...u, status: 'error', errorCode: err?.message || 'UNEXPECTED_RESPONSE' } : u
          )
        );
      }

      // Proceed to next applicant after a tiny delay
      setTimeout(() => {
        if (active) {
          setCurrentIndex((prev) => prev + 1);
        }
      }, 300);
    };

    checkNext();

    return () => {
      active = false;
    };
  }, [checking, currentIndex, sessionId]);

  // Statistics
  const total = userStates.length;
  const completedCount = userStates.filter((u) => u.status !== 'pending' && u.status !== 'checking' && u.status !== 'waiting').length;
  const allottedCount = userStates.filter((u) => u.status === 'allotted').length;
  const notAllottedCount = userStates.filter((u) => u.status === 'not_allotted').length;
  const noRecordCount = userStates.filter((u) => u.status === 'no_record').length;
  const failedCount = userStates.filter((u) => u.status === 'error').length;
  const remaining = total - completedCount;

  // Mask PAN helper (e.g. ABCDE1234F -> XXXXX1234F)
  const maskPan = (pan: string) => {
    if (!pan || pan.length < 5) return 'XXXXX';
    return 'XXXXX' + pan.slice(5);
  };

  const getErrorText = (code?: string) => {
    switch (code) {
      case 'REGISTRAR_UNAVAILABLE':
        return 'Registrar website is down';
      case 'CAPTCHA_DETECTED':
        return 'CAPTCHA detected';
      case 'RATE_LIMITED':
        return 'Rate limited by server';
      case 'TIMEOUT':
        return 'Request timed out';
      case 'IPO_NOT_PUBLISHED':
        return 'IPO not published';
      case 'PAN_NOT_FOUND':
        return 'PAN not found';
      case 'NETWORK_UNAVAILABLE':
        return 'Network issue';
      case 'UNSUPPORTED_REGISTRAR':
        return 'Unsupported registrar';
      case 'UNEXPECTED_RESPONSE':
      default:
        return 'Retry Required';
    }
  };

  const getStatusBadge = (status: UserCheckState['status'], code?: string) => {
    switch (status) {
      case 'checking':
        return { label: 'Checking', color: '#EAB308', bg: '#FEF9C3', icon: 'loader' };
      case 'allotted':
        return { label: 'Allotted', color: '#22C55E', bg: '#DCFCE7', icon: 'check-circle' };
      case 'not_allotted':
        return { label: 'Not Allotted', color: '#EF4444', bg: '#FEE2E2', icon: 'x-circle' };
      case 'no_record':
        return { label: 'No Record Found', color: '#6B7280', bg: '#F3F4F6', icon: 'help-circle' };
      case 'error':
        return { label: getErrorText(code), color: '#F97316', bg: '#FFEDD5', icon: 'alert-triangle' };
      case 'waiting':
        return { label: 'Waiting for CAPTCHA', color: '#F97316', bg: '#FFEDD5', icon: 'clock' };
      default:
        return { label: 'Pending', color: colors.mutedForeground, bg: colors.surface, icon: 'clock' };
    }
  };

  const handleDone = async () => {
    await refresh(); // Refresh local DB states
    router.back();
  };

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.headerIcon, { backgroundColor: colors.surface }]}
          hitSlop={8}
        >
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>IPO Allotment Checker</Text>
        <View style={{ width: 34 }} />
      </View>

      {/* Select IPO Selector */}
      {selectedIpoId === null ? (
        <View style={styles.selectorView}>
          <Text style={[styles.selectorLabel, { color: colors.mutedForeground }]}>Select IPO to check</Text>
          <TouchableOpacity
            onPress={() => setShowIpoPicker(true)}
            style={[styles.selectorBox, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Text style={[styles.selectorValueText, { color: colors.mutedForeground }]}>
              Choose from list...
            </Text>
            <Feather name="chevron-down" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.mainContent}>
          {/* Selected IPO Info Card */}
          <View style={[styles.ipoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.ipoHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.ipoCardLabel, { color: colors.mutedForeground }]}>Currently Checking</Text>
                <Text style={[styles.ipoCardTitle, { color: colors.foreground }]}>{selectedIpo?.ipo_name}</Text>
              </View>
              {!checking && completedCount === total && (
                <TouchableOpacity
                  onPress={() => startChecking(selectedIpoId)}
                  style={[styles.refreshBtn, { backgroundColor: colors.primary + '15' }]}
                >
                  <Feather name="refresh-cw" size={14} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <Text style={[styles.detailKey, { color: colors.mutedForeground }]}>Registrar</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.detailVal, { color: colors.foreground }]}>{selectedIpo?.registrar || '—'}</Text>
                  {regHealth && (
                    <View
                      style={[
                        styles.healthDot,
                        {
                          backgroundColor:
                            regHealth.currentStatus === 'HEALTHY' ? '#22C55E' :
                            regHealth.currentStatus === 'DEGRADED' ? '#F97316' : '#EF4444'
                        }
                      ]}
                    />
                  )}
                </View>
              </View>
              <View style={styles.detailItem}>
                <Text style={[styles.detailKey, { color: colors.mutedForeground }]}>Allotment Date</Text>
                <Text style={[styles.detailVal, { color: colors.foreground }]}>{selectedIpo?.allotment_date || '—'}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={[styles.detailKey, { color: colors.mutedForeground }]}>Timetable</Text>
                <Text style={[styles.detailVal, { color: colors.foreground }]}>
                  {selectedIpo?.open_date} to {selectedIpo?.close_date}
                </Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={[styles.detailKey, { color: colors.mutedForeground }]}>Applications</Text>
                <Text style={[styles.detailVal, { color: colors.foreground }]}>{total}</Text>
              </View>
            </View>
          </View>

          {/* Progress Section */}
          <View style={styles.progressContainer}>
            <View style={styles.progressLabelRow}>
              <Text style={[styles.progressStatusText, { color: colors.foreground }]}>
                {checking
                  ? `Checking ${currentIndex + 1} of ${total}...`
                  : completedCount === total
                  ? 'All checks completed'
                  : 'Ready to check'}
              </Text>
              <Text style={[styles.progressPct, { color: colors.primary }]}>
                {total > 0 ? Math.round((completedCount / total) * 100) : 0}%
              </Text>
            </View>

            {/* Progress Bar */}
            <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: colors.primary,
                    width: total > 0 ? `${(completedCount / total) * 100}%` : '0%',
                  },
                ]}
              />
            </View>

            {/* Stats Panel */}
            <View style={[styles.statsPanel, { borderColor: colors.border }]}>
              {[
                { label: 'Checked', val: completedCount, color: colors.foreground },
                { label: 'Remaining', val: remaining, color: colors.mutedForeground },
                { label: 'Allotted', val: allottedCount, color: '#22C55E' },
                { label: 'Not Allotted', val: notAllottedCount, color: '#EF4444' },
                { label: 'Failed', val: failedCount, color: '#F97316' },
              ].map((stat) => (
                <View key={stat.label} style={styles.statBox}>
                  <Text style={[styles.statValue, { color: stat.color }]}>{stat.val}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* User List */}
          <FlatList
            data={userStates}
            keyExtractor={(u) => String(u.applicationId)}
            contentContainerStyle={styles.listContainer}
            renderItem={({ item: u }) => {
              const badge = getStatusBadge(u.status, u.errorCode);
              return (
                <View style={[styles.userCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.userCardLeft}>
                    <Text style={[styles.userNameText, { color: colors.foreground }]}>{u.userName}</Text>
                    <Text style={[styles.userPanText, { color: colors.mutedForeground }]}>{maskPan(u.pan)}</Text>
                  </View>
                  <View style={styles.userCardRight}>
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                      {u.status === 'checking' ? (
                        <ActivityIndicator size="small" color={badge.color} style={{ marginRight: 4 }} />
                      ) : (
                        <Feather name={badge.icon as any} size={12} color={badge.color} style={{ marginRight: 4 }} />
                      )}
                      <Text style={[styles.statusBadgeText, { color: badge.color }]}>{badge.label}</Text>
                    </View>
                    {u.status === 'allotted' && (
                      <Text style={[styles.allottedText, { color: colors.primary }]}>
                        {u.sharesAllotted} shares
                      </Text>
                    )}
                  </View>
                </View>
              );
            }}
          />

          {/* Done Action */}
          {!checking && completedCount === total && (
            <View style={[styles.doneFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                onPress={handleDone}
                style={[styles.doneBtn, { borderColor: colors.primary }]}
              >
                <LinearGradient
                  colors={[colors.primary, colors.primaryLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Bottom Sheet Modal for IPO Picker */}
      <Modal visible={showIpoPicker} transparent animationType="slide">
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
            <View style={[styles.pickerTitleRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerSheetTitleText, { color: colors.foreground }]}>Select IPO with Applications</Text>
              <TouchableOpacity onPress={() => setShowIpoPicker(false)} hitSlop={8}>
                <Feather name="x" size={20} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {iposWithApps.length === 0 ? (
              <View style={styles.emptyPickerView}>
                <Feather name="info" size={32} color={colors.mutedForeground} style={{ marginBottom: 8 }} />
                <Text style={[styles.emptyPickerText, { color: colors.mutedForeground }]}>
                  No applications recorded in local database yet.
                </Text>
              </View>
            ) : (
              <FlatList
                data={iposWithApps}
                keyExtractor={(i) => String(i.id)}
                renderItem={({ item: ipo }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedIpoId(ipo.id);
                      setShowIpoPicker(false);
                      startChecking(ipo.id);
                    }}
                    style={[styles.pickerRow, { borderBottomColor: colors.border }]}
                  >
                    <View>
                      <Text style={[styles.pickerIpoName, { color: colors.foreground }]}>{ipo.ipo_name}</Text>
                      <Text style={[styles.pickerIpoSub, { color: colors.mutedForeground }]}>
                        Registrar: {ipo.registrar || 'Unknown'}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.primary} />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* CAPTCHA Solver Modal */}
      <Modal visible={showCaptchaModal} transparent animationType="fade">
        <View style={styles.captchaOverlay}>
          <View style={[styles.captchaSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.captchaHeader}>
              <Text style={[styles.captchaTitle, { color: colors.foreground }]}>Security Verification</Text>
              <Text style={[styles.captchaSubtitle, { color: colors.mutedForeground }]}>
                {selectedIpo?.registrar || 'Registrar'} requires a CAPTCHA solve to authenticate the check session.
              </Text>
            </View>

            {captchaImage ? (
              <View style={[styles.captchaImageContainer, { borderColor: colors.border }]}>
                <Image
                  source={{ uri: captchaImage }}
                  style={styles.captchaImage}
                  resizeMode="contain"
                />
              </View>
            ) : (
              <ActivityIndicator size="large" color={colors.primary} />
            )}

            <View style={styles.inputWrapper}>
              <TextInput
                style={[
                  styles.captchaInput,
                  {
                    color: colors.foreground,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="Enter CAPTCHA Code"
                placeholderTextColor={colors.mutedForeground}
                value={captchaSolution}
                onChangeText={setCaptchaSolution}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>

            <TouchableOpacity
              onPress={handleSolveCaptcha}
              disabled={solvingCaptcha || !captchaSolution.trim()}
              style={[
                styles.submitBtn,
                {
                  opacity: solvingCaptcha || !captchaSolution.trim() ? 0.7 : 1,
                  backgroundColor: colors.primary,
                },
              ]}
            >
              {solvingCaptcha ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Verify & Continue</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'DMSans_700Bold', letterSpacing: -0.2 },

  selectorView: { paddingHorizontal: 24, paddingTop: 24, gap: 10 },
  selectorLabel: { fontSize: 13, fontFamily: 'DMSans_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.8 },
  selectorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  selectorValueText: { fontSize: 16, fontFamily: 'DMSans_500Medium' },

  mainContent: { flex: 1 },
  ipoCard: { margin: 16, borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  ipoHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  ipoCardLabel: { fontSize: 10, fontFamily: 'DMSans_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  ipoCardTitle: { fontSize: 18, fontFamily: 'DMSans_700Bold', letterSpacing: -0.3 },
  refreshBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },

  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  detailItem: { width: '47%', gap: 2 },
  detailKey: { fontSize: 10, fontFamily: 'DMSans_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailVal: { fontSize: 13, fontFamily: 'DMSans_500Medium' },
  healthDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 2 },

  progressContainer: { paddingHorizontal: 16, marginBottom: 12 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressStatusText: { fontSize: 13, fontFamily: 'DMSans_600SemiBold' },
  progressPct: { fontSize: 13, fontFamily: 'DMSans_700Bold' },
  progressBarBg: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 14 },
  progressBarFill: { height: '100%', borderRadius: 4 },

  statsPanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
  },
  statBox: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 16, fontFamily: 'DMSans_700Bold' },
  statLabel: { fontSize: 9, fontFamily: 'DMSans_500Medium', color: '#9CA3AF', textTransform: 'uppercase' },

  listContainer: { paddingHorizontal: 16, paddingBottom: 100 },
  userCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  userCardLeft: { gap: 2 },
  userNameText: { fontSize: 15, fontFamily: 'DMSans_600SemiBold' },
  userPanText: { fontSize: 12, fontFamily: 'DMSans_500Medium', letterSpacing: 0.5 },
  userCardRight: { alignItems: 'flex-end', gap: 4 },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: { fontSize: 11, fontFamily: 'DMSans_600SemiBold' },
  allottedText: { fontSize: 11, fontFamily: 'DMSans_700Bold' },

  doneFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  doneBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { color: '#fff', fontSize: 15, fontFamily: 'DMSans_700Bold' },

  // Picker Bottom Sheet
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: 420, paddingBottom: 24, borderTopWidth: 1 },
  pickerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  pickerSheetTitleText: { fontSize: 16, fontFamily: 'DMSans_700Bold', letterSpacing: -0.2 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  pickerIpoName: { fontSize: 15, fontFamily: 'DMSans_600SemiBold' },
  pickerIpoSub: { fontSize: 12, fontFamily: 'DMSans_400Regular', marginTop: 2 },
  emptyPickerView: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyPickerText: { fontSize: 14, fontFamily: 'DMSans_400Regular', textAlign: 'center', lineHeight: 22 },

  // CAPTCHA styles
  captchaOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  captchaSheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 24,
    gap: 16,
    alignItems: 'center',
  },
  captchaHeader: {
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  captchaTitle: {
    fontSize: 18,
    fontFamily: 'DMSans_700Bold',
    textAlign: 'center',
  },
  captchaSubtitle: {
    fontSize: 12,
    fontFamily: 'DMSans_500Medium',
    textAlign: 'center',
    lineHeight: 16,
  },
  captchaImageContainer: {
    width: '100%',
    height: 70,
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  captchaImage: {
    width: 240,
    height: 56,
  },
  inputWrapper: {
    width: '100%',
  },
  captchaInput: {
    width: '100%',
    height: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'DMSans_700Bold',
    textAlign: 'center',
    letterSpacing: 2,
  },
  submitBtn: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'DMSans_700Bold',
  },
});
