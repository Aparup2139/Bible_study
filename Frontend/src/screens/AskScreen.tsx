import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, ScrollView, Text, TextInput, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAskBible } from '../hooks/useAskBible';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radii } from '../theme/elegant';
import { Icon } from '../components/elegant/Icons';
import { GlassCircle, PressScale } from '../components/elegant/Kit';
import { StickyInputBar } from '../components/elegant/Keyboard';

interface Props {
  onClose: () => void;
}

const EXAMPLES = [
  'What does the Bible say about anxiety?',
  'How do I forgive someone who hurt me?',
  'Where can I find hope when I feel lost?',
];

let _id = 0;
const nextId = () => `m${Date.now()}_${_id++}`;

type Role = 'user' | 'assistant';
interface ChatMsg {
  id: string;
  role: Role;
  text: string;
  references: string[];
  animate: boolean;
  error?: boolean;
}

// ── Lightweight markdown → blocks (bold runs, scripture blockquotes, paragraphs) ──
interface Run { text: string; bold: boolean; }
interface Block { type: 'p' | 'quote' | 'h'; runs: Run[]; }

function parseInline(s: string): Run[] {
  const runs: Run[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index), bold: false });
    runs.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) runs.push({ text: s.slice(last), bold: false });
  return runs.length ? runs : [{ text: s, bold: false }];
}

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let quote: string[] = [];
  const flushPara = () => {
    const j = para.join(' ').trim();
    if (j) blocks.push({ type: 'p', runs: parseInline(j) });
    para = [];
  };
  const flushQuote = () => {
    const j = quote.join(' ').replace(/\s+/g, ' ').trim();
    if (j) blocks.push({ type: 'quote', runs: parseInline(j) });
    quote = [];
  };
  for (const raw of lines) {
    const t = raw.trim();
    if (t.startsWith('>')) { flushPara(); quote.push(t.replace(/^>+\s?/, '')); }
    else if (/^#{1,6}\s/.test(t)) { flushQuote(); flushPara(); blocks.push({ type: 'h', runs: parseInline(t.replace(/^#{1,6}\s/, '')) }); }
    else if (t === '') { flushQuote(); flushPara(); }
    else { flushQuote(); para.push(t); }
  }
  flushQuote(); flushPara();
  return blocks;
}

// ── Character-by-character reveal ──
function useReveal(total: number, animate: boolean) {
  const [revealed, setRevealed] = useState(animate ? 0 : total);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!animate || total <= 0) { setRevealed(total); return; }
    setRevealed(0);
    const TICK = 16;
    const durationMs = Math.min(Math.max(total * 16, 700), 6000);
    const step = Math.max(1, Math.ceil(total / (durationMs / TICK)));
    timer.current = setInterval(() => {
      setRevealed((r) => {
        const next = r + step;
        if (next >= total) { if (timer.current) clearInterval(timer.current); return total; }
        return next;
      });
    }, TICK);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [total, animate]);
  const skip = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    setRevealed(total);
  }, [total]);
  return { revealed, skip, done: revealed >= total };
}

function ScriptureBody({ text, animate, onGrow }: { text: string; animate: boolean; onGrow: () => void }) {
  const { c } = useTheme();
  const blocks = useMemo(() => parseBlocks(text), [text]);
  const total = useMemo(
    () => blocks.reduce((n, b) => n + b.runs.reduce((m, r) => m + r.text.length, 0), 0),
    [blocks],
  );
  const { revealed, skip, done } = useReveal(total, animate);
  useEffect(() => { onGrow(); }, [revealed, onGrow]);

  const ranges = useMemo(() => {
    const out: Array<[number, number]> = [];
    let off = 0;
    for (const b of blocks) {
      const len = b.runs.reduce((m, r) => m + r.text.length, 0);
      out.push([off, off + len]);
      off += len;
    }
    return out;
  }, [blocks]);

  const content = blocks.map((block, bi) => {
    const [start] = ranges[bi];
    if (revealed <= start && !(revealed === start && bi === 0)) return null;
    let consumed = start;
    const spans: React.ReactNode[] = [];
    for (let ri = 0; ri < block.runs.length; ri++) {
      const run = block.runs[ri];
      const visLen = Math.max(0, Math.min(run.text.length, revealed - consumed));
      consumed += run.text.length;
      if (visLen <= 0) continue;
      spans.push(
        <Text key={ri} style={run.bold ? { fontFamily: Fonts.sansSemi, color: c.ink } : undefined}>
          {run.text.slice(0, visLen)}
        </Text>,
      );
    }
    if (spans.length === 0) return null;

    if (block.type === 'quote') {
      return (
        <View key={bi} style={{ flexDirection: 'row', backgroundColor: c.goldSoft, borderRadius: Radii.sm, overflow: 'hidden' }}>
          <View style={{ width: 3, backgroundColor: c.gold }} />
          <Text style={{ flex: 1, color: c.ink, fontSize: 15.5, lineHeight: 25, fontStyle: 'italic', fontFamily: Fonts.serifItalic, paddingVertical: 13, paddingHorizontal: 16 }}>
            {spans}
          </Text>
        </View>
      );
    }
    return (
      <Text
        key={bi}
        style={
          block.type === 'h'
            ? { fontFamily: Fonts.serif, fontSize: 17, color: c.ink }
            : { color: c.ink, fontSize: 13.5, lineHeight: 24, fontFamily: Fonts.sansLight, letterSpacing: 0.2 }
        }
      >
        {spans}
      </Text>
    );
  });

  return (
    <PressScale to={1} onPress={skip} disabled={done}>
      <View style={{ gap: 13 }}>{content}</View>
    </PressScale>
  );
}

