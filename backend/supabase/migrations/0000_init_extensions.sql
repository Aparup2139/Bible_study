-- 0000_init_extensions.sql
-- Phase 0: enable the Postgres extensions every later phase relies on.
-- Migrations are the source of truth for schema — never edit the DB via the dashboard.

-- UUID generation (gen_random_uuid lives in pgcrypto on modern Postgres).
create extension if not exists "pgcrypto" with schema extensions;

-- Trigram indexes for fast ILIKE / fuzzy handle + title search (Phase 7).
create extension if not exists "pg_trgm" with schema extensions;

-- Case-insensitive text (handy for emails / handles).
create extension if not exists "citext" with schema extensions;

-- Cron jobs for periodic reconciliation of denormalized counts (golden rule #3).
-- Available on Supabase; safe to enable now.
create extension if not exists "pg_cron";
