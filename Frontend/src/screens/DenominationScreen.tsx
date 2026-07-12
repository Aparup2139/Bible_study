import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDenominations } from '../hooks/useDenominations';
import { useUpdateProfile } from '../hooks/useProfile';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../theme/ThemeContext';
import { Deep, Fonts, Radii } from '../theme/elegant';
import { Icon } from '../components/elegant/Icons';
import { GlassCircle, PressScale, SectionLabel, SerifTitle } from '../components/elegant/Kit';
import type { Denomination } from '../types';

// Maps the API's DenominationGroup enum to the picker's display label.
const GROUP_LABELS: Record<string, string> = {
  CATHOLIC: 'Catholic',
  ORTHODOX: 'Orthodox',
  PROTESTANT_MAINLINE: 'Protestant – Mainline',
  PROTESTANT_EVANGELICAL: 'Evangelical',
  PENTECOSTAL: 'Pentecostal',
  CHARISMATIC: 'Charismatic',
  BAPTIST: 'Baptist',
  ADVENTIST: 'Adventist',
  OTHER: 'Other',
};

type DenominationOption = { value: string; label: string; group: string };

interface Props {
  onClose: () => void;
}

function StatTile({ value, label }: { value: string; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ width: '48.5%', backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairlineSoft, paddingVertical: 13, paddingHorizontal: 10, borderRadius: Radii.sm, alignItems: 'center', gap: 3 }}>
      <Text numberOfLines={1} style={{ fontFamily: Fonts.serif, fontSize: 19, color: c.gold }}>{value}</Text>
      <Text style={{ fontSize: 8, color: c.ink3, textTransform: 'uppercase', letterSpacing: 1.8, fontFamily: Fonts.sans, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

export function DenominationScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
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
    () => denominations.map((d) => ({ value: d.id, label: d.name, group: GROUP_LABELS[d.group] ?? d.group })),
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
      { onError: (err) => Alert.alert('Could not save', err instanceof Error ? err.message : 'Please try again.') },
    );
  };

  const groups = options.reduce<Record<string, DenominationOption[]>>((acc, opt) => {
    if (!acc[opt.group]) acc[opt.group] = [];
    acc[opt.group].push(opt);
    return acc;
  }, {});

  const worldwideShort = (s: string) => s.replace(/,\d{3},\d{3}$/, 'M');

  return (
    <View style={{ flex: 1, backgroundColor: c.sheet, paddingTop: insets.top }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 18, paddingVertical: 10 }}>
        <GlassCircle icon="back" onPress={onClose} iconSize={16} />
        <SerifTitle size={23}>Denominations</SerifTitle>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 22, paddingBottom: insets.bottom + 44 }} showsVerticalScrollIndicator={false}>
        {/* intro banner */}
        <View style={{ marginHorizontal: 20, marginTop: 8, borderRadius: Radii.xxl + 2, overflow: 'hidden', borderWidth: 1, borderColor: c.hairlineSoft }}>
          <LinearGradient colors={[...Deep.bannerStops]} style={{ paddingVertical: 28, paddingHorizontal: 24, alignItems: 'center', gap: 10 }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(232,203,143,0.4)', backgroundColor: 'rgba(201,162,87,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              <Icon name="church" size={25} color={Deep.goldOnDeep} strokeWidth={1.4} />
            </View>
            <Text style={{ fontFamily: Fonts.serif, fontSize: 23, color: Deep.onDeep, textAlign: 'center', lineHeight: 29 }}>
              Explore Christian Denominations
            </Text>
            <Text style={{ fontSize: 12, fontFamily: Fonts.sansLight, color: Deep.onDeepSoft, textAlign: 'center', lineHeight: 20, letterSpacing: 0.3 }}>
              Discover and connect with different expressions of the Christian faith around the world.
            </Text>
          </LinearGradient>
        </View>

        {/* selector */}
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          <SectionLabel>Select a denomination</SectionLabel>
          <PressScale onPress={() => setIsPickerOpen((o) => !o)} to={0.99}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairlineSoft, borderRadius: Radii.md, paddingVertical: 15, paddingHorizontal: 17 }}>
              <Text style={{ color: selectedOption ? c.ink : c.ink3, fontSize: 13.5, fontFamily: Fonts.sans, flex: 1, letterSpacing: 0.2 }}>
                {selectedOption ? selectedOption.label : 'Select a denomination'}
              </Text>
              <View style={{ transform: [{ rotate: isPickerOpen ? '180deg' : '0deg' }] }}>
                <Icon name="chevronDown" size={14} color={c.gold} strokeWidth={1.7} />
              </View>
            </View>
          </PressScale>

          {isPickerOpen && (
            <View style={{ backgroundColor: c.surface2, borderWidth: 1, borderColor: c.hairlineSoft, borderRadius: Radii.md, overflow: 'hidden' }}>
              <ScrollView style={{ maxHeight: 350 }} nestedScrollEnabled>
                {Object.entries(groups).map(([groupLabel, opts]) => (
                  <View key={groupLabel}>
                    <Text style={{ paddingHorizontal: 17, paddingTop: 10, paddingBottom: 5, fontSize: 8.5, fontFamily: Fonts.sansSemi, color: c.gold, letterSpacing: 2.4, textTransform: 'uppercase' }}>
                      {groupLabel}
                    </Text>
                    {opts.map((opt) => {
                      const sel = selectedId === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          onPress={() => handleSelect(opt.value)}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                            paddingHorizontal: 17, paddingVertical: 13,
                            borderBottomWidth: 1, borderBottomColor: c.hairlineSoft,
                            backgroundColor: sel ? c.goldSoft : 'transparent',
                          }}
                        >
                          <Text style={{ fontSize: 13.5, color: sel ? c.gold : c.ink, flex: 1, fontFamily: sel ? Fonts.sansMed : Fonts.sansLight, letterSpacing: 0.2 }}>
                            {opt.label}
                          </Text>
                          {sel && <Icon name="check" size={14} color={c.gold} strokeWidth={1.8} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* info panel */}
        {info && (
          <View style={{ marginHorizontal: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairlineSoft, borderRadius: Radii.xxl, paddingVertical: 22, paddingHorizontal: 20, gap: 14 }}>
            <Text style={{ fontFamily: Fonts.serif, fontSize: 22, color: c.ink, letterSpacing: 0.3 }}>{info.name}</Text>
            <Text style={{ fontSize: 12.5, color: c.ink2, lineHeight: 22, fontFamily: Fonts.sansLight, letterSpacing: 0.2 }}>{info.description}</Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 }}>
              <StatTile value={info.globalFollowers} label="Global Followers" />
              <StatTile value={`${info.foundedYear}`} label="Founded" />
              <StatTile value={info.bibleVersion.split('/')[0].trim()} label="Bible Version" />
              <StatTile value={worldwideShort(info.worldwideMembers)} label="Worldwide" />
            </View>

            <PressScale onPress={() => Alert.alert('Joined!', `You've joined the ${info.name} community.`)} to={0.97}>
              <LinearGradient
                colors={[c.goldBright, c.gold]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ paddingVertical: 14, borderRadius: Radii.pill, alignItems: 'center' }}
              >
                <Text style={{ color: c.onGold, fontSize: 12.5, fontFamily: Fonts.sansSemi, letterSpacing: 1 }}>Join this Community</Text>
              </LinearGradient>
            </PressScale>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
