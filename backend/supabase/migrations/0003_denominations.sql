-- 0003_denominations.sql
-- Phase 2: denominations reference data + wire profiles.denomination_id to it.
--
-- Reference data: world-readable, never written by clients (only migrations/seed
-- via the service role). Designed to be served almost entirely from cache (rule #6).

set search_path = public;

-- ---------------------------------------------------------------------------
-- denominations table (slug primary key, matches the frontend's string ids)
-- ---------------------------------------------------------------------------
create table if not exists public.denominations (
  id                 text        primary key,                 -- slug, e.g. 'roman-catholic'
  name               text        not null,
  "group"            text        not null,
  description        text        not null default '',
  bible_version      text        not null default '',
  founded_year       integer,
  -- Numeric source of truth (sortable/filterable)...
  worldwide_members  bigint,
  -- ...and the human display string the UI shows (e.g. '1.3 billion').
  global_followers   text        not null default '',
  sort_order         integer     not null default 0,
  created_at         timestamptz not null default now(),

  -- Keep `group` aligned with the DenominationGroup union in shared-types.
  constraint denominations_group_check check ("group" in (
    'CATHOLIC', 'ORTHODOX', 'PROTESTANT_MAINLINE', 'PROTESTANT_EVANGELICAL',
    'PENTECOSTAL', 'CHARISMATIC', 'BAPTIST', 'ADVENTIST', 'OTHER'
  ))
);

comment on table public.denominations is
  'Christian denomination reference data. Read-only to clients; seeded via migration.';

-- RLS: anyone may read; no client write policies (so writes are denied except
-- via the service-role key, which bypasses RLS).
alter table public.denominations enable row level security;

drop policy if exists "denominations are readable by everyone" on public.denominations;
create policy "denominations are readable by everyone"
  on public.denominations
  for select
  using (true);

-- ---------------------------------------------------------------------------
-- Seed (idempotent). Source: the app's curated DENOMINATION_INFO set.
-- ---------------------------------------------------------------------------
insert into public.denominations
  (id, name, "group", description, bible_version, founded_year, worldwide_members, global_followers, sort_order)
values
  ('roman-catholic', 'Roman Catholic Church', 'CATHOLIC',
   'The largest Christian church, led by the Pope in Rome. Known for its rich sacramental tradition, hierarchical structure, and continuity with the early church.',
   'New American Bible (NAB)', 33, 1345000000, '1.3 billion', 10),
  ('eastern-orthodox', 'Eastern Orthodox Church', 'ORTHODOX',
   'One of the oldest branches of Christianity, emphasizing the seven ecumenical councils, theosis, and the divine liturgy. Known for its rich iconographic tradition.',
   'Orthodox Study Bible (OSB)', 33, 260000000, '260 million', 20),
  ('lutheran', 'Lutheran Church', 'PROTESTANT_MAINLINE',
   'Founded on the teachings of Martin Luther, Lutheranism emphasises justification by grace through faith alone, the authority of Scripture, and the two sacraments of baptism and communion.',
   'ESV / NIV', 1517, 77000000, '77 million', 30),
  ('southern-baptist', 'Southern Baptist Convention', 'BAPTIST',
   'The largest Protestant denomination in the United States, emphasizing believer''s baptism, local church autonomy, and a strong commitment to evangelism and missions.',
   'KJV / CSB', 1845, 14000000, '14 million', 40),
  ('assemblies-of-god', 'Assemblies of God', 'PENTECOSTAL',
   'One of the largest Pentecostal denominations worldwide, emphasizing the baptism of the Holy Spirit, speaking in tongues, and divine healing.',
   'NIV / ESV', 1914, 69000000, '69 million', 50),
  ('seventh-day-adventist', 'Seventh-day Adventist Church', 'ADVENTIST',
   'A Protestant Christian denomination known for its emphasis on the Saturday Sabbath, holistic health, and the imminent second coming of Jesus Christ.',
   'NKJV / NIV', 1863, 21000000, '21 million', 60)
on conflict (id) do update set
  name              = excluded.name,
  "group"           = excluded."group",
  description       = excluded.description,
  bible_version     = excluded.bible_version,
  founded_year      = excluded.founded_year,
  worldwide_members = excluded.worldwide_members,
  global_followers  = excluded.global_followers,
  sort_order        = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Wire profiles.denomination_id (was uuid, unconstrained) to denominations(id).
-- ---------------------------------------------------------------------------
-- Existing rows have NULL here, so the type change + FK apply cleanly.
alter table public.profiles
  alter column denomination_id type text using denomination_id::text;

alter table public.profiles
  drop constraint if exists profiles_denomination_id_fkey;

alter table public.profiles
  add constraint profiles_denomination_id_fkey
  foreign key (denomination_id) references public.denominations (id)
  on delete set null;

-- Index the FK for fast "members of denomination X" style lookups later.
create index if not exists profiles_denomination_id_idx
  on public.profiles (denomination_id);