function ReferenceChips({ references }: { references: string[] }) {
  const { c } = useTheme();
  if (references.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13 }}>
      {references.map((r) => (
        <View key={r} style={{ borderWidth: 1, borderColor: c.hairline, borderRadius: Radii.pill, paddingVertical: 4, paddingHorizontal: 11 }}>
          <Text style={{ color: c.gold, fontSize: 10, fontFamily: Fonts.sansMed, letterSpacing: 0.6 }}>{r}</Text>
        </View>
      ))}
    </View>
  );
}

function TypingDots() {
  const { c } = useTheme();
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(d, { toValue: 1, duration: 320, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(d, { toValue: 0, duration: 320, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', height: 12 }}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={{
            width: 7, height: 7, borderRadius: 4, backgroundColor: c.gold,
            opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
            transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
          }}
        />
      ))}
    </View>
  );
}

function FadeIn({ children, style }: { children: React.ReactNode; style?: any }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

function AssistantLabel() {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginLeft: 2 }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.goldSoft, borderWidth: 1, borderColor: c.hairline, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="book" size={11} color={c.gold} strokeWidth={1.6} />
      </View>
      <Text style={{ fontSize: 9, fontFamily: Fonts.sansSemi, color: c.ink3, letterSpacing: 2.4 }}>BIBLEWAY</Text>
    </View>
  );
}

