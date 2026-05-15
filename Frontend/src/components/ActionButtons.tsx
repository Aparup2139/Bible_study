import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ActionButton } from './ui/ActionButton';
import { Spacing } from '../theme';

interface ActionDef {
  icon: string;
  label: string;
  key: string;
  isActive?: boolean;
}

const ACTIONS: ActionDef[] = [
  { icon: '🔴', label: 'Live', key: 'live', isActive: true },
  { icon: '🗣️', label: 'Study Chat', key: 'studychat' },
  { icon: '🎙️', label: 'Podcasts', key: 'podcasts' },
  { icon: '❤️', label: 'Favorite', key: 'favorite' },
  { icon: '➕', label: 'Post', key: 'post' },
  { icon: '⛪', label: 'Denomination', key: 'denomination' },
];

interface Props {
  onPress: (key: string) => void;
  activeKey?: string;
}

export function ActionButtons({ onPress, activeKey }: Props) {
  return (
    <View style={styles.grid}>
      {ACTIONS.map((action) => (
        <ActionButton
          key={action.key}
          icon={action.icon}
          label={action.label}
          isActive={activeKey ? activeKey === action.key : action.isActive}
          onPress={() => onPress(action.key)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.base,
  },
});
