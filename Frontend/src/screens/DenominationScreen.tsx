import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';
import { useDenominations } from '../hooks/useDenominations';
import { useUpdateProfile } from '../hooks/useProfile';
import { useAppStore } from '../store/useAppStore';
import type { Denomination } from '../types';

// Maps the API's DenominationGroup enum to the picker's display label.
const GROUP_LABELS: Record<string, string> = {
  CATHOLIC: '\u{1F4D6} CATHOLIC',
  ORTHODOX: '\u{2626}\u{FE0F} ORTHODOX',
  PROTESTANT_MAINLINE: '\u{271D}\u{FE0F} PROTESTANT \u2013 MAINLINE',
  PROTESTANT_EVANGELICAL: '\u{1F4E3} EVANGELICAL',
  PENTECOSTAL: '\u{1F525} PENTECOSTAL',
  CHARISMATIC: '\u{2728} CHARISMATIC',
  BAPTIST: '\u{1F54A}\u{FE0F} BAPTIST',
  ADVENTIST: '\u{1F4C5} ADVENTIST',
  OTHER: '\u{26EA} OTHER',
};

type DenominationOption = {
  value: string;
  label: string;
  group: string;
};

interface Props {
  onClose: () => void;
}

export function DenominationScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { data: denominations = [] } = useDenominations();
  const { profile } = useAppStore();
  const updateProfile = useUpdateProfile();

  const [selectedId, setSelectedId] = useState<string>('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // Reflect the profile's saved denomination once it loads.
  useEffect(() => {
    if (profile.denominationId) setSelectedId(profile.denominationId);
  }, [profile.denominationId]);

  const options: DenominationOption[] = useMemo(
    () =>
      denominations.map((d) => ({
        value: d.id,
        label: d.name,
        group: GROUP_LABELS[d.group] ?? d.group,
      })),
    [denominations],
  );
  const infoMap = useMemo(
    () => Object.fromEntries(denominations.map((d) => [d.id, d] as const)),
    [denominations],
  );

  const selectedOption = options.find((o) => o.value === selectedId);
  const info: Denomination | null = selectedId ? infoMap[selectedId] ?? null : null;

  // Persist the choice to the backend (writes profiles.denomination_id).
  const handleSelect = (id: string) => {
    setSelectedId(id);
    setIsPickerOpen(false);
    updateProfile.mutate(
      { denominationId: id },
      {
        onError: (err) =>
          Alert.alert(
            'Could not save',
            err instanceof Error ? err.message : 'Please try again.',
          ),
      },
    );
  };

  // Group options for the picker list
  const groups = options.reduce<Record<string, DenominationOption[]>>((acc, opt) => {
    if (!acc[opt.group]) acc[opt.group] = [];
    acc[opt.group].push(opt);
    return acc;
  }, {});

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Denominations</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Intro banner */}
        <LinearGradient
          colors={[Colors.gradientRedStart, Colors.gradientRedEnd]}
          style={styles.introBanner}
        >
          <Text style={styles.introIcon}>⛪</Text>
          <Text style={styles.introTitle}>Explore Christian Denominations</Text>
          <Text style={styles.introText}>
            Discover and connect with different expressions of the Christian faith around the world
          </Text>
        </LinearGradient>

        {/* Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔍  Select a Denomination</Text>
          <Text style={styles.dropdownLabel}>Choose from Christian denominations worldwide</Text>

          {/* Custom picker trigger */}
          <TouchableOpacity
            style={styles.pickerTrigger}
            onPress={() => setIsPickerOpen((o) => !o)}
            activeOpacity={0.8}
          >
            <Text style={selectedOption ? styles.pickerValue : styles.pickerPlaceholder}>
              {selectedOption ? selectedOption.label : '-- Select a Denomination --'}
            </Text>
            <Text style={styles.pickerChevron}>{isPickerOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {/* Expandable picker list */}
          {isPickerOpen && (
            <View style={styles.pickerList}>
              <ScrollView style={{ maxHeight: 350 }} nestedScrollEnabled>
                {Object.entries(groups).map(([groupLabel, opts]) => (
                  <View key={groupLabel}>
                    <Text style={styles.optGroupLabel}>{groupLabel}</Text>
                    {opts.map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.optItem,
                          selectedId === opt.value && styles.optItemSelected,
                        ]}
                        onPress={() => handleSelect(opt.value)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.optItemText,
                            selectedId === opt.value && styles.optItemTextSelected,
                          ]}
                        >
                          {opt.label}
                        </Text>
                        {selectedId === opt.value && (
                          <Text style={styles.optCheck}>✓</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Info panel */}
        {info && (
          <View style={styles.infoPanel}>
            <Text style={styles.infoPanelTitle}>⛪  {info.name}</Text>
            <Text style={styles.infoPanelText}>{info.description}</Text>

            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{info.globalFollowers}</Text>
                <Text style={styles.statLabel}>GLOBAL FOLLOWERS</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{info.foundedYear}</Text>
                <Text style={styles.statLabel}>FOUNDED</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{info.bibleVersion.split('/')[0].trim()}</Text>
                <Text style={styles.statLabel}>BIBLE VERSION</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{info.worldwideMembers.replace(/,\d{3},\d{3}$/, 'M')}</Text>
                <Text style={styles.statLabel}>WORLDWIDE</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.joinBtn}
              onPress={() => Alert.alert('Joined!', `You've joined the ${info.name} community.`)}
              activeOpacity={0.8}
            >
              <Text style={styles.joinBtnText}>⛪  Join this Community</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: Spacing.lg,
  },
  introBanner: {
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  introIcon: {
    fontSize: 48,
    marginBottom: Spacing.sm,
  },
  introTitle: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.bold,
    color: '#fff',
    textAlign: 'center',
  },
  introText: {
    fontSize: Typography.base,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: Typography.base * 1.5,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  dropdownLabel: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    fontWeight: Typography.semibold,
  },
  pickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.base,
  },
  pickerValue: {
    color: Colors.textPrimary,
    fontSize: Typography.md,
    flex: 1,
  },
  pickerPlaceholder: {
    color: Colors.textMuted,
    fontSize: Typography.md,
    flex: 1,
  },
  pickerChevron: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
  },
  pickerList: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  optGroupLabel: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    backgroundColor: Colors.surface,
    letterSpacing: 0.5,
  },
  optItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  optItemSelected: {
    backgroundColor: 'rgba(255,0,0,0.1)',
  },
  optItemText: {
    fontSize: Typography.base,
    color: Colors.textPrimary,
    flex: 1,
  },
  optItemTextSelected: {
    color: Colors.primary,
    fontWeight: Typography.semibold,
  },
  optCheck: {
    color: Colors.primary,
    fontSize: Typography.md,
    fontWeight: Typography.bold,
  },
  infoPanel: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  infoPanelTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  infoPanelText: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    lineHeight: Typography.base * 1.6,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.base,
    marginTop: Spacing.sm,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.background,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.primary,
  },
  statLabel: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  joinBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 15,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  joinBtnText: {
    color: '#fff',
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
  },
});
