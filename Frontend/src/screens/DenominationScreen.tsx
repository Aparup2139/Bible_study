import React, { useState } from 'react';
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
import type { Denomination } from '../types';

// Denomination data with group labels
type DenominationOption = {
  value: string;
  label: string;
  group: string;
};

const DENOMINATION_OPTIONS: DenominationOption[] = [
  // Catholic
  { value: 'roman-catholic', label: 'Roman Catholic Church', group: '📖 CATHOLIC' },
  { value: 'eastern-catholic', label: 'Eastern Catholic Churches', group: '📖 CATHOLIC' },
  { value: 'old-catholic', label: 'Old Catholic Church', group: '📖 CATHOLIC' },
  // Orthodox
  { value: 'eastern-orthodox', label: 'Eastern Orthodox Church', group: '☦️ ORTHODOX' },
  { value: 'greek-orthodox', label: 'Greek Orthodox Church', group: '☦️ ORTHODOX' },
  { value: 'russian-orthodox', label: 'Russian Orthodox Church', group: '☦️ ORTHODOX' },
  { value: 'coptic-orthodox', label: 'Coptic Orthodox Church', group: '☦️ ORTHODOX' },
  { value: 'ethiopian-orthodox', label: 'Ethiopian Orthodox Church', group: '☦️ ORTHODOX' },
  // Protestant Mainline
  { value: 'anglican', label: 'Anglican/Episcopal Church', group: '✝️ PROTESTANT – MAINLINE' },
  { value: 'lutheran', label: 'Lutheran Church', group: '✝️ PROTESTANT – MAINLINE' },
  { value: 'methodist', label: 'Methodist Church', group: '✝️ PROTESTANT – MAINLINE' },
  { value: 'presbyterian', label: 'Presbyterian Church', group: '✝️ PROTESTANT – MAINLINE' },
  { value: 'reformed', label: 'Reformed Church', group: '✝️ PROTESTANT – MAINLINE' },
  // Evangelical
  { value: 'southern-baptist', label: 'Southern Baptist Convention', group: '📣 EVANGELICAL' },
  { value: 'nondenominational', label: 'Nondenominational Christian', group: '📣 EVANGELICAL' },
  { value: 'evangelical-free', label: 'Evangelical Free Church', group: '📣 EVANGELICAL' },
  // Pentecostal
  { value: 'assemblies-of-god', label: 'Assemblies of God', group: '🔥 PENTECOSTAL' },
  { value: 'church-of-god', label: 'Church of God (Cleveland)', group: '🔥 PENTECOSTAL' },
  { value: 'foursquare', label: 'Foursquare Church', group: '🔥 PENTECOSTAL' },
  // Baptist
  { value: 'american-baptist', label: 'American Baptist Churches', group: '🕊️ BAPTIST' },
  { value: 'national-baptist', label: 'National Baptist Convention', group: '🕊️ BAPTIST' },
  { value: 'progressive-national-baptist', label: 'Progressive National Baptist', group: '🕊️ BAPTIST' },
  // Adventist
  { value: 'seventh-day-adventist', label: 'Seventh-day Adventist Church', group: '📅 ADVENTIST' },
];

const DENOMINATION_INFO: Record<string, Denomination> = {
  'roman-catholic': {
    id: 'roman-catholic',
    name: 'Roman Catholic Church',
    group: 'CATHOLIC',
    description: 'The largest Christian church, led by the Pope in Rome. Known for its rich sacramental tradition, hierarchical structure, and continuity with the early church.',
    globalFollowers: '1.3 billion',
    bibleVersion: 'New American Bible (NAB)',
    foundedYear: 33,
    worldwideMembers: '1,345,000,000',
  },
  'assemblies-of-god': {
    id: 'assemblies-of-god',
    name: 'Assemblies of God',
    group: 'PENTECOSTAL',
    description: 'One of the largest Pentecostal denominations worldwide, emphasizing the baptism of the Holy Spirit, speaking in tongues, and divine healing.',
    globalFollowers: '69 million',
    bibleVersion: 'NIV / ESV',
    foundedYear: 1914,
    worldwideMembers: '69,000,000',
  },
  'southern-baptist': {
    id: 'southern-baptist',
    name: 'Southern Baptist Convention',
    group: 'BAPTIST',
    description: "The largest Protestant denomination in the United States, emphasizing believer's baptism, local church autonomy, and a strong commitment to evangelism and missions.",
    globalFollowers: '14 million',
    bibleVersion: 'KJV / CSB',
    foundedYear: 1845,
    worldwideMembers: '14,000,000',
  },
  'eastern-orthodox': {
    id: 'eastern-orthodox',
    name: 'Eastern Orthodox Church',
    group: 'ORTHODOX',
    description: 'One of the oldest branches of Christianity, emphasizing the seven ecumenical councils, theosis, and the divine liturgy. Known for its rich iconographic tradition.',
    globalFollowers: '260 million',
    bibleVersion: 'Orthodox Study Bible (OSB)',
    foundedYear: 33,
    worldwideMembers: '260,000,000',
  },
  'lutheran': {
    id: 'lutheran',
    name: 'Lutheran Church',
    group: 'PROTESTANT_MAINLINE',
    description: 'Founded on the teachings of Martin Luther, Lutheranism emphasises justification by grace through faith alone, the authority of Scripture, and the two sacraments of baptism and communion.',
    globalFollowers: '77 million',
    bibleVersion: 'ESV / NIV',
    foundedYear: 1517,
    worldwideMembers: '77,000,000',
  },
  'seventh-day-adventist': {
    id: 'seventh-day-adventist',
    name: 'Seventh-day Adventist Church',
    group: 'ADVENTIST',
    description: 'A Protestant Christian denomination known for its emphasis on the Saturday Sabbath, holistic health, and the imminent second coming of Jesus Christ.',
    globalFollowers: '21 million',
    bibleVersion: 'NKJV / NIV',
    foundedYear: 1863,
    worldwideMembers: '21,000,000',
  },
};

interface Props {
  onClose: () => void;
}

export function DenominationScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [selectedId, setSelectedId] = useState<string>('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const selectedOption = DENOMINATION_OPTIONS.find((o) => o.value === selectedId);
  const info = selectedId ? DENOMINATION_INFO[selectedId] : null;

  // Group options for the picker list
  const groups = DENOMINATION_OPTIONS.reduce<Record<string, DenominationOption[]>>((acc, opt) => {
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
                        onPress={() => {
                          setSelectedId(opt.value);
                          setIsPickerOpen(false);
                        }}
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
