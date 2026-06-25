# BibleAgent — AI scripture answers (implementation plan)

*A study assistant where every question is answered with **real, cited Bible verses** — grounded in a
verified corpus, not the model's memory.*

This is the build-ready spec for an AI agent feature in BibleWay, written to the same standard as
`Chatroom.md` and the `PHASE1`–`PHASE3` notes (real SQL, real endpoints, real frontend wiring,
following the 10 golden rules in `BACKEND_PLAN.md`).

It's a **lower-risk, faster** build than the audio rooms: no WebRTC, no Expo-Go dev-build problem.
It plays to what you already have — NestJS, Supabase (which ships **pgvector**), `api.ts`, React
Query, the overlay-screen pattern — and reuses your **denomination** feature as its differentiator.

> **Scope note:** this is a *different product* from `Chatroom.md` (personal study vs. live
> community), not a drop-in replacement. It's an excellent first/MVP and can later live *inside* a
> room. This doc stands alone; ship either or both.

---

## 0. What it is (and isn't)

- **Is:** ask a question in plain language → get a concise, pastoral answer that **quotes and cites
  actual scripture** (book/chapter/verse), with tappable verse cards that open the full passage.
- **Isn't:** an oracle that speaks *for* God, a replacement for clergy/community, or a model riffing
  scripture from memory. It's a study *assistant* that always shows its sources.

---

## 1. ⭐ The one rule that makes this work: the citation guarantee

A Bible app dies the instant it misquotes or invents a verse — and LLMs do exactly that when asked to
recall scripture. So the entire architecture exists to enforce one rule:

> **The model never produces verse text from memory. Verse text only ever comes from our database.
> The model's job is to *select, explain, and cite* — not to *recall*.**

We enforce it three ways:

1. **Retrieval-grounded (RAG):** we vector-search a verified Bible corpus, inject the *actual verse
   text* into the prompt, and instruct the model to answer **only** from those verses.
2. **Server-side citation validation:** after generation, every reference the model cites is checked
   against the retrieved set. Any reference that wasn't in the supplied verses is dropped/flagged —
   so a hallucinated citation can never reach the user.
3. **Honest fallback:** if the retrieved verses don't actually address the question, the agent says so
   ("Scripture doesn't speak directly to this, but a related principle is…") instead of forcing a
   verse. No proof-texting.

Everything below is in service of that rule.

---

## 2. Architecture at a glance

```
  React Native app                          NestJS API (AgentModule)
 ┌────────────────────┐   POST /agent/ask  ┌───────────────────────────────────────┐
 │  AskScreen          │ ─────────────────▶ │ 1. embed(question)        ──▶ Voyage AI │
 │  - question box     │                    │ 2. hybrid retrieve top-k  ──▶ Postgres  │
 │  - streamed answer  │ ◀───── stream ──── │    (pgvector + tsvector)     (corpus)   │
 │  - verse cards 📖    │                    │ 3. safety pre-check                     │
 │  - history          │                    │ 4. compose answer (verses) ─▶ Claude    │
 └────────────────────┘                    │ 5. VALIDATE citations vs. retrieved set │
                                            │ 6. persist Q&A + citations              │
                                            └───────────────────────────────────────┘
                                                   │                    │
                                                   ▼                    ▼
                                         Supabase Postgres        Redis (answer cache,
                                         bible_verses (embeddings)  rate limit)
                                         agent_conversations/messages
```

- **Voyage AI** = embeddings (question + corpus). Anthropic's recommended embeddings provider.
- **Claude** = the answer composer (explains + cites; never the source of verse text).
- **pgvector in Supabase** = vector search over the corpus — no new database.
- **Redis** = cache hot/common answers, rate-limit (already wired as `RedisService`).

---

## 3. Data model

New migration, numbered after the current highest (`0005_…`) → e.g. `0006_bible_agent.sql`. Same
conventions as `0004_podcasts.sql`: corpus is world-readable reference data (service-role writes
only), per-user history is owner-only RLS.

