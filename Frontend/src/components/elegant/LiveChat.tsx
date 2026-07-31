/**
 * Live-chat overlay pieces, styled for on-video (deep/dark) surfaces in both
 * themes. Transport-agnostic: parent supplies messages + onSend (useLiveChat).
 */
import React, { useRef, useState } from 'react';
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { ChatMessage } from '../../hooks/useLiveChat';
import { Fonts, Radii } from '../../theme/elegant';
import { Icon } from './Icons';

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
        <View
          style={{
            alignSelf: 'flex-start',
            maxWidth: '86%',
            backgroundColor: 'rgba(12,9,6,0.55)',
            borderWidth: 1,
            borderColor: 'rgba(232,203,143,0.18)',
            borderRadius: Radii.md,
            paddingVertical: 7,
            paddingHorizontal: 11,
          }}
        >
          <Text style={{ color: '#E8CB8F', fontSize: 10.5, fontFamily: Fonts.sansSemi, letterSpacing: 0.6 }}>
            {item.name}
          </Text>
          <Text style={{ color: 'rgba(242,234,218,0.92)', fontSize: 13, fontFamily: Fonts.sans, lineHeight: 19 }}>
            {item.text}
          </Text>
        </View>
      )}
    />
  );
}

/** Input pinned to the bottom of the viewer screen. Clears on send. */
export function ChatInputBar({ onSend, bottomInset }: { onSend: (text: string) => void; bottomInset: number }) {
  const [text, setText] = useState('');
  const submit = () => {
    onSend(text);
    setText('');
  };
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: bottomInset + 12,
      }}
    >
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        returnKeyType="send"
        placeholder="Say something…"
        placeholderTextColor="rgba(242,234,218,0.45)"
        maxLength={280}
        style={{
          flex: 1,
          color: '#F5EFDF',
          fontSize: 13.5,
          fontFamily: Fonts.sans,
          backgroundColor: 'rgba(12,9,6,0.62)',
          borderWidth: 1,
          borderColor: 'rgba(232,203,143,0.28)',
          borderRadius: Radii.pill,
          paddingVertical: 11,
          paddingHorizontal: 17,
        }}
      />
      <TouchableOpacity
        onPress={submit}
        activeOpacity={0.75}
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(201,162,87,0.25)',
          borderWidth: 1,
          borderColor: 'rgba(232,203,143,0.4)',
        }}
      >
        <Icon name="send" size={17} color="#E8CB8F" strokeWidth={1.6} />
      </TouchableOpacity>
    </View>
  );
}
