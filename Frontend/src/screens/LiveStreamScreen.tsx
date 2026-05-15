import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLiveStore } from '../store/useLiveStore';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';
import type { ChatMessage } from '../types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  onClose: () => void;
}

export function LiveStreamScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const {
    status,
    setStatus,
    viewerCount,
    setViewerCount,
    countdown,
    setCountdown,
    isChatVisible,
    toggleChat,
    messages,
    addMessage,
  } = useLiveStore();

  const [chatInput, setChatInput] = useState('');
  const countdownOpacity = useRef(new Animated.Value(0)).current;
  const countdownScale = useRef(new Animated.Value(0.5)).current;
  const chatScrollRef = useRef<ScrollView>(null);

  // Viewer count simulator when streaming
  useEffect(() => {
    if (status !== 'live') return;
    const interval = setInterval(() => {
      setViewerCount(Math.floor(Math.random() * 500) + 100);
    }, 3000);
    return () => clearInterval(interval);
  }, [status, setViewerCount]);

  // Countdown animation per tick
  const animateCountdownNumber = useCallback(() => {
    countdownOpacity.setValue(0);
    countdownScale.setValue(0.5);
    Animated.parallel([
      Animated.timing(countdownOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(countdownScale, { toValue: 1, useNativeDriver: true }),
    ]).start();
  }, [countdownOpacity, countdownScale]);

  // Countdown logic
  useEffect(() => {
    if (status !== 'countdown') return;
    animateCountdownNumber();
    if (countdown <= 0) {
      setStatus('live');
      setViewerCount(42);
      return;
    }
    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [status, countdown, setStatus, setCountdown, setViewerCount, animateCountdownNumber]);

  const handleGoLive = useCallback(() => {
    if (status === 'idle') {
      setCountdown(5);
      setStatus('countdown');
    } else if (status === 'live') {
      setStatus('ended');
      setTimeout(() => setStatus('idle'), 1500);
    }
  }, [status, setStatus, setCountdown]);

  const handleSendMessage = useCallback(() => {
    if (!chatInput.trim()) return;
    const msg: ChatMessage = {
      id: Date.now().toString(),
      userId: 'me',
      username: 'You',
      text: chatInput.trim(),
      sentAt: new Date().toISOString(),
      roomId: 'main',
    };
    addMessage(msg);
    setChatInput('');
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [chatInput, addMessage]);

  const isStreaming = status === 'live';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Background */}
      <LinearGradient
        colors={isStreaming ? [Colors.gradientRedStart, Colors.gradientRedEnd] : ['#1a1a1a', '#0a0a0a']}
        style={StyleSheet.absoluteFill}
      />

      {/* Close button */}
      <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
        <Text style={styles.closeBtnText}>✕</Text>
      </TouchableOpacity>

      {/* Live badge + viewer count */}
      {isStreaming && (
        <>
          <View style={styles.liveBadgeTop}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
          <View style={styles.viewerCountBadge}>
            <Text style={styles.viewerCountText}>👁️  {viewerCount.toLocaleString()}</Text>
          </View>
        </>
      )}

      {/* Pre-live preview content */}
      {status === 'idle' && (
        <View style={styles.previewContent}>
          <Text style={styles.previewIcon}>📹</Text>
          <Text style={styles.previewTitle}>Ready to Go Live?</Text>
          <Text style={styles.previewSubtitle}>Share your message with the world</Text>

          <View style={styles.infoBox}>
            {[
              ['Stream to:', 'Public'],
              ['Quality:', 'HD 720p'],
              ['Camera:', 'Front'],
            ].map(([label, value]) => (
              <View key={label} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Stream ended */}
      {status === 'ended' && (
        <View style={styles.previewContent}>
          <Text style={styles.previewIcon}>✅</Text>
          <Text style={styles.previewTitle}>Stream Ended</Text>
          <Text style={styles.previewSubtitle}>Thanks for going live!</Text>
        </View>
      )}

      {/* Countdown overlay */}
      {status === 'countdown' && (
        <View style={styles.countdownOverlay}>
          <Animated.Text
            style={[
              styles.countdownNumber,
              { opacity: countdownOpacity, transform: [{ scale: countdownScale }] },
            ]}
          >
            {countdown}
          </Animated.Text>
          <Text style={styles.countdownText}>Going live in...</Text>
        </View>
      )}

      {/* Chat messages */}
      {isChatVisible && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'position' : undefined}
          style={styles.chatWrapper}
        >
          <View style={styles.chatContainer}>
            <ScrollView
              ref={chatScrollRef}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.map((msg) => (
                <View key={msg.id} style={styles.chatMessage}>
                  <Text style={styles.chatUser}>{msg.username}</Text>
                  <Text style={styles.chatText}>{msg.text}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="Say something..."
                placeholderTextColor={Colors.textMuted}
                onSubmitEditing={handleSendMessage}
                returnKeyType="send"
              />
              <TouchableOpacity style={styles.sendBtn} onPress={handleSendMessage}>
                <Text style={styles.sendBtnText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Bottom controls */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <TouchableOpacity
          style={[styles.goLiveBtn, isStreaming && styles.goLiveBtnStop]}
          onPress={handleGoLive}
          activeOpacity={0.85}
        >
          <Text style={styles.goLiveIcon}>{isStreaming ? '⏹' : '⚫'}</Text>
          <Text style={styles.goLiveText}>{isStreaming ? 'END' : 'GO LIVE'}</Text>
        </TouchableOpacity>
      </View>

      {/* Chat toggle */}
      <TouchableOpacity
        style={[styles.chatToggle, { bottom: insets.bottom + 30 }, isChatVisible && styles.chatToggleActive]}
        onPress={toggleChat}
        activeOpacity={0.8}
      >
        <Text style={styles.chatToggleIcon}>💬</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  closeBtn: {
    position: 'absolute',
    top: 60,
    left: 20,
    width: 40,
    height: 40,
    backgroundColor: Colors.overlayDark,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  closeBtnText: {
    color: '#fff',
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
  },
  liveBadgeTop: {
    position: 'absolute',
    top: 60,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,0,0,0.9)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 20,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
  },
  viewerCountBadge: {
    position: 'absolute',
    top: 110,
    left: 20,
    backgroundColor: Colors.overlayDark,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 20,
  },
  viewerCountText: {
    color: '#fff',
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  previewContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  previewIcon: {
    fontSize: 80,
    opacity: 0.5,
  },
  previewTitle: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.bold,
    color: '#fff',
  },
  previewSubtitle: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  infoBox: {
    backgroundColor: Colors.overlayMedium,
    padding: Spacing.base,
    borderRadius: BorderRadius.lg,
    width: '100%',
    gap: Spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: {
    color: Colors.textMuted,
    fontSize: Typography.base,
  },
  infoValue: {
    color: '#fff',
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  countdownNumber: {
    fontSize: 120,
    fontWeight: Typography.bold,
    color: '#fff',
  },
  countdownText: {
    position: 'absolute',
    bottom: 160,
    fontSize: Typography.lg,
    fontWeight: Typography.semibold,
    color: '#fff',
  },
  chatWrapper: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    zIndex: 30,
  },
  chatContainer: {
    backgroundColor: Colors.overlayDark,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    maxHeight: 300,
  },
  chatMessage: {
    marginBottom: 12,
  },
  chatUser: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.primary,
    marginBottom: 2,
  },
  chatText: {
    fontSize: Typography.sm,
    color: '#fff',
    lineHeight: Typography.sm * Typography.normal,
  },
  chatInputRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: Spacing.md,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    color: '#fff',
    fontSize: Typography.base,
  },
  sendBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
  },
  sendBtnText: {
    color: '#fff',
    fontWeight: Typography.semibold,
    fontSize: Typography.sm,
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 40,
  },
  goLiveBtn: {
    width: 80,
    height: 80,
    backgroundColor: Colors.primary,
    borderWidth: 4,
    borderColor: '#fff',
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  goLiveBtnStop: {
    backgroundColor: '#666',
    shadowOpacity: 0,
  },
  goLiveIcon: {
    fontSize: 28,
  },
  goLiveText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: Typography.bold,
    letterSpacing: 0.5,
  },
  chatToggle: {
    position: 'absolute',
    right: 20,
    width: 50,
    height: 50,
    backgroundColor: Colors.overlayDark,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  chatToggleActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chatToggleIcon: {
    fontSize: 22,
  },
});