```sql
-- 0006_bible_agent.sql
-- AI Bible agent: a verified verse corpus (with embeddings) + per-user Q&A history.
-- Corpus = world-readable reference data; history = owner-only.

set search_path = public;

-- pgvector (ships with Supabase). Dimension MUST match the embedding model output (§4).
create extension if not exists vector with schema extensions;

-- ===========================================================================
-- Bible corpus (world-readable; seeded server-side from a public-domain text)
-- ===========================================================================
create table if not exists public.bible_books (
  id           text primary key,                 -- USFM code, e.g. 'MAT'
  name         text not null,                     -- 'Matthew'
  testament    text not null check (testament in ('OT','NT')),
  sort_order   integer not null,
  chapter_count integer not null default 0
);

create table if not exists public.bible_verses (
  id            text primary key,                 -- '<translation>-<book>-<ch>-<vs>', e.g. 'WEB-MAT-5-3'
  translation   text not null default 'WEB',      -- public-domain by default (see §4)
  book_id       text not null references public.bible_books (id),
  book_name     text not null,                     -- denormalized for display/citations
  chapter       integer not null check (chapter >= 1),
  verse         integer not null check (verse >= 1),
  text          text    not null,
  -- Embedding for semantic search. 1024 = voyage-4 default; change if you pick another dim/model.
  embedding     vector(1024),
  -- Keyword search for hybrid retrieval (exact phrases, names, places).
  search_vector tsvector generated always as (to_tsvector('english', coalesce(text, ''))) stored,
  unique (translation, book_id, chapter, verse)
);

-- Approximate-NN index for cosine similarity (HNSW: fast, good recall).
create index if not exists bible_verses_embedding_idx
  on public.bible_verses using hnsw (embedding vector_cosine_ops);
create index if not exists bible_verses_search_idx
  on public.bible_verses using gin (search_vector);
create index if not exists bible_verses_ref_idx
  on public.bible_verses (translation, book_id, chapter, verse);

-- ===========================================================================
-- Per-user Q&A history (owner-only)
-- ===========================================================================
create table if not exists public.agent_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default 'New conversation',
  created_at timestamptz not null default now()
);
create index if not exists agent_conversations_user_idx
  on public.agent_conversations (user_id, created_at desc, id);

create table if not exists public.agent_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.agent_conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,  -- denormalized for simple RLS
  role            text not null check (role in ('user','assistant')),
  content         text not null,
  -- Citations the assistant used: [{ "ref":"Matthew 5:3", "verseId":"WEB-MAT-5-3", "translation":"WEB" }]
  citations       jsonb not null default '[]',
  created_at      timestamptz not null default now()
);
create index if not exists agent_messages_conv_idx
  on public.agent_messages (conversation_id, created_at, id);

-- Thumbs up/down → quality loop (optional but cheap).
create table if not exists public.agent_feedback (
  message_id uuid not null references public.agent_messages (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  rating     smallint not null check (rating in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.bible_books         enable row level security;
alter table public.bible_verses        enable row level security;
alter table public.agent_conversations enable row level security;
alter table public.agent_messages      enable row level security;
alter table public.agent_feedback      enable row level security;

-- Corpus: world-readable, no client writes (service role seeds it).
drop policy if exists "books readable by everyone" on public.bible_books;
create policy "books readable by everyone" on public.bible_books for select using (true);
drop policy if exists "verses readable by everyone" on public.bible_verses;
create policy "verses readable by everyone" on public.bible_verses for select using (true);

-- History: owner-only for everything.
drop policy if exists "own conversations" on public.agent_conversations;
create policy "own conversations" on public.agent_conversations
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "own messages" on public.agent_messages;
create policy "own messages" on public.agent_messages
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "own feedback" on public.agent_feedback;
create policy "own feedback" on public.agent_feedback
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
```

> **Note on RLS + vector search:** retrieval runs through `supabase.admin` (service role) in the API,
> so it bypasses RLS for the corpus read — fine, the corpus is public anyway. History writes also go
> through the API as the authenticated user.

---

## 4. Corpus ingestion (one-time, idempotent)

**Pick a translation deliberately (this is a legal decision):**

- **Default — WEB (World English Bible):** modern English, **public domain**, free to store/quote at
  scale. Also consider **BSB (Berean Standard Bible)** — freely licensed. Both are available as static
  JSON (e.g. `TehShrike/world-english-bible`, HelloAO Free Use Bible API, bible-api.com).
