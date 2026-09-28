-- 0012_account_type.sql
-- Adds a personal/business account-type label to profiles. Not privileged —
-- the owner may switch it freely, same as display_name/bio.

alter table public.profiles
  add column if not exists account_type text not null default 'personal'
    check (account_type in ('personal', 'business'));
