import React, { useEffect } from 'react';
import { BackHandler, View, StyleSheet } from 'react-native';
import { useAppStore } from '../src/store/useAppStore';
import { HomeScreen } from '../src/screens/HomeScreen';
import { LiveStreamScreen } from '../src/screens/LiveStreamScreen';
import { LiveViewerScreen } from '../src/screens/LiveViewerScreen';
import { StudyChatScreen } from '../src/screens/StudyChatScreen';
import { AskScreen } from '../src/screens/AskScreen';
import { PodcastScreen } from '../src/screens/PodcastScreen';
import { DenominationScreen } from '../src/screens/DenominationScreen';
import { EditProfileScreen } from '../src/screens/EditProfileScreen';
import { UploadVideoScreen } from '../src/screens/UploadVideoScreen';
import { Colors } from '../src/theme';
import { useTheme } from '../src/theme/ThemeContext';

/**
 * Full-screen overlay rendered IN THE MAIN WINDOW — deliberately not a Modal.
 *
 * RN's Modal is a separate Android Dialog with its own view hierarchy, but RN
 * observes keyboard changes on the *activity's* view tree. Inside a Modal the
 * activity never sees the IME open, so `keyboardDidShow` never fires and
 * keyboardHeight is stuck at 0 — measured on device: kb=0 with the keyboard
 * plainly open, and the layout pixel-identical open vs closed. Under SDK 54's
 * edge-to-edge the dialog does not resize either, so a composer inside a Modal
 * has no way at all to get above the keys.
 *
 * An absolutely-positioned View keeps the same behaviour (HomeScreen stays
 * mounted underneath, retaining scroll position) while living in the window
 * that actually reports the keyboard. It also makes the status-bar overlap
 * moot: one window, so each screen's own insets.top is simply correct.
 *
 * Trade-off: no built-in slide animation (the app already uses animation:'none'
 * on its Stack) and hardware-back has to be wired up by hand, below.
 */
function Overlay({
  visible, onClose, children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { c } = useTheme();

  useEffect(() => {
    if (!visible) return;
    // Replaces Modal's onRequestClose.
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible) return null;
  // Opaque backdrop: the screens' own `sheet` colour is only ~92% opaque, which
  // was invisible behind a Modal's dialog window but lets HomeScreen show
  // through now that these render in the same window.
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]}>{children}</View>;
}

/**
 * Root screen.  All "overlay" screens (LiveStream, StudyChat, etc.) are
 * rendered as full-screen Modals over the HomeScreen so the home feed retains
 * its state and the video player keeps its position in the scroll view.
 */
export default function Index() {
  const { activeScreen, setActiveScreen, watchStreamId, setWatchStreamId } = useAppStore();

  const close = () => setActiveScreen('home');
  const closeViewer = () => {
    setActiveScreen('home');
    setWatchStreamId(null);
  };

  return (
    <View style={[styles.container, { paddingTop: 0 }]}>
      {/* Always-mounted home feed */}
      <HomeScreen />

      {/* Live Stream overlay */}
      <Overlay visible={activeScreen === 'livestream'} onClose={close}>
        <LiveStreamScreen onClose={close} />
      </Overlay>

      {/* Live viewer overlay (watch someone else's stream) */}
      <Overlay visible={activeScreen === 'liveviewer' && Boolean(watchStreamId)} onClose={closeViewer}>
        {watchStreamId ? <LiveViewerScreen streamId={watchStreamId} onClose={closeViewer} /> : <View />}
      </Overlay>

      {/* Study Chat overlay */}
      <Overlay visible={activeScreen === 'studychat'} onClose={close}>
        <StudyChatScreen onClose={close} />
      </Overlay>

      {/* Ask the Bible (AI agent) overlay */}
      <Overlay visible={activeScreen === 'askbible'} onClose={close}>
        <AskScreen onClose={close} />
      </Overlay>

      {/* Podcasts overlay */}
      <Overlay visible={activeScreen === 'podcasts'} onClose={close}>
        <PodcastScreen onClose={close} />
      </Overlay>

      {/* Denomination overlay */}
      <Overlay visible={activeScreen === 'denomination'} onClose={close}>
        <DenominationScreen onClose={close} />
      </Overlay>

      {/* Edit Profile overlay */}
      <Overlay visible={activeScreen === 'editprofile'} onClose={close}>
        <EditProfileScreen onClose={close} />
      </Overlay>

      {/* Upload Video (Cloudflare Stream VOD) overlay */}
      <Overlay visible={activeScreen === 'post'} onClose={close}>
        <UploadVideoScreen onClose={close} />
      </Overlay>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
