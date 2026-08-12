import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../../theme/ThemeContext';
import { Fonts, Radii } from '../../theme/elegant';
import { Icon } from './Icons';
import { PressScale } from './Kit';
import type { FeaturedVideo } from '../../types';

interface Props {
  video: FeaturedVideo;
  /** Card width in px; the window keeps a 16:9 aspect. */
  width: number;
}

/**
 * One featured-video "window" (16:9).
 * - Empty slot  -> dashed placeholder ("Coming Soon").
 * - Filled slot -> free YouTube thumbnail + play chip; tap swaps in the official
 *   embed player in a WebView, playing inline in the same window.
 */
export function FeaturedVideoCard({ video, width }: Props) {
  const { c, elev } = useTheme();
  const [playing, setPlaying] = useState(false);
  const height = Math.round((width * 9) / 16);
  const frame = { width, height, borderRadius: Radii.xl, overflow: 'hidden' as const };

  if (!video.youtubeVideoId) {
    return (
      <View
        style={{
          ...frame,
          borderWidth: 1, borderStyle: 'dashed', borderColor: c.hairline,
          backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <Icon name="video" size={22} color={c.ink3} strokeWidth={1.4} />
        <Text style={{ fontSize: 9.5, fontFamily: Fonts.sansMed, color: c.ink3, letterSpacing: 1.8, textTransform: 'uppercase' }}>
          Coming Soon
        </Text>
      </View>
    );
  }

  if (playing) {
    return (
      <View style={{ ...frame, backgroundColor: '#000', ...elev.card }}>
        <WebView
          source={{ uri: `https://www.youtube.com/embed/${video.youtubeVideoId}?autoplay=1&playsinline=1&rel=0` }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          style={{ flex: 1, backgroundColor: '#000' }}
        />
      </View>
    );
  }

  return (
    <PressScale onPress={() => setPlaying(true)} to={0.97}>
      <View style={{ ...frame, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairlineSoft, ...elev.card }}>
        <Image
          source={{ uri: `https://img.youtube.com/vi/${video.youtubeVideoId}/hqdefault.jpg` }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
        <View
          style={{
            position: 'absolute', bottom: 9, right: 9,
            width: 30, height: 30, borderRadius: 15,
            backgroundColor: 'rgba(17,14,14,0.55)',
            borderWidth: 1, borderColor: 'rgba(242,199,190,0.22)',
            alignItems: 'center', justifyContent: 'center', paddingLeft: 2,
          }}
        >
          <Icon name="play" size={11} color="#F2C7BE" />
        </View>
        {video.title !== '' && (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,14,14,0.45)', paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text numberOfLines={1} style={{ fontSize: 10.5, fontFamily: Fonts.sansMed, color: '#F5EDEA', letterSpacing: 0.3 }}>
              {video.title}
            </Text>
          </View>
        )}
      </View>
    </PressScale>
  );
}
