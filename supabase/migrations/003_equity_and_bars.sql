-- 003: просадка по эквити и графики сделок. Выполнить один раз в Supabase → SQL Editor.
alter table public.deals add column if not exists conv numeric;

alter table public.daily_stats add column if not exists day_loss_pct numeric not null default 0;
alter table public.daily_stats add column if not exists dd_pct numeric not null default 0;
alter table public.daily_stats add column if not exists min_equity numeric;

create table if not exists public.position_bars (
  account_id bigint not null references public.ctrader_accounts(id) on delete cascade,
  position_id bigint not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  symbol text,
  period text not null,
  bars jsonb not null,            -- [[минута UTC, open, high, low, close], ...]
  closed boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (account_id, position_id)
);
alter table public.position_bars enable row level security;
drop policy if exists p_bars_sel on public.position_bars;
create policy p_bars_sel on public.position_bars for select using (user_id = auth.uid() or public.is_admin());
