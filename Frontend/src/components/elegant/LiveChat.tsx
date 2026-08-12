/**
 * Live-chat overlay pieces, styled for on-video (deep/dark) surfaces in both
 * themes. Transport-agnostic: parent supplies messages + onSend (useLiveChat).
 */
import React, { useRef, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import type { ChatMessage } from '../../hooks/useLiveChat';
import { Deep, Elev, Fonts, Radii } from '../../theme/elegant';
import { Icon } from './Icons';
import { StickyInputBar } from './Keyboard';
import { PressScale } from './Kit';
import { Glass } from './Glass';

/** Bottom-anchored, newest-last message feed. Height-capped; older lines scroll. */
export function ChatFeed({ messages }: { messages: ChatMessage[] }) {
  const listRef = useRef<FlatList<ChatMessage>>(null);
  if (messages.length === 0) return null;
  return (
    <FlatList
      ref={listRef}
      data={messages}
      keyExtractor={(m) => m.id}
      onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      style={{ maxHeight: 220 }}
      contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <Glass
          intensity={16}
          style={{
            alignSelf: 'flex-start',
            maxWidth: '86%',
            backgroundColor: Deep.chipOnDeep,
            borderWidth: 1,
            borderColor: 'rgba(206,207,212,0.16)',
            borderRadius: Radii.md,
            paddingVertical: 7,
            paddingHorizontal: 11,
          }}
        >
          <Text style={{ color: Deep.goldOnDeep, fontSize: 10.5, fontFamily: Fonts.sansSemi, letterSpacing: 0.6 }}>
            {item.name}
          </Text>
          <Text style={{ color: 'rgba(243,241,240,0.92)', fontSize: 13, fontFamily: Fonts.sans, lineHeight: 19 }}>
            {item.text}
          </Text>
        </Glass>
      )}
    />
  );
}

/** Input pinned to the bottom of the viewer screen. Clears on send. Rides the keyboard via StickyInputBar. */
export function ChatInputBar({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const submit = () => {
    onSend(text);
    setText('');
  };
  return (
    <StickyInputBar>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
          paddingTop: 10,
        }}
      >
        {/* blur under the input; shadow on the outer flex wrapper so the clip doesn't eat it */}
        <View style={{ flex: 1, borderRadius: Radii.pill, ...Elev.chip }}>
          <Glass intensity={24} style={{ borderRadius: Radii.pill }}>
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={submit}
              returnKeyType="send"
              blurOnSubmit={false}
              placeholder="Say something…"
              placeholderTextColor="rgba(243,241,240,0.45)"
              maxLength={280}
              style={{
                color: Deep.onDeep,
                fontSize: 13.5,
                fontFamily: Fonts.sans,
                backgroundColor: 'rgba(17,14,14,0.36)',
                borderWidth: 1,
                borderColor: 'rgba(242,199,190,0.28)',
                borderRadius: Radii.pill,
                paddingVertical: 11,
                paddingHorizontal: 17,
              }}
            />
          </Glass>
        </View>
        <PressScale
          onPress={submit}
          style={{ borderRadius: 21, ...Elev.chip }}
        >
          <Glass
            intensity={24}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(235,178,168,0.25)',
              borderWidth: 1,
              borderColor: 'rgba(242,199,190,0.4)',
            }}
          >
            <Icon name="send" size={17} color={Deep.goldOnDeep} strokeWidth={1.6} />
          </Glass>
        </PressScale>
      </View>
    </StickyInputBar>
  );
}
