create table if not exists public.mixer_debug_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text,
  message text,
  meta jsonb
);
alter table public.mixer_debug_log enable row level security;
create policy "anyone can insert mixer debug" on public.mixer_debug_log for insert with check (true);
create policy "authenticated can read mixer debug" on public.mixer_debug_log for select using (auth.role() = 'authenticated');