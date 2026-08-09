# Livestream Chat Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two-way live chat overlaid on BibleWay's Agora live streams — viewers post messages, everyone (host included) sees them in real time.

**Architecture:** Agora RTC keeps carrying video/audio only (unchanged). Chat messages flow through a Supabase Realtime **Broadcast** channel named `chat:{streamId}` — no DB table, no migration, no backend change; messages are ephemeral (only what arrives after you join, like a real live chat). The overlay UI (message feed + input bar) is plain React Native stacked over the existing video views: viewers get feed + input, the host gets a read-only feed (hosts reply on air).

**Tech Stack:** `@supabase/supabase-js` Realtime Broadcast (already installed), React Native, existing elegant theme kit (`Deep` tones, `Fonts`, `Icon`).

## Global Constraints

- **No new dependencies.** `@supabase/supabase-js ^2.108.2` is already in `Frontend/package.json` and the client is exported from `Frontend/src/services/supabase.ts` as `supabase`, with `isSupabaseConfigured: boolean`.
- **Custom fonts + `fontWeight` don't mix on Android** — style text with a family from `Fonts` (`Frontend/src/theme/elegant.ts`), never `fontWeight` (repo-wide rule from the elegant UI kit).
- **Deep-surface styling:** overlays on top of video use the fixed dark-tone constants (`Deep.onDeep`, hex golds like `#E8CB8F`, translucent `rgba(12,9,6,…)` cards) — NOT the theme palette `c.*`, because video stays dark in both light and dark themes (see existing overlay cards in `LiveViewerScreen.tsx`).
- **No test framework exists in `Frontend/`** (no jest/vitest configured). Verification gates are `npx tsc --noEmit` (must stay clean) plus the runtime harness in Task 4. Do not add a test framework.
- **Free-tier ceilings (document, don't engineer around):** Supabase Realtime free tier ≈ 200 concurrent connections, 2M messages/month, 500 msg/s. Fine for launch scale; revisit if a single stream exceeds ~150 live viewers.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

- **Create** `Frontend/src/hooks/useLiveChat.ts` — chat state + transport (subscribe, send, 50-message ring buffer). One responsibility: messages in/out for one stream id.
- **Create** `Frontend/src/components/elegant/LiveChat.tsx` — presentation: `ChatFeed` (message list) and `ChatInputBar` (viewer input). No transport logic.
- **Modify** `Frontend/src/screens/LiveViewerScreen.tsx` — mount feed + input while `phase === 'watching'`.
- **Modify** `Frontend/src/screens/LiveStreamScreen.tsx` — mount read-only feed while live.
- **Create** `supabase-chat-test.html` (repo root, git-ignored) — browser harness to prove end-to-end delivery without needing two phones.

---

### Task 1: Chat hook (`useLiveChat`)

**Files:**
- Create: `Frontend/src/hooks/useLiveChat.ts`

**Interfaces:**
- Consumes: `supabase`, `isSupabaseConfigured` from `../services/supabase`.
- Produces (used by Tasks 2–3):
  ```ts
  export interface ChatMessage { id: string; name: string; text: string; at: number }
  export function useLiveChat(streamId: string, senderName: string): {
    messages: ChatMessage[];   // oldest → newest, max 50
    send: (text: string) => void; // trims; no-op on empty/unconfigured
  }
  ```

- [ ] **Step 1: Write the hook**

```ts
/**
 * Live-stream chat over a Supabase Realtime Broadcast channel (`chat:{streamId}`).
 * Ephemeral by design — you see messages sent after you join, like any live chat.
 * No DB table, no backend: the message IS the broadcast payload.
 * ponytail: free tier ≈ 200 concurrent connections / 2M msgs/month — swap to
 * Realtime with auth + persistence if a stream ever nears 150+ live viewers.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../services/supabase';

export interface ChatMessage {
  id: string;
  name: string;
  text: string;
  at: number;
}

const MAX_MESSAGES = 50;
const MAX_TEXT_LEN = 280;

/** Append with a ring-buffer cap (exported for the harness check in Task 4). */
export function appendMessage(list: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const next = [...list, msg];
  return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
}

export function useLiveChat(streamId: string, senderName: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !streamId) return;
    // `self: true` → the sender receives their own message through the same
    // path as everyone else (one ordering, no local echo bookkeeping).
    const channel = supabase.channel(`chat:${streamId}`, {
      config: { broadcast: { self: true } },
    });
    channel
      .on('broadcast', { event: 'msg' }, ({ payload }) => {
        const m = payload as ChatMessage;
        if (typeof m?.text !== 'string' || typeof m?.name !== 'string') return;
        setMessages((prev) => appendMessage(prev, m));
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [streamId]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim().slice(0, MAX_TEXT_LEN);
      if (!trimmed || !channelRef.current) return;
      void channelRef.current.send({
        type: 'broadcast',
        event: 'msg',
        payload: {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: senderName || 'Guest',
          text: trimmed,
          at: Date.now(),
        } satisfies ChatMessage,
      });
    },
    [senderName],
  );

  return { messages, send };
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd "c:\Users\Aparup Ghosh\Bible_Read\Frontend" ; npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```powershell
git add Frontend/src/hooks/useLiveChat.ts
git commit -m @'
Add useLiveChat hook (Supabase Realtime broadcast per stream)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 2: Overlay UI (`ChatFeed` + `ChatInputBar`)

**Files:**
- Create: `Frontend/src/components/elegant/LiveChat.tsx`

**Interfaces:**
- Consumes: `ChatMessage` from `../../hooks/useLiveChat`; `Fonts`, `Radii` from `../../theme/elegant`; `Icon` from `./Icons` (has a `send`-suitable glyph? **check `Icons.tsx` first** — if there is no `send`/`arrowUp` icon, add one following the file's own instructions: 24×24 viewBox, stroke ~1.5, round caps; e.g. `send: <Path d="M4 12 20 4l-4 16-4.5-6.5L4 12z" />` shaped to match the set).
- Produces (used by Task 3):
  ```tsx
  export function ChatFeed({ messages }: { messages: ChatMessage[] }): JSX.Element
  export function ChatInputBar({ onSend, bottomInset }: { onSend: (text: string) => void; bottomInset: number }): JSX.Element
  ```

- [ ] **Step 1: Write the components**

```tsx
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
```

- [ ] **Step 2: Add the `send` icon if `Icons.tsx` lacks one**

Open `Frontend/src/components/elegant/Icons.tsx`, check the glyph map. If no send-style icon exists, register (matching the file's existing structure — same stroke conventions as neighbours):

```tsx
send: (
  <>
    <Path d="M20 4 4 11l6 2.5L12.5 20 20 4z" />
    <Path d="M10 13.5 20 4" />
  </>
),
```

If the icon set uses a `name` union type, add `'send'` to it.

- [ ] **Step 3: Verify it type-checks**

Run: `cd "c:\Users\Aparup Ghosh\Bible_Read\Frontend" ; npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```powershell
git add Frontend/src/components/elegant/LiveChat.tsx Frontend/src/components/elegant/Icons.tsx
git commit -m @'
Add live-chat overlay components (feed + input bar)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 3: Wire chat into the two live screens

**Files:**
- Modify: `Frontend/src/screens/LiveViewerScreen.tsx` (feed + input while watching)
- Modify: `Frontend/src/screens/LiveStreamScreen.tsx` (read-only feed while broadcasting)

**Interfaces:**
- Consumes: `useLiveChat(streamId, senderName)` (Task 1), `ChatFeed`, `ChatInputBar` (Task 2), `useAppStore` profile (`profile.displayName`).
- Produces: nothing new — end-user feature.

- [ ] **Step 1: LiveViewerScreen — imports and hook**

Add imports:

```tsx
import { KeyboardAvoidingView, Platform } from 'react-native'; // merge into the existing react-native import
import { useAppStore } from '../store/useAppStore';
import { useLiveChat } from '../hooks/useLiveChat';
import { ChatFeed, ChatInputBar } from '../components/elegant/LiveChat';
```

Inside the component (after `const rtcToken = useRtcToken();`):

```tsx
const profile = useAppStore((s) => s.profile);
const { messages, send } = useLiveChat(streamId, profile.displayName);
```

- [ ] **Step 2: LiveViewerScreen — replace the bottom overlay block**

The current `phase === 'watching'` bottom overlay (the `position: 'absolute'` view containing the title/viewer-count info card, around lines 193–207) becomes a keyboard-aware column: chat feed above the info card, input bar below it. Replace that block with:

```tsx
{phase === 'watching' && (
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 8 }}
  >
    <View style={{ paddingHorizontal: 20, gap: 10 }}>
      <ChatFeed messages={messages} />
      <View style={{ backgroundColor: 'rgba(12,9,6,0.62)', borderWidth: 1, borderColor: 'rgba(232,203,143,0.22)', borderRadius: Radii.xl, paddingVertical: 12, paddingHorizontal: 18, gap: 4 }}>
        <Text numberOfLines={1} style={{ fontFamily: Fonts.serif, color: '#F5EFDF', fontSize: 18, letterSpacing: 0.3 }}>
          {detail?.title ?? 'Live stream'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="eye" size={12} color="#E8CB8F" strokeWidth={1.6} />
          <Text style={{ color: 'rgba(242,234,218,0.72)', fontSize: 11.5, fontFamily: Fonts.sansLight, letterSpacing: 0.5 }}>
            {detail?.viewerCount ?? 0} watching
          </Text>
        </View>
      </View>
    </View>
    <ChatInputBar onSend={send} bottomInset={insets.bottom} />
  </KeyboardAvoidingView>
)}
```

(The info card is the same content as before, slightly tightened; `Radii`, `Fonts`, `Icon` are already imported in this file.)

- [ ] **Step 3: LiveStreamScreen — read-only feed for the host**

Add imports (merge into existing lines):

```tsx
import { useLiveChat } from '../hooks/useLiveChat';
import { ChatFeed } from '../components/elegant/LiveChat';
```

Inside the component (after `const rtcToken = useRtcToken();`):

```tsx
// Host reads chat and answers on air — no input bar while broadcasting.
const { messages } = useLiveChat(streamId ?? '', profile.displayName);
```

In the JSX, the existing `{isBroadcasting && (…status card…)}` block (absolute view at `bottom: insets.bottom + 150`) gets the feed stacked above the status card:

```tsx
{isBroadcasting && (
  <View style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 130, paddingHorizontal: 22, zIndex: 8, gap: 10 }}>
    <ChatFeed messages={messages} />
    <View style={{ backgroundColor: 'rgba(12,9,6,0.62)', borderWidth: 1, borderColor: 'rgba(232,203,143,0.22)', borderRadius: Radii.md, paddingVertical: 14, paddingHorizontal: 16 }}>
      <Text style={{ color: '#EEDFBE', fontSize: 12, fontFamily: Fonts.sans, letterSpacing: 0.4 }}>
        {status === 'connecting' ? 'Starting…' : `${viewers} watching · live in the BibleWay feed`}
      </Text>
    </View>
  </View>
)}
```

(`useLiveChat` no-ops while `streamId` is null/'' — before GO LIVE — because the hook guards on falsy `streamId`.)

- [ ] **Step 4: Verify it type-checks**

Run: `cd "c:\Users\Aparup Ghosh\Bible_Read\Frontend" ; npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 5: Commit**

```powershell
git add Frontend/src/screens/LiveViewerScreen.tsx Frontend/src/screens/LiveStreamScreen.tsx
git commit -m @'
Overlay live chat on viewer and host live screens

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 4: Browser harness + end-to-end verification

**Files:**
- Create: `supabase-chat-test.html` (repo root)
- Modify: `.gitignore` (add `supabase-chat-test.html`, next to the existing `agora-web-test.html` entry)

**Interfaces:**
- Consumes: the same channel name convention `chat:{streamId}` and event `msg` from Task 1. Payload `{ id, name, text, at }`.
- Produces: manual verification evidence.

- [ ] **Step 1: Write the harness**

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>BibleWay chat harness</title>
  <script
    src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.108.2/dist/umd/supabase.min.js"
    integrity="sha384-JWEyvHh+lRf0sN/WWY+QTQwX+CyWqmNg4tkc8GQzAMEtR2wGNrCJlvnu1lHD1kDm"
    crossorigin="anonymous"></script>
  <style>
    body { font-family: system-ui; background: #111; color: #eee; padding: 24px; }
    #log { font-family: monospace; font-size: 13px; white-space: pre-wrap; color: #9f9; margin-top: 12px; }
    input, button { font-size: 15px; padding: 8px 12px; }
  </style>
</head>
<body>
  <h3>Chat harness — channel <span id="ch"></span></h3>
  <input id="msg" placeholder="message" />
  <button id="send">Send</button>
  <div id="log"></div>
  <script>
    const SUPABASE_URL = 'https://cdrigufdimzswbaalafo.supabase.co';
    const ANON_KEY = 'sb_publishable_u1rpouW75HC4EPX9OFPD_Q_UhBgp5c0'; // publishable key, same one shipped in the app
    const STREAM_ID = 'REPLACE_WITH_LIVE_STREAM_ID'; // GET /streams while a stream is live
    document.getElementById('ch').textContent = 'chat:' + STREAM_ID;
    const log = (m) => (document.getElementById('log').textContent += m + '\n');

    const client = supabase.createClient(SUPABASE_URL, ANON_KEY);
    const channel = client.channel('chat:' + STREAM_ID, { config: { broadcast: { self: true } } });
    channel
      .on('broadcast', { event: 'msg' }, ({ payload }) => log(`${payload.name}: ${payload.text}`))
      .subscribe((status) => log('channel: ' + status));

    document.getElementById('send').onclick = () => {
      const text = document.getElementById('msg').value.trim();
      if (!text) return;
      channel.send({ type: 'broadcast', event: 'msg',
        payload: { id: String(Date.now()), name: 'WebTester', text, at: Date.now() } });
      document.getElementById('msg').value = '';
    };
  </script>
</body>
</html>
```

- [ ] **Step 2: Two-tab smoke test (no phone needed)**

1. Set `STREAM_ID` to any string (e.g. `local-test`) — broadcast channels need no server-side setup.
2. Open the file in two browser tabs.
3. Both tabs show `channel: SUBSCRIBED`.
4. Send from tab A → message appears in BOTH tabs (self-echo on A proves `self: true`; delivery on B proves fan-out).

Expected: messages flow both directions within ~1s.

- [ ] **Step 3: Phone ↔ browser verification (after the APK from Task 5 is installed)**

1. Phone: GO LIVE. Get the live stream id: `Invoke-RestMethod https://bibleway-api.onrender.com/api/v1/streams | ConvertTo-Json -Depth 5` → `items[0].id`.
2. Put that id in `STREAM_ID`, reload the harness tab.
3. Type in the tab → message appears over the host's video on the phone.
4. Second device (or same phone after END, viewing someone else's stream): viewer sends from the app input → appears in harness tab and on host phone.

Expected: all three directions deliver.

- [ ] **Step 4: Commit the gitignore entry**

```powershell
git add .gitignore
git commit -m @'
Ignore supabase-chat-test.html harness

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 5: Ship

**Files:** none new — push + EAS build.

- [ ] **Step 1: Push**

```powershell
git -C "c:\Users\Aparup Ghosh\Bible_Read" push origin main
```

- [ ] **Step 2: Build the preview APK**

```powershell
cd "c:\Users\Aparup Ghosh\Bible_Read\Frontend"
npx eas-cli build --profile preview --platform android --non-interactive --no-wait
```

JS-only change riding the existing native shell — but preview APKs embed the JS bundle, so a rebuild is still required. Poll `npx eas-cli build:view <id> --json` until `FINISHED`, install the artifact APK, then run Task 4 Step 3.

- [ ] **Step 3: Verify on device**

GO LIVE on the phone; from the browser harness send a message; confirm it renders over the video. This is the accept gate for the whole plan.

---

## Deliberate simplifications (ponytail ledger)

- **No message persistence / history** — broadcast only. Add a `stream_messages` table + Realtime Postgres Changes when replay or moderation history is needed.
- **No moderation/rate limiting** — anyone with the publishable key can post into a channel. Acceptable pre-launch; before public release, switch Realtime to private channels (RLS-authorized broadcast) so only signed-in users can send.
- **Host has no input bar** — hosts answer on camera. Add `ChatInputBar` to the host screen if requested.
- **No unread badges, reactions, pinned messages** — YAGNI until asked.