export function AskScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { c, elev } = useTheme();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const ask = useAskBible();

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || ask.isPending) return;
      setInput('');
      setMessages((prev) => [...prev, { id: nextId(), role: 'user', text: question, references: [], animate: false }]);
      scrollToEnd();
      try {
        const res = await ask.mutateAsync(question);
        setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: res.answer, references: res.references, animate: true }]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(), role: 'assistant',
            text: err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.',
            references: [], animate: false, error: true,
          },
        ]);
      }
      scrollToEnd();
    },
    [ask, scrollToEnd],
  );

  const reset = useCallback(() => { setMessages([]); setInput(''); }, []);
  const canSend = input.trim().length > 0 && !ask.isPending;

  const card = {
    backgroundColor: c.surface2, borderWidth: 1, borderColor: c.hairlineSoft,
    borderRadius: Radii.lg, borderTopLeftRadius: 5, padding: 16,
    ...elev.card,
  } as const;

  return (
    <View style={{ flex: 1, backgroundColor: c.sheet, paddingTop: insets.top }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.hairlineSoft }}>
        <GlassCircle icon="x" onPress={onClose} />
        <View style={{ alignItems: 'center', gap: 3 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 21, color: c.ink, letterSpacing: 0.4 }}>Ask the Bible</Text>
          <Text style={{ fontSize: 8.5, fontFamily: Fonts.sansMed, color: c.ink3, letterSpacing: 2.2, textTransform: 'uppercase' }}>
            Grounded in Scripture
          </Text>
        </View>
        <GlassCircle icon="pen" onPress={reset} iconSize={14} />
      </View>

      <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, gap: 18, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToEnd}
        >
          {messages.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 34 }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 1, borderColor: c.hairline, backgroundColor: c.goldSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                <Icon name="book" size={30} color={c.gold} strokeWidth={1.4} />
              </View>
              <Text style={{ fontFamily: Fonts.serif, fontSize: 25, color: c.ink }}>Ask anything, anytime</Text>
              <Text style={{ fontSize: 12.5, fontFamily: Fonts.sansLight, color: c.ink2, textAlign: 'center', marginTop: 8, lineHeight: 21, paddingHorizontal: 22, letterSpacing: 0.2 }}>
                Every answer is rooted in the teaching of the Bible and quotes the verses behind it.
              </Text>
              <View style={{ alignSelf: 'stretch', marginTop: 26, gap: 10 }}>
                {EXAMPLES.map((ex) => (
                  <PressScale key={ex} onPress={() => send(ex)} to={0.98}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairlineSoft, borderRadius: Radii.md, paddingVertical: 15, paddingHorizontal: 17, ...elev.card }}>
                      <Text style={{ color: c.ink, fontSize: 13, fontFamily: Fonts.sans, flex: 1, letterSpacing: 0.2 }}>{ex}</Text>
                      <View style={{ marginLeft: 10 }}>
                        <Icon name="arrowRight" size={14} color={c.gold} strokeWidth={1.6} />
                      </View>
                    </View>
                  </PressScale>
                ))}
              </View>
            </View>
          ) : (
            messages.map((m) =>
              m.role === 'user' ? (
                <FadeIn key={m.id} style={{ alignItems: 'flex-end' }}>
                  <LinearGradient
                    colors={[c.goldBright, c.gold]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={{ maxWidth: '84%', borderRadius: Radii.lg, borderBottomRightRadius: 5, paddingVertical: 11, paddingHorizontal: 16 }}
                  >
                    <Text style={{ color: c.onGold, fontSize: 13.5, lineHeight: 21, fontFamily: Fonts.sansMed, letterSpacing: 0.2 }}>{m.text}</Text>
                  </LinearGradient>
                </FadeIn>
              ) : (
                <FadeIn key={m.id} style={{ alignItems: 'flex-start' }}>
                  <AssistantLabel />
                  <View style={[card, { maxWidth: '94%' }, m.error && { borderColor: 'rgba(230,114,96,0.4)', backgroundColor: 'rgba(230,114,96,0.08)' }]}>
                    {m.error ? (
                      <Text style={{ color: c.live, fontSize: 13.5, lineHeight: 21, fontFamily: Fonts.sans }}>{m.text}</Text>
                    ) : (
                      <>
                        <ScriptureBody text={m.text} animate={m.animate} onGrow={scrollToEnd} />
                        <ReferenceChips references={m.references} />
                      </>
                    )}
                  </View>
                </FadeIn>
              ),
            )
          )}

          {ask.isPending && (
            <View style={{ alignItems: 'flex-start' }}>
              <AssistantLabel />
              <View style={[card, { paddingVertical: 17 }]}>
                <TypingDots />
              </View>
            </View>
          )}
        </ScrollView>

        {/* composer */}
        <StickyInputBar style={{ borderTopWidth: 1, borderTopColor: c.hairlineSoft, paddingHorizontal: 18, paddingTop: 10 }}>
          <Text style={{ fontSize: 9, fontFamily: Fonts.sans, color: c.ink3, textAlign: 'center', marginBottom: 9, letterSpacing: 0.8 }}>
            AI study aid — always weigh answers against Scripture.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 9 }}>
            <TextInput
              style={{
                flex: 1, minHeight: 48, maxHeight: 120,
                backgroundColor: c.input, borderWidth: 1, borderColor: c.hairlineSoft,
                borderRadius: 24, paddingHorizontal: 18, paddingVertical: 13,
                fontSize: 13.5, fontFamily: Fonts.sansLight, color: c.ink,
              }}
              placeholder="Ask a question…"
              placeholderTextColor={c.ink3}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => send(input)}
              returnKeyType="send"
              multiline
            />
            <PressScale onPress={() => send(input)} disabled={!canSend} to={0.9}>
              <LinearGradient
                colors={canSend ? [c.hopeBright, c.hope] : [c.surface2, c.surface2]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: canSend ? c.hopeBorder : c.hairlineSoft, ...elev.chip }}
              >
                <Icon name="send" size={17} color={canSend ? c.onHope : c.ink3} strokeWidth={1.8} />
              </LinearGradient>
            </PressScale>
          </View>
        </StickyInputBar>
    </View>
  );
}
