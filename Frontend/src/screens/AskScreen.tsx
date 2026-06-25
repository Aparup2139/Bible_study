import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAskBible } from '../hooks/useAskBible';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';

interface Props {
  onClose: () => void;
}

// ── Local palette: high-contrast "ink on paper", with a warm scripture accent ──
const C = {
  canvas: '#F4F1EC', // warm paper background (makes white cards + gradient pop)
  card: '#FFFFFF', // assistant card
  cardBorder: '#E7E1D8',
  ink: '#15141A', // near-black body text — high contrast
  inkSoft: '#5B5660', // secondary text
  quoteBg: '#FBF4E6', // parchment for verse quotes
  quoteRule: '#C8962C', // gold rule
  quoteInk: '#2C2419', // deep ink-brown for verse text
  chipBg: '#2C2440',
  caret: Colors.primary,
};
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

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

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight markdown → blocks (bold runs, scripture blockquotes, paragraphs).
// Parsed once from the FULL answer, so the streaming reveal just slices the
// already-structured runs — no half-typed "**" artifacts.
// ─────────────────────────────────────────────────────────────────────────────
interface Run {
  text: string;
  bold: boolean;
}
interface Block {
  type: 'p' | 'quote' | 'h';
  runs: Run[];
}

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
    if (t.startsWith('>')) {
      flushPara();
      quote.push(t.replace(/^>+\s?/, ''));
    } else if (/^#{1,6}\s/.test(t)) {
      flushQuote();
      flushPara();
      blocks.push({ type: 'h', runs: parseInline(t.replace(/^#{1,6}\s/, '')) });
    } else if (t === '') {
      flushQuote();
      flushPara();
    } else {
      flushQuote();
      para.push(t);
    }
  }
  flushQuote();
  flushPara();
  return blocks;
}

// ── Character-by-character reveal, with length-bounded duration ───────────────
function useReveal(total: number, animate: boolean) {
  const [revealed, setRevealed] = useState(animate ? 0 : total);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!animate || total <= 0) {
      setRevealed(total);
      return;
    }
    setRevealed(0);
    const TICK = 16; // ~60fps
    const durationMs = Math.min(Math.max(total * 16, 700), 6000);
    const step = Math.max(1, Math.ceil(total / (durationMs / TICK)));
    timer.current = setInterval(() => {
      setRevealed((r) => {
        const next = r + step;
        if (next >= total) {
          if (timer.current) clearInterval(timer.current);
          return total;
        }
        return next;
      });
    }, TICK);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [total, animate]);

  const skip = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    setRevealed(total);
  }, [total]);

  return { revealed, skip, done: revealed >= total };
}

function Caret() {
  return <Text style={styles.caret}>▋</Text>;
}

// Renders the parsed blocks up to `revealed` characters, with a caret at the frontier.
function ScriptureBody({
  text,
  animate,
  onGrow,
}: {
  text: string;
  animate: boolean;
  onGrow: () => void;
}) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  const total = useMemo(
    () => blocks.reduce((n, b) => n + b.runs.reduce((m, r) => m + r.text.length, 0), 0),
    [blocks],
  );
  const { revealed, skip, done } = useReveal(total, animate);

  useEffect(() => {
    onGrow();
  }, [revealed, onGrow]);

  // Precompute each block's [start,end) char range to find the caret's block.
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

  const frontier = done
    ? -1
    : ranges.findIndex(([s, e]) => revealed >= s && revealed <= e && revealed < e + 1);

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
        <Text key={ri} style={run.bold ? styles.bold : undefined}>
          {run.text.slice(0, visLen)}
        </Text>,
      );
    }
    const caret = !done && bi === frontier ? <Caret /> : null;
    if (spans.length === 0 && !caret) return null;

    if (block.type === 'quote') {
      return (
        <View key={bi} style={styles.quoteWrap}>
          <View style={styles.quoteRule} />
          <Text style={styles.quoteText}>
            {spans}
            {caret}
          </Text>
        </View>
      );
    }
    return (
      <Text key={bi} style={[styles.body, block.type === 'h' && styles.heading]}>
        {spans}
        {caret}
      </Text>
    );
  });

  return (
    <TouchableOpacity activeOpacity={1} onPress={skip} disabled={done}>
      <View style={styles.bodyStack}>{content}</View>
    </TouchableOpacity>
  );
}