- **Copyrighted (NIV/ESV/NLT):** require a license — typically via **API.Bible**. Don't ship these
  without one. You can add them later as additional `translation` rows behind licensing.

**Ingestion script** (`backend/scripts/ingest-bible.ts`, run with the service role — not an HTTP
endpoint):

1. Download the WEB JSON once; normalize to `{ book_id, book_name, chapter, verse, text }`
   (~31,000 verses; the whole Bible is ~1M tokens — well within Voyage's free tier).
2. Upsert `bible_books` + `bible_verses` (text first, embeddings null).
3. **Batch-embed** every verse via Voyage (`input_type: 'document'`, e.g. 128 verses/request),
   `UPDATE … set embedding = …`. Idempotent: re-running only fills missing embeddings.
4. For better retrieval, optionally also embed **passage windows** (e.g. 3-verse spans) into a sibling
   table so context-dependent questions match multi-verse ideas — start with single verses; add
   windows if recall is weak.

This runs once (and again only when adding a translation). It's cheap and offline.

---

## 5. Backend — `AgentModule`

Create `backend/api/src/agent/` (flat, like `auth/`, `podcasts/`). Register in `app.module.ts`.

### 5.1 Dependencies & env

```bash
cd backend && npm install @anthropic-ai/sdk --workspace @bibleway/api
# Voyage has no official Node SDK — call its REST API with fetch (built in).
```

Add to `backend/api/src/config/env.ts` (all `.optional()` → API still boots without them; the agent
returns 503 until configured, mirroring `LiveKitService`):

```ts
  // AI Bible agent
  ANTHROPIC_API_KEY:   z.string().min(1).optional(),
  ANTHROPIC_MODEL:     z.string().default('claude-sonnet-4-6'),     // answer composer
  ANTHROPIC_MODEL_FAST:z.string().default('claude-haiku-4-5'),       // safety classifier / cheap path
  VOYAGE_API_KEY:      z.string().min(1).optional(),
  VOYAGE_EMBED_MODEL:  z.string().default('voyage-4-lite'),          // 1024-dim default; matches §3
```

### 5.2 `embeddings.service.ts` — Voyage wrapper

```ts
// POST https://api.voyageai.com/v1/embeddings
// body: { model, input: string[], input_type: 'query' | 'document', output_dimension: 1024 }
async embed(texts: string[], inputType: 'query' | 'document'): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: this.model, input: texts, input_type: inputType, output_dimension: 1024 }),
  });
  if (!res.ok) throw new ServiceUnavailableException('Embedding failed');
  const json = await res.json();
  return json.data.map((d: { embedding: number[] }) => d.embedding);
}
```

Use `input_type: 'query'` for the user's question, `'document'` for corpus ingestion — Voyage tunes
each side, which improves retrieval.

### 5.3 `retrieval.service.ts` — hybrid search

Vector + keyword, merged. Vector catches meaning ("how do I deal with worry?" → Matthew 6,
Philippians 4); keyword catches exact names/places. Run via a Postgres RPC (`supabase.admin.rpc`) so
the `<=>` cosine operator runs in the DB:

```sql
-- migration helper function
create or replace function public.match_verses(query_embedding vector(1024), match_count int)
returns table (id text, ref text, text text, translation text, similarity float)
language sql stable as $$
  select v.id,
         v.book_name || ' ' || v.chapter || ':' || v.verse as ref,
         v.text, v.translation,
         1 - (v.embedding <=> query_embedding) as similarity
  from public.bible_verses v
  where v.embedding is not null
  order by v.embedding <=> query_embedding
  limit match_count;
$$;
```

Service: embed the question → `rpc('match_verses', { query_embedding, match_count: 12 })`; in parallel
run a `websearch_to_tsquery` keyword query; merge by `id`, dedupe, keep top ~8. (Optional: add a
Voyage **reranker** pass for precision once basic retrieval works.)

### 5.4 `llm.service.ts` — Claude wrapper (streaming)

Uses `@anthropic-ai/sdk`. The **system prompt is the safety + grounding contract:**

```
You are a Bible study assistant for the BibleWay app. Answer the user's question using ONLY the
Bible verses provided below. Quote them and cite each as "Book Chapter:Verse". Do not quote or
invent any verse that is not in the provided list. If the provided verses do not address the
question, say so plainly rather than forcing a verse. Be warm, concise, and pastoral. Where
Christian traditions interpret a passage differently, briefly acknowledge that rather than
asserting one view. You are a study aid, not a substitute for a pastor or professional help.

User's tradition: {denomination or "unspecified"}.

Provided verses:
{for each retrieved verse: "[{ref}] {text}"}
```

The verse list is injected from the DB — that is the anti-hallucination guarantee in action.

### 5.5 `agent.service.ts` — orchestration

`ask(userId, question, conversationId?)`:

1. **Safety pre-check** (cheap `ANTHROPIC_MODEL_FAST` classification or rule+model): if the question
   signals crisis/self-harm/abuse → branch to the care response (§8), do **not** just retrieve a verse.
2. **Embed** the question (`'query'`).
3. **Retrieve** top-k verses (§5.3).
4. **Compose** the answer via Claude (§5.4), streaming.
5. **Validate citations:** parse the refs the model cited; keep only those present in the retrieved
   set; drop the rest. If nothing valid remains, return the honest-fallback answer.
6. **Persist** the user + assistant `agent_messages` (with `citations` jsonb); create the conversation
   if new; auto-title from the first question.
7. **Cache** (Redis) the answer keyed by a normalized question hash (+ translation + denomination) for
   a short TTL — common questions ("what does the Bible say about anxiety?") get repeat-cheap.

### 5.6 `agent.controller.ts` — endpoints

| Method & path | Guard | Purpose |
|---|---|---|
| `POST /agent/ask` | `SupabaseAuthGuard` | Ask a question. **Streams** the answer (SSE / `text/event-stream`); final event carries validated `citations`. Body: `{ question, conversationId? }`. |
| `GET /agent/conversations` | `SupabaseAuthGuard` | List the user's conversations (cursor). |
| `GET /agent/conversations/:id/messages` | `SupabaseAuthGuard` | Message history (cursor). |
| `DELETE /agent/conversations/:id` | `SupabaseAuthGuard` | Delete a conversation. |
| `POST /agent/messages/:id/feedback` | `SupabaseAuthGuard` | Thumbs up/down (`{ rating: 1 | -1 }`). |
| `GET /bible/passage` | `OptionalAuthGuard` | Fetch a passage for the reader sheet (`?ref=MAT-5&translation=WEB`), cursor by verse. |

Rate-limit `POST /agent/ask` with the Redis token bucket (e.g. 20/min/user) — protects cost. Use
`class-validator` DTOs like `podcasts.dto.ts`.

---

## 6. Frontend — the **Ask** screen

### 6.1 Wiring (mirrors the existing overlay pattern)

- Add `'askbible'` to `useAppStore.activeScreen` and render `<AskScreen onClose={close} />` as a
  full-screen `Modal` in `app/index.tsx` (exactly like `studychat`).
- Entry point: a prominent "Ask the Bible ✨" action on `HomeScreen` (and/or wire the existing
  `SearchBar` to route faith questions here).

### 6.2 New files

- **`src/types`** (+ mirror in `backend/packages/shared-types`):

```ts
export interface Citation { ref: string; verseId: string; translation: string; }
export interface AgentMessage {
  id: string; role: 'user' | 'assistant'; content: string;
  citations: Citation[]; createdAt: string;
}
export interface AskRequest { question: string; conversationId?: string; }
```

- **`src/hooks/useAskBible.ts`** — sends the question and streams the answer. `api.ts` is `fetch`-based;
  for streaming use **`expo/fetch`** (available in Expo SDK 54) and read the response body
  incrementally, appending tokens to the in-progress assistant message:

```ts
import { fetch as expoFetch } from 'expo/fetch';
// POST /agent/ask, read the SSE stream, call onToken(delta) per chunk,
// then attach the final `citations` from the terminal event.
```

  **MVP shortcut:** ship non-streaming first (`api.post('/agent/ask')` returning
  `{ answer, citations }`), add streaming once the loop works — the UX upgrade is independent of
  correctness.

- **`src/store/useAgentStore.ts`** — zustand (mirror `useLiveStore.ts`): `messages: AgentMessage[]`,
  `currentConversationId`, `isStreaming`, `appendToken`, `addMessage`.

### 6.3 The screen

A chat layout reusing your theme tokens (`Colors`, `Typography`, `Spacing`):

- Question input + send.
- Assistant answers render markdown-ish text with **verse citation chips** built from
  `message.citations`; tapping a chip opens a **passage reader sheet** (`GET /bible/passage`).
- Conversation history drawer (from `GET /agent/conversations`).
- Thumbs up/down per answer → `POST /agent/messages/:id/feedback`.
- Empty state with example prompts ("What does the Bible say about anxiety?", "Who was Ruth?",
  "Verses about forgiveness").

---

## 7. Denomination-aware answers (your differentiator)

A generic "the Bible says X" bot is a commodity. You already have a **denominations** feature and a
per-user `denominationId` — use it. The *same* verse is read differently across traditions
(baptism, communion, salvation, end times, Mary, etc.), so:

- Pass the user's tradition into the system prompt so framing and emphasis fit (a Catholic and a
  Baptist asking about communion should feel understood, not corrected).
