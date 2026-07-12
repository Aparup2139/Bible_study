import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Animated,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useAppStore } from '../store/useAppStore';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';
import { useUpdateProfile } from '../hooks/useProfile';
import { signOut, deleteAccount } from '../services/session';
import { LEGAL_DOCS, type LegalDocKey } from '../content/legal';

const SUPPORT_EMAIL = 'aparupghosh85@gmail.com';

type ProfileTab = 'info' | 'social' | 'preferences';

const TABS: { key: ProfileTab; label: string }[] = [
  { key: 'info', label: 'Profile Info' },
  { key: 'social', label: 'Social Links' },
  { key: 'preferences', label: 'Settings' },
];

const BIO_MAX = 160;

interface Props {
  onClose: () => void;
}

export function EditProfileScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { profile, setProfile } = useAppStore();
  const updateProfile = useUpdateProfile();

  const handleSignOut = async () => {
    // The auth gate swaps to the sign-in screen automatically once the
    // session clears (Supabase onAuthStateChange).
    await signOut();
  };

  const [openDoc, setOpenDoc] = useState<LegalDocKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account, profile, streams, and uploads. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const res = await deleteAccount();
            setDeleting(false);
            if (!res.ok) {
              Alert.alert('Could not delete account', res.error ?? 'Please try again.');
            }
            // On success the auth gate swaps to sign-in automatically.
          },
        },
      ],
    );
  };

  const [activeTab, setActiveTab] = useState<ProfileTab>('info');
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle.replace('@', ''));
  const [bio, setBio] = useState(profile.bio);
  const [website, setWebsite] = useState('');
  const [youtube, setYoutube] = useState('');
  const [twitter, setTwitter] = useState('');
  const [instagram, setInstagram] = useState('');

  const successOpacity = useRef(new Animated.Value(0)).current;
  const successTranslateY = useRef(new Animated.Value(-20)).current;

  const showSuccess = useCallback(() => {
    successOpacity.setValue(0);
    successTranslateY.setValue(-20);
    Animated.parallel([
      Animated.timing(successOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(successTranslateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(successOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(successTranslateY, { toValue: -20, duration: 300, useNativeDriver: true }),
      ]).start();
    }, 2500);
  }, [successOpacity, successTranslateY]);

  const handleSave = useCallback(() => {
    if (!displayName.trim()) {
      Alert.alert('Validation', 'Display name cannot be empty.');
      return;
    }
    // Send the handle WITHOUT a leading '@' (the API stores/validates it bare).
    updateProfile.mutate(
      {
        displayName: displayName.trim(),
        handle: handle.trim().replace(/^@/, ''),
        bio: bio.trim(),
      },
      {
        onSuccess: () => showSuccess(),
        onError: (err) =>
          Alert.alert(
            'Could not save',
            err instanceof Error ? err.message : 'Please try again.',
          ),
      },
    );
  }, [displayName, handle, bio, updateProfile, showSuccess]);

  const bioRemaining = BIO_MAX - bio.length;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'info':
        return (
          <View style={styles.formContent}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Display Name</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your display name"
                placeholderTextColor={Colors.textMuted}
                maxLength={50}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Username / Handle</Text>
              <View style={styles.handleRow}>
                <View style={styles.handlePrefix}>
                  <Text style={styles.handlePrefixText}>@</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.handleInput]}
                  value={handle}
                  onChangeText={setHandle}
                  placeholder="yourhandle"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={30}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={bio}
                onChangeText={(t) => { if (t.length <= BIO_MAX) setBio(t); }}
                placeholder="Tell people about yourself..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <Text style={[styles.charCounter, bioRemaining < 20 && styles.charCounterWarn]}>
                {bioRemaining} characters remaining
              </Text>
            </View>

            <View style={styles.actionsSection}>
              <TouchableOpacity
                style={styles.uploadPhotoBtn}
                onPress={() => Alert.alert('Photo Upload', 'Photo picker will open here.')}
                activeOpacity={0.8}
              >
                <Text style={styles.uploadPhotoBtnText}>📷  Upload Profile Photo</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'social':
        return (
          <View style={styles.formContent}>
            {[
              { label: '🌐  Website', value: website, setter: setWebsite, placeholder: 'https://yourwebsite.com' },
              { label: '▶️  YouTube', value: youtube, setter: setYoutube, placeholder: 'youtube.com/@channel' },
              { label: '🐦  Twitter / X', value: twitter, setter: setTwitter, placeholder: '@yourhandle' },
              { label: '📸  Instagram', value: instagram, setter: setInstagram, placeholder: '@yourhandle' },
            ].map((field) => (
              <View key={field.label} style={styles.formGroup}>
                <Text style={styles.label}>{field.label}</Text>
                <TextInput
                  style={styles.input}
                  value={field.value}
                  onChangeText={field.setter}
                  placeholder={field.placeholder}
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>
            ))}
          </View>
        );

      case 'preferences': {
        const rows: {
          icon: string;
          label: string;
          onPress: () => void;
          danger?: boolean;
        }[] = [
          {
            icon: '🔔',
            label: 'Notifications',
            onPress: () =>
              Alert.alert('Notifications', 'Push notifications are coming in a future update.'),
          },
          { icon: '📜', label: 'Terms & Conditions', onPress: () => setOpenDoc('terms') },
          { icon: '🛡️', label: 'Privacy Policy', onPress: () => setOpenDoc('privacy') },
          {
            icon: '📋',
            label: 'Complaints & Content Removal Policy',
            onPress: () => setOpenDoc('complaints'),
          },
          {
            icon: '✍️',
            label: 'Creator Consent & Media Licensing',
            onPress: () => setOpenDoc('creatorConsent'),
          },
          {
            icon: '🌐',
            label: 'Language',
            onPress: () =>
              Alert.alert('Language', 'BibleWay is currently in English. More languages are coming.'),
          },
          {
            icon: '❓',
            label: 'Help & Support',
            onPress: () =>
              Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=BibleWay support`).catch(() =>
                Alert.alert('Help & Support', `Write to us at ${SUPPORT_EMAIL}`),
              ),
          },
          { icon: '🚪', label: 'Logout', onPress: () => void handleSignOut(), danger: true },
        ];

        return (
          <View style={styles.settingsList}>
            {rows.map((row) => (
              <TouchableOpacity
                key={row.label}
                style={styles.settingRow}
                onPress={row.onPress}
                activeOpacity={0.7}
              >
                <Text style={styles.settingIcon}>{row.icon}</Text>
                <Text style={[styles.settingLabel, row.danger && styles.settingLabelDanger]}>
                  {row.label}
                </Text>
                <Text style={styles.settingChevron}>›</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.settingRow, styles.deleteRow]}
              onPress={handleDeleteAccount}
              disabled={deleting}
              activeOpacity={0.7}
            >
              <Text style={styles.settingIcon}>🗑️</Text>
              <Text style={[styles.settingLabel, styles.settingLabelDanger]}>
                {deleting ? 'Deleting…' : 'Delete Account'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.versionText}>
              v{Constants.expoConfig?.version ?? '1.0.0'}
            </Text>
          </View>
        );
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Success toast */}
      <Animated.View
        style={[
          styles.successToast,
          { opacity: successOpacity, transform: [{ translateY: successTranslateY }] },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.successToastText}>✅  Profile updated successfully!</Text>
      </Animated.View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
      </View>

      {/* Avatar section */}
      <View style={styles.avatarSection}>
        <TouchableOpacity
          style={styles.avatarWrapper}
          onPress={() => Alert.alert('Photo Upload', 'Photo picker will open here.')}
          activeOpacity={0.8}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>📷</Text>
          </View>
          <View style={styles.cameraIcon}>
            <Text style={{ fontSize: 18 }}>📷</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.changePhotoText}>Change Profile Photo</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Scrollable form */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {renderTabContent()}
        {activeTab !== 'preferences' && (
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.85}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        )}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky save bar (not on Settings — nothing to save there) */}
      {activeTab !== 'preferences' && (
        <View style={[styles.saveBar, { paddingBottom: insets.bottom + Spacing.base }]}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <Text style={styles.saveBtnText}>Save Changes</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Legal document viewer */}
      <Modal
        visible={openDoc != null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setOpenDoc(null)}
      >
        {openDoc != null && (
          <View style={[styles.docContainer, { paddingTop: insets.top }]}>
            <View style={styles.header}>
              <TouchableOpacity
                onPress={() => setOpenDoc(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.backArrow}>←</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {LEGAL_DOCS[openDoc].title}
              </Text>
            </View>
            <ScrollView contentContainerStyle={styles.docScrollContent}>
              <Text style={styles.docUpdated}>Last updated: {LEGAL_DOCS[openDoc].updated}</Text>
              <Text style={styles.docBody}>{LEGAL_DOCS[openDoc].body}</Text>
              <View style={{ height: insets.bottom + Spacing['2xl'] }} />
            </ScrollView>
          </View>
        )}
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  signOutBtn: {
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.base,
    paddingVertical: Spacing.base,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.error,
    alignItems: 'center',
  },
  signOutText: {
    color: Colors.error,
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
  },
  successToast: {
    position: 'absolute',
    top: 90,
    left: '50%',
    transform: [{ translateX: -140 }],
    width: 280,
    backgroundColor: Colors.success,
    padding: Spacing.base,
    borderRadius: BorderRadius.md,
    zIndex: 100,
    alignItems: 'center',
  },
  successToastText: {
    color: '#fff',
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.base,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backArrow: {
    color: Colors.textPrimary,
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
  },
  headerTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.base,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 60,
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    backgroundColor: Colors.primary,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhotoText: {
    color: Colors.primary,
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  formContent: {
    gap: Spacing.xl,
  },
  formGroup: {
    gap: Spacing.sm,
  },
  label: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textSecondary,
  },
  input: {
    width: '100%',
    padding: 15,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    color: Colors.textPrimary,
    fontSize: Typography.md,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  handlePrefix: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderRightWidth: 0,
    borderColor: Colors.border,
    borderTopLeftRadius: BorderRadius.md,
    borderBottomLeftRadius: BorderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 15,
  },
  handlePrefixText: {
    color: Colors.textMuted,
    fontSize: Typography.md,
    fontWeight: Typography.bold,
  },
  handleInput: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  charCounter: {
    textAlign: 'right',
    color: Colors.textMuted,
    fontSize: Typography.sm,
  },
  charCounterWarn: {
    color: Colors.error,
  },
  actionsSection: {
    gap: Spacing.base,
  },
  uploadPhotoBtn: {
    backgroundColor: Colors.primary,
    padding: 18,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  uploadPhotoBtnText: {
    color: '#fff',
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
  },
  settingsList: {
    gap: Spacing.xs,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.base,
  },
  settingIcon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  settingLabel: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
  },
  settingLabelDanger: {
    color: Colors.error,
  },
  settingChevron: {
    color: Colors.textMuted,
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
  },
  deleteRow: {
    marginTop: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.error,
    backgroundColor: 'transparent',
  },
  versionText: {
    textAlign: 'right',
    color: Colors.textMuted,
    fontSize: Typography.sm,
    paddingTop: Spacing.lg,
  },
  docContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  docScrollContent: {
    padding: Spacing.lg,
  },
  docUpdated: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    marginBottom: Spacing.base,
  },
  docBody: {
    color: Colors.textSecondary,
    fontSize: Typography.base,
    lineHeight: Typography.base * 1.7,
  },
  saveBar: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: Spacing.lg,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    padding: 18,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
  },
});
