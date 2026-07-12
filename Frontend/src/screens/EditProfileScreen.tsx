import React, { useCallback, useRef, useState } from 'react';
import {
  Alert, Animated, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useAppStore } from '../store/useAppStore';
import { useUpdateProfile } from '../hooks/useProfile';
import { signOut, deleteAccount } from '../services/session';
import { LEGAL_DOCS, type LegalDocKey } from '../content/legal';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radii } from '../theme/elegant';
import { Icon } from '../components/elegant/Icons';
import { GlassCircle, PressScale, SerifTitle } from '../components/elegant/Kit';

const SUPPORT_EMAIL = 'aparupghosh85@gmail.com';

type ProfileTab = 'info' | 'social' | 'preferences';

const TABS: { key: ProfileTab; label: string }[] = [
  { key: 'info', label: 'Profile Info' },
  { key: 'social', label: 'Social Links' },
  { key: 'preferences', label: 'Settings' },
];

const BIO_MAX = 160;

/** Hoisted so re-renders don't remount the TextInput (which would dismiss the keyboard). */
function SocialField({ label, value, setter, placeholder }: { label: string; value: string; setter: (t: string) => void; placeholder: string }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 9.5, fontFamily: Fonts.sansSemi, color: c.ink3, letterSpacing: 2.2, textTransform: 'uppercase' }}>{label}</Text>
      <TextInput
        style={{ height: 48, paddingHorizontal: 16, backgroundColor: c.input, borderWidth: 1, borderColor: c.hairlineSoft, borderRadius: Radii.sm, color: c.ink, fontSize: 14, fontFamily: Fonts.sansLight }}
        value={value}
        onChangeText={setter}
        placeholder={placeholder}
        placeholderTextColor={c.ink3}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

interface Props {
  onClose: () => void;
}

