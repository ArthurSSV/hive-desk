-- Hive Desk — схема базы. Выполнить целиком в Supabase → SQL Editor.
-- Повторный запуск безопасен.

-- ========== Админы ==========
create table if not exists public.admin_emails (email text primary key);

-- ========== Профили ==========
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'trader' check (role in ('trader','admin')),
  wallet text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Профиль создаётся автоматически при регистрации
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.email, ''),
    case when exists (select 1 from public.admin_emails a where lower(a.email) = lower(new.email)) then 'admin' else 'trader' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Трейдер не может сам себе выдать роль админа
create or replace function public.guard_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role <> old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only admin can change roles';
  end if;
  return new;
end $$;
drop trigger if exists guard_role on public.profiles;
create trigger guard_role before update on public.profiles for each row execute function public.guard_role();

-- ========== cTrader ==========
-- Токены доступны только серверу (service role), в браузер не попадают
create table if not exists public.ctrader_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.ctrader_accounts (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ctid_trader_account_id bigint not null unique,
  trader_login bigint,
  broker_name text,
  is_live boolean not null default false,
  phase smallint not null default 1 check (phase in (1,2,3)),   -- 3 = funded
  initial_balance numeric,
  balance numeric,
  status text not null default 'active' check (status in ('active','passed','failed')),
  status_day date,
  active boolean not null default true,
  last_synced_at timestamptz,
  sync_error text,
  created_at timestamptz not null default now()
);
create index if not exists ctrader_accounts_user on public.ctrader_accounts(user_id);

create table if not exists public.deals (
  deal_id bigint primary key,
  account_id bigint not null references public.ctrader_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  position_id bigint,
  symbol_id bigint,
  side text,
  volume bigint,
  exec_ts timestamptz not null,
  is_close boolean not null default false,
  net_profit numeric not null default 0,
  balance_after numeric
);
alter table public.deals add column if not exists symbol text;
alter table public.deals add column if not exists lots numeric;
alter table public.deals add column if not exists price numeric;
alter table public.deals add column if not exists entry_price numeric;
create index if not exists deals_account_ts on public.deals(account_id, exec_ts);

create table if not exists public.daily_stats (
  account_id bigint not null references public.ctrader_accounts(id) on delete cascade,
  day date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  pnl numeric not null default 0,
  pnl_pct numeric not null default 0,
  total_pct numeric not null default 0,
  end_balance numeric,
  trades int not null default 0,
  max_lot numeric not null default 0,
  level text not null default 'green',
  flags jsonb not null default '[]',
  breach text,
  primary key (account_id, day)
);
create index if not exists daily_stats_user on public.daily_stats(user_id, day);

-- ========== Дневник ==========
create table if not exists public.journal (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  mood smallint check (mood between 1 and 5),
  plan boolean,
  note text,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ========== On-chain ==========
create table if not exists public.chain_events (
  tx_hash text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('pay','payout')),
  amount numeric not null,
  ts timestamptz not null
);

-- ========== Настройки и алерты ==========
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  rules jsonb not null
);
insert into public.settings (id, rules) values (1,
  '{"p1":8,"p2":5,"daily":5,"max":10,"minDays":3,"profitDayPct":0.5,"redDaily":3,"redDD":7,"tz":"UTC"}')
on conflict (id) do nothing;

create table if not exists public.alerts_sent (
  account_id bigint not null references public.ctrader_accounts(id) on delete cascade,
  day date not null,
  level text not null,
  sent_at timestamptz not null default now(),
  primary key (account_id, day, level)
);

-- ========== RLS ==========
alter table public.admin_emails enable row level security;
alter table public.profiles enable row level security;
alter table public.ctrader_tokens enable row level security;
alter table public.ctrader_accounts enable row level security;
alter table public.deals enable row level security;
alter table public.daily_stats enable row level security;
alter table public.journal enable row level security;
alter table public.chain_events enable row level security;
alter table public.settings enable row level security;
alter table public.alerts_sent enable row level security;

