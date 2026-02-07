-- Cloud sync accounts and entries
create table public.cloud_sync_accounts (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cloud_sync_entries (
  account_id uuid not null references public.cloud_sync_accounts(id) on delete cascade,
  sync_id uuid not null,
  payload jsonb,
  updated_at_ms bigint not null,
  deleted_at_ms bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, sync_id)
);

create index cloud_sync_entries_account_updated_idx
  on public.cloud_sync_entries (account_id, updated_at_ms);

alter table public.cloud_sync_accounts enable row level security;
alter table public.cloud_sync_entries enable row level security;

create policy "Deny all direct access" on public.cloud_sync_accounts
  as restrictive for all to public using (false);

create policy "Deny all direct access" on public.cloud_sync_entries
  as restrictive for all to public using (false);
