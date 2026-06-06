-- seed.sql
-- Reference / demo data applied after migrations (e.g. `supabase db reset`).
-- The authoritative seeds also live in the migrations (idempotent) so a plain
-- `db push` populates a fresh project; this mirrors them for local resets.

-- ===== Phase 2: denominations =====
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
on conflict (id) do nothing;

-- ===== Phase 3: podcasts demo catalog =====
insert into public.podcast_categories (id, name, icon, show_count, sort_order) values
  ('bible-study', 'Bible Study', U&'\+01F4D6',        45, 10),
  ('prayer',      'Prayer',      U&'\+01F64F',        32, 20),
  ('theology',    'Theology',    U&'\271D\FE0F',      28, 30),
  ('worship',     'Worship',     U&'\+01F3B5',        38, 40),
  ('family',      'Family',      U&'\+01F46A',        25, 50),
  ('leadership',  'Leadership',  U&'\+01F4BC',        19, 60),
  ('missions',    'Missions',    U&'\+01F30D',        22, 70),
  ('teaching',    'Teaching',    U&'\+01F4DA',        41, 80)
on conflict (id) do nothing;

insert into public.podcast_channels (id, name, avatar_emoji, episode_count, subscriber_count) values
  ('ch1', 'Faith & Hope Podcast', U&'\+01F399\FE0F', 152, 24000),
  ('ch2', 'Bible Deep Dive',      U&'\+01F4D6',       98, 18000),
  ('ch3', 'Morning Prayer',       U&'\+01F64F',      210, 31000),
  ('ch4', 'Theology Today',       U&'\271D\FE0F',     76, 15000)
on conflict (id) do nothing;

insert into public.podcast_episodes (id, channel_id, title, duration_seconds, published_at, audio_path) values
  ('ep1', 'ch1', 'Understanding Grace in Daily Life', 2700, now() - interval '2 days', ''),
  ('ep2', 'ch2', 'Psalms 23: The Shepherd''s Care',   1920, now() - interval '5 days', ''),
  ('ep3', 'ch3', 'Starting Your Day with Purpose',     900,  now() - interval '7 days', ''),
  ('ep4', 'ch4', 'Modern Faith Challenges',            3480, now() - interval '3 days', '')
on conflict (id) do nothing;