do $$ begin
  drop policy if exists p_profiles_sel on public.profiles;
  drop policy if exists p_profiles_upd on public.profiles;
  drop policy if exists p_profiles_del on public.profiles;
  drop policy if exists p_acc_sel on public.ctrader_accounts;
  drop policy if exists p_acc_upd on public.ctrader_accounts;
  drop policy if exists p_acc_del on public.ctrader_accounts;
  drop policy if exists p_deals_sel on public.deals;
  drop policy if exists p_daily_sel on public.daily_stats;
  drop policy if exists p_journal_sel on public.journal;
  drop policy if exists p_journal_ins on public.journal;
  drop policy if exists p_journal_upd on public.journal;
  drop policy if exists p_chain_sel on public.chain_events;
  drop policy if exists p_settings_sel on public.settings;
  drop policy if exists p_settings_upd on public.settings;
end $$;

create policy p_profiles_sel on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy p_profiles_upd on public.profiles for update using (id = auth.uid() or public.is_admin());
create policy p_profiles_del on public.profiles for delete using (public.is_admin());

create policy p_acc_sel on public.ctrader_accounts for select using (user_id = auth.uid() or public.is_admin());
create policy p_acc_upd on public.ctrader_accounts for update using (user_id = auth.uid() or public.is_admin());
create policy p_acc_del on public.ctrader_accounts for delete using (user_id = auth.uid() or public.is_admin());

create policy p_deals_sel on public.deals for select using (user_id = auth.uid() or public.is_admin());
create policy p_daily_sel on public.daily_stats for select using (user_id = auth.uid() or public.is_admin());

create policy p_journal_sel on public.journal for select using (user_id = auth.uid() or public.is_admin());
create policy p_journal_ins on public.journal for insert with check (user_id = auth.uid());
create policy p_journal_upd on public.journal for update using (user_id = auth.uid());

create policy p_chain_sel on public.chain_events for select using (user_id = auth.uid() or public.is_admin());

create policy p_settings_sel on public.settings for select using (auth.uid() is not null);
create policy p_settings_upd on public.settings for update using (public.is_admin());
-- ctrader_tokens, admin_emails, alerts_sent: без политик → доступ только у сервера.
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
create table if not exists public.teams (
  id bigserial primary key,
  name text not null,
  curator text,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists team_id bigint references public.teams(id) on delete set null;

alter table public.teams enable row level security;
drop policy if exists p_teams_admin on public.teams;
create policy p_teams_admin on public.teams for all using (public.is_admin()) with check (public.is_admin());

-- 1. Начальный баланс и этап подтверждает админ
alter table public.ctrader_accounts add column if not exists balance_locked boolean not null default false;

-- 2. Код приглашения для регистрации
alter table public.settings add column if not exists invite_code text;

-- 3. Трейдер может менять в профиле только имя
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.id is distinct from old.id or new.role is distinct from old.role or new.email is distinct from old.email
       or new.team_id is distinct from old.team_id or new.wallet is distinct from old.wallet or new.created_at is distinct from old.created_at then
      raise exception 'Можно изменить только имя';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_role on public.profiles;
drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile();

-- 4. Трейдер может у своего счёта только включить отслеживание, а этап и баланс — пока админ их не подтвердил
create or replace function public.guard_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.user_id is distinct from old.user_id or new.ctid_trader_account_id is distinct from old.ctid_trader_account_id
       or new.status is distinct from old.status or new.status_day is distinct from old.status_day
       or new.balance is distinct from old.balance or new.balance_locked is distinct from old.balance_locked
       or new.last_synced_at is distinct from old.last_synced_at or new.sync_error is distinct from old.sync_error
       or new.is_live is distinct from old.is_live or new.trader_login is distinct from old.trader_login then
      raise exception 'Это поле меняет только система или админ';
    end if;
    if old.balance_locked and (new.initial_balance is distinct from old.initial_balance or new.phase is distinct from old.phase) then
      raise exception 'Баланс и этап подтверждены админом';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_account on public.ctrader_accounts;
create trigger guard_account before update on public.ctrader_accounts for each row execute function public.guard_account();

-- 5. Регистрация только с кодом приглашения (если код задан). Админы из admin_emails — без кода
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_adm boolean := exists (select 1 from public.admin_emails a where lower(a.email) = lower(new.email));
  code text := (select invite_code from public.settings where id = 1);
begin
  if not is_adm and coalesce(trim(code), '') <> ''
     and lower(trim(coalesce(new.raw_user_meta_data->>'invite', ''))) <> lower(trim(code)) then
    raise exception 'INVALID_INVITE';
  end if;
  insert into public.profiles (id, name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''), coalesce(new.email, ''), case when is_adm then 'admin' else 'trader' end)
  on conflict (id) do nothing;
  return new;
end $$;
