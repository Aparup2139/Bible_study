import React from 'react';
import { View, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../src/store/useAppStore';
import { HomeScreen } from '../src/screens/HomeScreen';
import { LiveStreamScreen } from '../src/screens/LiveStreamScreen';
import { StudyChatScreen } from '../src/screens/StudyChatScreen';
import { AskScreen } from '../src/screens/AskScreen';
import { PodcastScreen } from '../src/screens/PodcastScreen';
import { DenominationScreen } from '../src/screens/DenominationScreen';
import { EditProfileScreen } from '../src/screens/EditProfileScreen';
import { Colors } from '../src/theme';

/**
 * Root screen.  All "overlay" screens (LiveStream, StudyChat, etc.) are
 * rendered as full-screen Modals over the HomeScreen so the home feed retains
 * its state and the video player keeps its position in the scroll view.
 */
export default function Index() {
  const { activeScreen, setActiveScreen } = useAppStore();
  const insets = useSafeAreaInsets();

  const close = () => setActiveScreen('home');

  return (
    <View style={[styles.container, { paddingTop: 0 }]}>
      {/* Always-mounted home feed */}
      <HomeScreen />

      {/* Live Stream overlay */}
      <Modal
        visible={activeScreen === 'livestream'}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={close}
      >
        <LiveStreamScreen onClose={close} />
      </Modal>

      {/* Study Chat overlay */}
      <Modal
        visible={activeScreen === 'studychat'}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={close}
      >
        <StudyChatScreen onClose={close} />
      </Modal>

      {/* Ask the Bible (AI agent) overlay */}
      <Modal
        visible={activeScreen === 'askbible'}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={close}
      >
        <AskScreen onClose={close} />
      </Modal>

      {/* Podcasts overlay */}
      <Modal
        visible={activeScreen === 'podcasts'}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={close}
      >
        <PodcastScreen onClose={close} />
      </Modal>

      {/* Denomination overlay */}
      <Modal
        visible={activeScreen === 'denomination'}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={close}
      >
        <DenominationScreen onClose={close} />
      </Modal>

      {/* Edit Profile overlay */}
      <Modal
        visible={activeScreen === 'editprofile'}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={close}
      >
        <EditProfileScreen onClose={close} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
