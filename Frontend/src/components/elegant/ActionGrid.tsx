import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Fonts } from '../../theme/elegant';
import { Icon, type IconName } from './Icons';
import { PressScale, PulseDot } from './Kit';

interface ActionDef {
  icon: IconName;
  label: string;
  key: string;
  isActive?: boolean;
}

const ACTIONS: ActionDef[] = [
  { icon: 'video', label: 'Live', key: 'live', isActive: true },
  { icon: 'chat', label: 'Study Chat', key: 'studychat' },
  { icon: 'book', label: 'Ask Bible', key: 'ask' },
  { icon: 'mic', label: 'Podcasts', key: 'podcasts' },
  { icon: 'plus', label: 'Post', key: 'post' },
  { icon: 'church', label: 'Denomination', key: 'denomination' },
];

interface Props {
  onPress: (key: string) => void;
  activeKey?: string;
}

/** 3×2 grid of glass circle actions — drop-in replacement for ActionButtons. */
export function ActionGrid({ onPress, activeKey }: Props) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 22, paddingVertical: 4 }}>
      {ACTIONS.map((a) => {
        const active = activeKey ? activeKey === a.key : a.isActive;
        return (
          <View key={a.key} style={{ width: '33.33%', alignItems: 'center', marginBottom: 18 }}>
            <PressScale onPress={() => onPress(a.key)}>
              <View style={{ alignItems: 'center', gap: 9 }}>
                <View
                  style={{
                    width: 74, height: 74, borderRadius: 37,
                    backgroundColor: active ? c.goldSoft : c.surface,
                    borderWidth: 1, borderColor: active ? c.hairline : c.hairlineSoft,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Icon name={a.icon} size={26} color={c.gold} strokeWidth={1.5} />
                  {a.key === 'live' ? (
                    <View style={{ position: 'absolute', top: 5, right: 7 }}>
                      <PulseDot color={c.live} size={7} />
                    </View>
                  ) : null}
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 9, fontFamily: Fonts.sansSemi,
                    color: active ? c.ink : c.ink3,
                    textTransform: 'uppercase', letterSpacing: 1.5,
                  }}
                >
                  {a.label}
                </Text>
              </View>
            </PressScale>
          </View>
        );
      })}
    </View>
  );
}