export function EditProfileScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { profile } = useAppStore();
  const updateProfile = useUpdateProfile();

  const handleSignOut = async () => {
    // The auth gate swaps to the sign-in screen automatically once the session clears.
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
            if (!res.ok) Alert.alert('Could not delete account', res.error ?? 'Please try again.');
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
    }, 2400);
  }, [successOpacity, successTranslateY]);

  const handleSave = useCallback(() => {
    if (!displayName.trim()) {
      Alert.alert('Validation', 'Display name cannot be empty.');
      return;
    }
    updateProfile.mutate(
      { displayName: displayName.trim(), handle: handle.trim().replace(/^@/, ''), bio: bio.trim() },
      {
        onSuccess: () => showSuccess(),
        onError: (err) => Alert.alert('Could not save', err instanceof Error ? err.message : 'Please try again.'),
      },
    );
  }, [displayName, handle, bio, updateProfile, showSuccess]);

  const bioRemaining = BIO_MAX - bio.length;

  const fieldLabel = { fontSize: 9.5, fontFamily: Fonts.sansSemi, color: c.ink3, letterSpacing: 2.2, textTransform: 'uppercase' as const };
  const input = {
    height: 48, paddingHorizontal: 16,
    backgroundColor: c.input, borderWidth: 1, borderColor: c.hairlineSoft,
    borderRadius: Radii.sm, color: c.ink, fontSize: 14, fontFamily: Fonts.sansLight,
  } as const;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'info':
        return (
          <View style={{ gap: 20 }}>
            <View style={{ gap: 8 }}>
              <Text style={fieldLabel}>Display Name</Text>
              <TextInput style={input} value={displayName} onChangeText={setDisplayName} placeholder="Your display name" placeholderTextColor={c.ink3} maxLength={50} />
            </View>
            <View style={{ gap: 8 }}>
              <Text style={fieldLabel}>Username</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.input, borderWidth: 1, borderColor: c.hairlineSoft, borderRadius: Radii.sm, height: 48, paddingHorizontal: 16, gap: 2 }}>
                <Text style={{ color: c.gold, fontSize: 14, fontFamily: Fonts.sansMed }}>@</Text>
                <TextInput
                  style={{ flex: 1, color: c.ink, fontSize: 14, fontFamily: Fonts.sansLight, padding: 0 }}
                  value={handle}
                  onChangeText={setHandle}
                  placeholder="yourhandle"
                  placeholderTextColor={c.ink3}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={30}
                />
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <Text style={fieldLabel}>Bio</Text>
              <TextInput
                style={[input, { height: undefined, minHeight: 96, paddingVertical: 13, textAlignVertical: 'top', lineHeight: 21 }]}
                value={bio}
                onChangeText={(t) => { if (t.length <= BIO_MAX) setBio(t); }}
                placeholder="Tell people about yourself…"
                placeholderTextColor={c.ink3}
                multiline
                numberOfLines={4}
              />
              <Text style={{ textAlign: 'right', color: bioRemaining < 20 ? c.live : c.ink3, fontSize: 10.5, fontFamily: Fonts.sansLight, letterSpacing: 0.4 }}>
                {bioRemaining} characters remaining
              </Text>
            </View>
            <PressScale onPress={() => Alert.alert('Photo Upload', 'Photo picker will open here.')} to={0.98}>
              <View style={{ borderWidth: 1, borderColor: c.hairline, paddingVertical: 13, borderRadius: Radii.pill, alignItems: 'center' }}>
                <Text style={{ color: c.gold, fontSize: 12.5, fontFamily: Fonts.sansMed, letterSpacing: 0.8 }}>Upload Profile Photo</Text>
              </View>
            </PressScale>
            <PressScale onPress={() => void handleSignOut()} to={0.98}>
              <View style={{ borderWidth: 1, borderColor: 'rgba(224,106,80,0.35)', paddingVertical: 13, borderRadius: Radii.pill, alignItems: 'center' }}>
                <Text style={{ color: c.live, fontSize: 12.5, fontFamily: Fonts.sansMed, letterSpacing: 0.8 }}>Sign Out</Text>
              </View>
            </PressScale>
          </View>
        );

      case 'social':
        return (
          <View style={{ gap: 20 }}>
            <SocialField label="Website" value={website} setter={setWebsite} placeholder="https://yourwebsite.com" />
            <SocialField label="YouTube" value={youtube} setter={setYoutube} placeholder="youtube.com/@channel" />
            <SocialField label="Twitter / X" value={twitter} setter={setTwitter} placeholder="@yourhandle" />
            <SocialField label="Instagram" value={instagram} setter={setInstagram} placeholder="@yourhandle" />
          </View>
        );

      case 'preferences': {
        const rows: { label: string; onPress: () => void; danger?: boolean }[] = [
          { label: 'Notifications', onPress: () => Alert.alert('Notifications', 'Push notifications are coming in a future update.') },
          { label: 'Terms & Conditions', onPress: () => setOpenDoc('terms') },
          { label: 'Privacy Policy', onPress: () => setOpenDoc('privacy') },
          { label: 'Complaints & Content Removal Policy', onPress: () => setOpenDoc('complaints') },
          { label: 'Creator Consent & Media Licensing', onPress: () => setOpenDoc('creatorConsent') },
          { label: 'Language', onPress: () => Alert.alert('Language', 'BibleWay is currently in English. More languages are coming.') },
          {
            label: 'Help & Support',
            onPress: () =>
              Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=BibleWay support`).catch(() =>
                Alert.alert('Help & Support', `Write to us at ${SUPPORT_EMAIL}`),
              ),
          },
          { label: 'Logout', onPress: () => void handleSignOut(), danger: true },
        ];

        return (
          <View style={{ gap: 8 }}>
            {rows.map((row) => (
              <TouchableOpacity
                key={row.label}
                onPress={row.onPress}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairlineSoft, borderRadius: Radii.sm, paddingVertical: 14, paddingHorizontal: 17 }}
              >
                <View style={{ width: 6, height: 6, backgroundColor: row.danger ? c.live : c.gold, transform: [{ rotate: '45deg' }] }} />
                <Text style={{ flex: 1, color: row.danger ? c.live : c.ink, fontSize: 13, fontFamily: Fonts.sans, letterSpacing: 0.3 }}>{row.label}</Text>
                <Icon name="chevronRight" size={13} color={c.ink3} strokeWidth={1.7} />
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              onPress={handleDeleteAccount}
              disabled={deleting}
              activeOpacity={0.7}
              style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: 'rgba(224,106,80,0.35)', borderRadius: Radii.sm, paddingVertical: 14, paddingHorizontal: 17 }}
            >
              <View style={{ width: 6, height: 6, backgroundColor: c.live, transform: [{ rotate: '45deg' }] }} />
              <Text style={{ flex: 1, color: c.live, fontSize: 13, fontFamily: Fonts.sans, letterSpacing: 0.3 }}>
                {deleting ? 'Deleting…' : 'Delete Account'}
              </Text>
            </TouchableOpacity>

            <Text style={{ textAlign: 'right', color: c.ink3, fontSize: 10, paddingTop: 14, letterSpacing: 1, fontFamily: Fonts.sansLight }}>
              v{Constants.expoConfig?.version ?? '1.0.0'}
            </Text>
          </View>
        );
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.sheet, paddingTop: insets.top }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* success toast */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', top: insets.top + 14, alignSelf: 'center', zIndex: 100,
          opacity: successOpacity, transform: [{ translateY: successTranslateY }],
          flexDirection: 'row', alignItems: 'center', gap: 9,
          backgroundColor: c.surface2, borderWidth: 1, borderColor: c.hairline,
          borderRadius: Radii.pill, paddingHorizontal: 18, paddingVertical: 10,
        }}
      >
        <Icon name="check" size={14} color={c.gold} strokeWidth={1.8} />
        <Text style={{ color: c.ink, fontSize: 12, fontFamily: Fonts.sansMed, letterSpacing: 0.4 }}>Profile updated</Text>
      </Animated.View>

      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 18, paddingVertical: 10 }}>
        <GlassCircle icon="back" onPress={onClose} iconSize={16} />
        <SerifTitle size={23}>Edit Profile</SerifTitle>
      </View>

      {/* avatar */}
      <View style={{ alignItems: 'center', paddingTop: 14, paddingBottom: 18, gap: 11 }}>
        <TouchableOpacity onPress={() => Alert.alert('Photo Upload', 'Photo picker will open here.')} activeOpacity={0.85}>
          <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: c.goldSoft, borderWidth: 1, borderColor: c.hairline, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: Fonts.serif, fontSize: 40, color: c.gold }}>
              {(displayName?.trim()?.[0] ?? '?').toUpperCase()}
            </Text>
          </View>
          <LinearGradient
            colors={[c.goldBright, c.gold]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: c.bg, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="camera" size={13} color={c.onGold} strokeWidth={1.7} />
          </LinearGradient>
        </TouchableOpacity>
        <Text style={{ color: c.gold, fontSize: 12, fontFamily: Fonts.sansMed, letterSpacing: 0.6 }}>Change Profile Photo</Text>
      </View>

      {/* tabs */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.hairlineSoft, paddingHorizontal: 12 }}>
        {TABS.map((tab) => {
          const on = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
              style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: on ? c.gold : 'transparent' }}
            >
              <Text style={{ fontSize: 11.5, fontFamily: Fonts.sansMed, color: on ? c.gold : c.ink3, letterSpacing: 0.6 }}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 22, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {renderTabContent()}
      </ScrollView>

      {/* save bar */}
      {activeTab !== 'preferences' && (
        <View style={{ borderTopWidth: 1, borderTopColor: c.hairlineSoft, paddingHorizontal: 22, paddingTop: 15, paddingBottom: insets.bottom + 15 }}>
          <PressScale onPress={handleSave} to={0.97}>
            <LinearGradient
              colors={[c.goldBright, c.gold]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ paddingVertical: 15, borderRadius: Radii.pill, alignItems: 'center' }}
            >
              <Text style={{ color: c.onGold, fontSize: 13.5, fontFamily: Fonts.sansSemi, letterSpacing: 1.2 }}>Save Changes</Text>
            </LinearGradient>
          </PressScale>
        </View>
      )}

      {/* legal document viewer */}
      <Modal visible={openDoc != null} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setOpenDoc(null)}>
        {openDoc != null && (
          <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 18, paddingVertical: 10 }}>
              <GlassCircle icon="back" onPress={() => setOpenDoc(null)} iconSize={16} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: Fonts.serif, fontSize: 20, color: c.ink, letterSpacing: 0.4 }}>
                  {LEGAL_DOCS[openDoc].title}
                </Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={{ padding: 22 }}>
              <Text style={{ color: c.ink3, fontSize: 11, fontFamily: Fonts.sansLight, marginBottom: 16, letterSpacing: 0.4 }}>
                Last updated: {LEGAL_DOCS[openDoc].updated}
              </Text>
              <Text style={{ color: c.ink2, fontSize: 13, lineHeight: 23, fontFamily: Fonts.sansLight, letterSpacing: 0.2 }}>
                {LEGAL_DOCS[openDoc].body}
              </Text>
              <View style={{ height: insets.bottom + 30 }} />
            </ScrollView>
          </View>
        )}
      </Modal>
    </KeyboardAvoidingView>
  );
}