function ReferenceChips({ references }: { references: string[] }) {
  if (references.length === 0) return null;
  return (
    <View style={styles.chips}>
      {references.map((r) => (
        <View key={r} style={styles.chip}>
          <Text style={styles.chipText}>📖 {r}</Text>
        </View>
      ))}
    </View>
  );
}

function TypingDots() {
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
    <View style={styles.dots}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            { opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }), transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] },
          ]}
        />
      ))}
    </View>
  );
}

function FadeIn({ children, style }: { children: React.ReactNode; style?: any }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function AskScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
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
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'assistant', text: res.answer, references: res.references, animate: true },
        ]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            text: err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.',
            references: [],
            animate: false,
            error: true,
          },
        ]);
      }
      scrollToEnd();
    },
    [ask, scrollToEnd],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setInput('');
  }, []);

  const canSend = input.trim().length > 0 && !ask.isPending;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <LinearGradient colors={[Colors.gradientRedStart, Colors.gradientRedEnd]} style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn} activeOpacity={0.85} hitSlop={8}>
            <Text style={styles.headerBtnIcon}>✕</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Ask the Bible</Text>
            <Text style={styles.headerSubtitle}>Answers grounded in Scripture 📖</Text>
          </View>
          <TouchableOpacity onPress={reset} style={styles.headerBtn} activeOpacity={0.85} hitSlop={8}>
            <Text style={styles.headerBtnIconSmall}>✎</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToEnd}
        >
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <LinearGradient colors={[Colors.gradientRedStart, Colors.gradientRedEnd]} style={styles.emptyBadge}>
                <Text style={styles.emptyBadgeIcon}>📖</Text>
              </LinearGradient>
              <Text style={styles.emptyTitle}>Ask anything, anytime</Text>
              <Text style={styles.emptyText}>
                Every answer is rooted in the teaching of the Bible and quotes the verses behind it.
              </Text>
              <View style={styles.exampleList}>
                {EXAMPLES.map((ex) => (
                  <TouchableOpacity key={ex} style={styles.exampleCard} activeOpacity={0.8} onPress={() => send(ex)}>
                    <Text style={styles.exampleText}>{ex}</Text>
                    <Text style={styles.exampleChevron}>→</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            messages.map((m) =>
              m.role === 'user' ? (
                <FadeIn key={m.id} style={styles.userRow}>
                  <LinearGradient
                    colors={[Colors.primary, Colors.primaryDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.userBubble}
                  >
                    <Text style={styles.userText}>{m.text}</Text>
                  </LinearGradient>
                </FadeIn>
              ) : (
                <FadeIn key={m.id} style={styles.assistantRow}>
                  <View style={styles.assistantHeader}>
                    <LinearGradient colors={[Colors.gradientRedStart, Colors.gradientRedEnd]} style={styles.avatar}>
                      <Text style={styles.avatarIcon}>📖</Text>
                    </LinearGradient>
                    <Text style={styles.assistantName}>BibleWay</Text>
                  </View>
                  <View style={[styles.assistantCard, m.error && styles.errorCard]}>
                    {m.error ? (
                      <Text style={styles.errorText}>{m.text}</Text>
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
            <View style={styles.assistantRow}>
              <View style={styles.assistantHeader}>
                <LinearGradient colors={[Colors.gradientRedStart, Colors.gradientRedEnd]} style={styles.avatar}>
                  <Text style={styles.avatarIcon}>📖</Text>
                </LinearGradient>
                <Text style={styles.assistantName}>BibleWay</Text>
              </View>
              <View style={[styles.assistantCard, styles.typingCard]}>
                <TypingDots />
              </View>
            </View>
          )}
        </ScrollView>

        {/* Composer */}
        <View style={[styles.composer, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <Text style={styles.disclaimer}>AI study aid — always weigh answers against Scripture.</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Ask a question…"
              placeholderTextColor={C.inkSoft}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => send(input)}
              returnKeyType="send"
              multiline
            />
            <TouchableOpacity onPress={() => send(input)} disabled={!canSend} activeOpacity={0.85}>
              <LinearGradient
                colors={canSend ? [Colors.primary, Colors.primaryDark] : ['#D9D4CC', '#D9D4CC']}
                style={styles.sendBtn}
              >
                <Text style={[styles.sendIcon, !canSend && styles.sendIconOff]}>➤</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas },
  flex: { flex: 1 },

  // Header
  header: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.base },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnIcon: { color: '#fff', fontSize: Typography.lg, fontWeight: Typography.bold },
  headerBtnIconSmall: { color: '#fff', fontSize: Typography.base, fontWeight: Typography.bold },
  headerTitleWrap: { alignItems: 'center', flex: 1 },
  headerTitle: { color: '#fff', fontSize: Typography.xl, fontWeight: Typography.bold, letterSpacing: 0.2 },
  headerSubtitle: { color: 'rgba(255,255,255,0.92)', fontSize: Typography.sm, marginTop: 2 },

  // Scroll
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.lg, flexGrow: 1 },

  // Empty state
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing['3xl'] },
  emptyBadge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg },
  emptyBadgeIcon: { fontSize: 34 },
  emptyTitle: { fontSize: Typography['2xl'], fontWeight: Typography.bold, color: C.ink },
  emptyText: { fontSize: Typography.base, color: C.inkSoft, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22, paddingHorizontal: Spacing.base },
  exampleList: { alignSelf: 'stretch', marginTop: Spacing.xl, gap: Spacing.md },
  exampleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.base,
  },
  exampleText: { color: C.ink, fontSize: Typography.base, fontWeight: Typography.medium, flex: 1 },
  exampleChevron: { color: Colors.primary, fontSize: Typography.lg, fontWeight: Typography.bold, marginLeft: Spacing.sm },

  // User
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '86%',
    borderRadius: BorderRadius['2xl'],
    borderBottomRightRadius: 6,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  userText: { color: '#fff', fontSize: Typography.base, lineHeight: 23, fontWeight: Typography.medium },

  // Assistant
  assistantRow: { alignItems: 'flex-start' },
  assistantHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm, marginLeft: 2 },
  avatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarIcon: { fontSize: 14 },
  assistantName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: C.inkSoft, letterSpacing: 0.3 },
  assistantCard: {
    maxWidth: '94%',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: BorderRadius.xl,
    borderTopLeftRadius: 6,
    padding: Spacing.base,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  typingCard: { paddingVertical: Spacing.base + 2 },
  errorCard: { backgroundColor: '#FDECEC', borderColor: '#F6C9C9' },
  errorText: { color: '#B3261E', fontSize: Typography.base, lineHeight: 22 },

  // Body text — high contrast
  bodyStack: { gap: Spacing.md },
  body: { color: C.ink, fontSize: Typography.base, lineHeight: 25 },
  heading: { fontWeight: Typography.bold, fontSize: Typography.lg, color: C.ink },
  bold: { fontWeight: Typography.bold, color: C.ink },
  caret: { color: C.caret, fontSize: Typography.base, fontWeight: Typography.bold },

  // Scripture quote
  quoteWrap: { flexDirection: 'row', backgroundColor: C.quoteBg, borderRadius: BorderRadius.lg, overflow: 'hidden' },
  quoteRule: { width: 4, backgroundColor: C.quoteRule },
  quoteText: {
    flex: 1,
    color: C.quoteInk,
    fontSize: Typography.base,
    lineHeight: 26,
    fontStyle: 'italic',
    fontFamily: SERIF,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
  },

  // Reference chips
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.base },
  chip: { backgroundColor: C.chipBg, borderRadius: BorderRadius.full, paddingVertical: 5, paddingHorizontal: 11 },
  chipText: { color: '#fff', fontSize: Typography.xs, fontWeight: Typography.semibold, letterSpacing: 0.2 },

  // Typing dots
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center', height: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },

  // Composer
  composer: { backgroundColor: C.canvas, borderTopWidth: 1, borderTopColor: C.cardBorder, paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  disclaimer: { fontSize: Typography.xs, color: C.inkSoft, textAlign: 'center', marginBottom: Spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  input: {
    flex: 1,
    maxHeight: 130,
    minHeight: 48,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: BorderRadius['2xl'],
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    fontSize: Typography.base,
    color: C.ink,
  },
  sendBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  sendIcon: { color: '#fff', fontSize: Typography.lg, fontWeight: Typography.bold, marginLeft: 2 },
  sendIconOff: { color: '#8A8A8A' },
});
