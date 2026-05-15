import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';
import type { UserProfile } from '../types';

interface Props {
  profile: UserProfile;
  onEditPress: () => void;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

export function ProfileSection({ profile, onEditPress }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {/* Avatar */}
        <View style={styles.avatar}>
          {profile.avatarUri ? (
            <Text style={styles.avatarEmoji}>🖼️</Text>
          ) : (
            <Text style={styles.avatarEmoji}>📷</Text>
          )}
        </View>

        {/* Info */}
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.displayName}>{profile.displayName}</Text>
            <TouchableOpacity style={styles.editBtn} onPress={onEditPress} activeOpacity={0.8}>
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.handle}>{profile.handle}</Text>

          <Text style={styles.bio} numberOfLines={3}>
            {profile.bio}
          </Text>

          <Text style={styles.subscribers}>
            <Text style={styles.subscriberCount}>{formatCount(profile.subscriberCount)}</Text>
            {' '}Subscribers
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarEmoji: {
    fontSize: 24,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  displayName: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  editBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  editBtnText: {
    color: '#fff',
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
  },
  handle: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
  },
  bio: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: Typography.sm * Typography.normal,
  },
  subscribers: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
  },
  subscriberCount: {
    color: Colors.textPrimary,
    fontWeight: Typography.semibold,
  },
});
