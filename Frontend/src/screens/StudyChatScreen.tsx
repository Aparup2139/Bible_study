import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOCK_ROOM_PARTICIPANTS } from '../services/mockData';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';
import type { RoomParticipant } from '../types';

interface Props {
  onClose: () => void;
}

function SpeakerAvatar({ participant }: { participant: RoomParticipant }) {
  const borderAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!participant.isSpeaking) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(borderAnim, { toValue: 1, duration: 750, useNativeDriver: false }),
        Animated.timing(borderAnim, { toValue: 0, duration: 750, useNativeDriver: false }),
      ])
    ).start();
    return () => borderAnim.stopAnimation();
  }, [participant.isSpeaking, borderAnim]);

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.primary, Colors.primaryDark],
  });

  return (
    <View style={styles.speakerItem}>
      <Animated.View
        style={[
          styles.speakerAvatar,
          participant.isSpeaking && {
            borderColor,
            borderWidth: 4,
          },
        ]}
      >
        <Text style={styles.speakerEmoji}>{participant.avatarEmoji}</Text>
        <View style={styles.speakerStatus}>
          <Text style={{ fontSize: 14 }}>
            {participant.isMuted ? '🔇' : '🎤'}
          </Text>
        </View>
      </Animated.View>
      <Text style={styles.speakerName} numberOfLines={1}>
        {participant.displayName}
      </Text>
    </View>
  );
}

function ListenerAvatar({ participant }: { participant: RoomParticipant }) {
  return (
    <View style={styles.listenerItem}>
      <View style={styles.listenerAvatar}>
        <Text style={styles.listenerEmoji}>{participant.avatarEmoji}</Text>
      </View>
      <Text style={styles.listenerName} numberOfLines={1}>
        {participant.displayName}
      </Text>
    </View>
  );
}

export function StudyChatScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [isMuted, setIsMuted] = useState(true);
  const participants = MOCK_ROOM_PARTICIPANTS;

  const speakers = participants.filter((p) => p.role === 'host' || p.role === 'speaker');
  const listeners = participants.filter((p) => p.role === 'listener');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Gradient header */}
      <LinearGradient
        colors={[Colors.gradientRedStart, Colors.gradientRedEnd]}
        style={styles.gradientHeader}
      >
        {/* Header row */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.8}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerActionBtn} activeOpacity={0.8}>
              <Text style={styles.headerActionText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerActionBtn} activeOpacity={0.8}>
              <Text style={styles.headerActionText}>+ Invite</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Room info */}
        <View style={styles.roomInfo}>
          <Text style={styles.roomTitle}>Bible Study Discussion</Text>
          <Text style={styles.roomSubtitle}>Understanding the Beatitudes • Matthew 5</Text>
        </View>
      </LinearGradient>

      {/* White card panel */}
      <View style={styles.panel}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Speakers */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionLabel}>🎙️  SPEAKERS · {speakers.length}</Text>
          </View>
          <View style={styles.speakersGrid}>
            {speakers.map((p) => (
              <SpeakerAvatar key={p.id} participant={p} />
            ))}
          </View>

          {/* Status bar */}
          <View style={styles.statusBar}>
            <Text style={styles.statusText}>
              {listeners.length} others listening
            </Text>
            <TouchableOpacity>
              <Text style={styles.statusAction}>Raise hand ✋</Text>
            </TouchableOpacity>
          </View>

          {/* Listeners */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionLabel}>👥  LISTENERS · {listeners.length}</Text>
          </View>
          <View style={styles.listenersGrid}>
            {listeners.map((p) => (
              <ListenerAvatar key={p.id} participant={p} />
            ))}
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <TouchableOpacity style={styles.leaveBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.leaveBtnIcon}>👋</Text>
          <Text style={styles.leaveBtnText}>Leave quietly</Text>
        </TouchableOpacity>

        <View style={styles.footerActions}>
          <TouchableOpacity
            style={[styles.footerIconBtn, isMuted && styles.mutedBtn]}
            onPress={() => setIsMuted((m) => !m)}
            activeOpacity={0.8}
          >
            <Text style={styles.footerIconText}>{isMuted ? '🔇' : '🎤'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.footerIconBtn, styles.footerIconBtnPrimary]} activeOpacity={0.8}>
            <Text style={styles.footerIconText}>💬</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  gradientHeader: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['2xl'],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.base,
    marginBottom: Spacing.lg,
  },
  closeBtn: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  headerActionBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 25,
  },
  headerActionText: {
    color: '#fff',
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  roomInfo: {
    paddingBottom: Spacing.lg,
  },
  roomTitle: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.bold,
    color: '#fff',
    marginBottom: Spacing.sm,
  },
  roomSubtitle: {
    fontSize: Typography.base,
    color: 'rgba(255,255,255,0.9)',
  },
  panel: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -20,
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  sectionRow: {
    marginBottom: Spacing.base,
  },
  sectionLabel: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
  speakersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  speakerItem: {
    alignItems: 'center',
    width: 90,
    gap: Spacing.sm,
  },
  speakerAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    position: 'relative',
  },
  speakerEmoji: {
    fontSize: 36,
  },
  speakerStatus: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 26,
    height: 26,
    backgroundColor: '#fff',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  speakerName: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: '#333',
    textAlign: 'center',
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: BorderRadius.xl,
    padding: Spacing.base,
    marginBottom: Spacing.xl,
  },
  statusText: {
    color: '#666',
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
  },
  statusAction: {
    color: Colors.primary,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  listenersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.base,
    marginBottom: Spacing.xl,
  },
  listenerItem: {
    alignItems: 'center',
    width: 70,
    gap: Spacing.xs,
  },
  listenerAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  listenerEmoji: {
    fontSize: 28,
  },
  listenerName: {
    fontSize: Typography.xs,
    fontWeight: Typography.medium,
    color: '#666',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  leaveBtnIcon: {
    fontSize: Typography.md,
  },
  leaveBtnText: {
    color: Colors.error,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  footerActions: {
    flexDirection: 'row',
    gap: Spacing.base,
  },
  footerIconBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutedBtn: {
    backgroundColor: '#ffe5e5',
  },
  footerIconBtnPrimary: {
    backgroundColor: Colors.primary,
  },
  footerIconText: {
    fontSize: Typography['2xl'],
  },
});