- Instruct the model to **acknowledge interpretive differences** rather than assert one view —
  honest, and it defuses the "whose interpretation?" risk.
- **Later (Tier 2):** add a `commentary` corpus (tradition-tagged, embedded alongside verses) so
  answers can cite tradition-appropriate teaching, not just raw verses. This deepens the moat without
  changing the architecture — it's just more rows in a vector table.

This turns the biggest theological *risk* of the idea into the feature competitors won't copy.

## 8. Safety & sensitive topics (non-negotiable)

People will ask a Bible agent about grief, doubt, divorce, sexuality, abuse, and suicide. Firing back
a verse can be harmful. The §5.5 safety pre-check routes these away from the default path:

- **Crisis (self-harm, suicide, abuse):** respond with care and encourage reaching out to a trusted
  person, pastor, or professional/helpline — do **not** reduce it to a verse. Surface region-aware
  resources. Never give methods or anything that could enable harm.
- **Contested/sensitive doctrine:** answer with humility, present scripture *and* note that faithful
  Christians differ; suggest discussing with their faith community.
- **Out of scope (non-faith) questions:** politely redirect ("I'm here to help with the Bible and
  faith…").
- **Abuse/spam:** Redis rate limit + a `banned_users` check (same pattern as the rooms plan).

Ship these with v1, not later. Pair with a visible disclaimer: *"AI study aid — not a substitute for
your pastor or professional help."*

## 9. Build order & effort

| # | Step | Depends on | Effort | Notes |
|---|------|-----------|--------|-------|
| A | Voyage + Anthropic accounts; add env vars | — | S | The unblock step. |
| B | `0006_bible_agent.sql` (pgvector, tables, `match_verses`) | A | S | Enables the corpus + history. |
| C | Corpus ingestion script (WEB) + embeddings | A,B | M | One-time, offline, cheap. |
| D | `AgentModule`: embeddings + retrieval + `/agent/ask` (non-streaming) | B,C | M | **End-to-end demo: ask → cited answer.** |
| E | Citation validation + honest fallback + persistence | D | S | The guarantee + history. |
| F | Frontend `AskScreen` + `useAskBible` (non-streaming) + nav | D | M | First usable feature. |
| G | Safety pre-check + sensitive-topic handling + rate limit | D | M | Required before real users. |
| H | Streaming answers (`expo/fetch` SSE) | F | S | UX polish. |
| I | Denomination-aware framing | F | S | Differentiator. |
| J | Passage reader sheet + feedback + history drawer | F | M | Rounds out the experience. |
| K | Commentary corpus, answer cache, reranker | C,D | M | Quality/scale, as capacity allows. |

**Recommended sequence:** A → B → C → D → E → G → F → then H/I/J/K. Get a *correct* cited answer
(D+E) and make it *safe* (G) before polishing the UI.

## 10. Task checklist

**Foundations**
- [ ] Create Voyage AI + Anthropic API keys; add all agent vars to `backend/.env` + `config/env.ts`.
- [ ] Write + apply `0006_bible_agent.sql` (enable `vector`, tables, RLS, `match_verses` RPC).

**Corpus**
- [ ] Source WEB JSON; normalize to books/verses; upsert `bible_books` + `bible_verses`.
- [ ] Batch-embed all verses (`input_type: 'document'`); backfill `embedding`. Verify HNSW index used.

**Backend (`AgentModule`)**
- [ ] `embeddings.service.ts` (Voyage), `retrieval.service.ts` (hybrid + `match_verses`).
- [ ] `llm.service.ts` (Claude, grounding system prompt), `agent.service.ts` (orchestrate).
- [ ] **Citation validation** against the retrieved set + honest fallback.
- [ ] `/agent/ask` (+ conversations/messages/feedback, `/bible/passage`); Redis rate limit.
- [ ] Safety pre-check + sensitive-topic responses + `banned_users`.

**Frontend**
- [ ] Add `'askbible'` to `useAppStore`; Modal in `app/index.tsx`; Home entry point.
- [ ] Shared types (`Citation`, `AgentMessage`); `useAgentStore`; `useAskBible`.
- [ ] `AskScreen`: input, answer, verse chips → reader sheet, history, feedback, disclaimer.
- [ ] Add streaming via `expo/fetch`; denomination-aware framing.

**Quality (alongside)**
- [ ] Eval set: ~50 questions with expected passages; measure retrieval hit-rate + citation validity.
- [ ] Answer cache (Redis); optional Voyage reranker; commentary corpus.

## 11. Scale & cost

- **Corpus embedding is a one-time, ~1M-token job** — within Voyage's free allotment; trivial cost.
- **Per question** ≈ 1 small embed + 1 generation (+ optional rerank). Cheaper model
  (`claude-haiku-4-5`) for routine Q&A, `claude-sonnet-4-6` for depth — make it configurable (env).
- **Cache common questions** in Redis (rule #6): a big share of traffic is a long tail of the same
  ~hundred questions. Cache by normalized question + translation + denomination.
- **pgvector** handles the whole Bible (~31k rows) effortlessly with HNSW; no separate vector DB.
- **Stateless API** behind the load balancer (rule #9) — the agent adds no per-instance state.

## 12. Verification (definition of done)

- **No invented verses:** run the eval set; every citation in every answer resolves to a real
  `bible_verses` row (assert 100% — this is the core guarantee). Spot-check quotes against the source.
- **Honest fallback fires:** ask something scripture doesn't address ("what's the best laptop?") →
  the agent declines/redirects instead of forcing a verse.
- **Safety:** crisis-style prompts route to the care response with resources, never a bare verse or
  anything harmful.
- **Retrieval quality:** for the eval set, the expected passage appears in the top-k for ≥ ~90% of
  questions; tune `match_count`/add windows/reranker if not.
- **RLS:** one user cannot read another's conversations via the API; rate limit trips on rapid asks.
- **Degrade:** with `ANTHROPIC_*`/`VOYAGE_*` unset, the API still boots and `/health` is green;
  `/agent/ask` returns a clean 503.

## 13. Open decisions

1. **Translation(s):** WEB (public domain) for launch — recommended. Add licensed NIV/ESV via
   API.Bible only with a license. Multiple translations = more `translation` rows.
2. **Generation model:** `claude-sonnet-4-6` (quality) vs `claude-haiku-4-5` (cost) — or route by
   question complexity. Default sonnet for launch, revisit on cost.
3. **Conversation memory:** single-turn Q&A first, or multi-turn follow-ups? Multi-turn means
   carrying prior messages into the prompt (and re-retrieving per turn).
4. **Commentary corpus:** ship verses-only first; add tradition-tagged commentary later for the
   denomination moat (§7).
5. **Relationship to the chatroom:** standalone feature, or also embed the agent *inside* a study
   room (pulls up verses speakers mention live)? The backend here supports both.

---

*Like `Chatroom.md`, this reuses what's already built — `api.ts`, React Query, the NestJS module +
RLS + migration conventions, the overlay-screen pattern, and your denominations feature — so the real
work is the corpus + retrieval + the citation guarantee, not new infrastructure. It's the faster,
lower-risk path to real users.*


