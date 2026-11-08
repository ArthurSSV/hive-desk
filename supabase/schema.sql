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
alter table public.ctrader_accounts add column if not exists delete_requested_at timestamptz;
alter table public.ctrader_accounts add column if not exists removed boolean not null default false;

-- Удалять счета напрямую может только админ (трейдер — только запросить)
drop policy if exists p_acc_del on public.ctrader_accounts;
create policy p_acc_del on public.ctrader_accounts for delete using (public.is_admin());

-- Трейдер может запросить или отменить удаление, но не удалить и не вернуть счёт сам
create or replace function public.guard_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.user_id is distinct from old.user_id or new.ctid_trader_account_id is distinct from old.ctid_trader_account_id
       or new.status is distinct from old.status or new.status_day is distinct from old.status_day
       or new.balance is distinct from old.balance or new.balance_locked is distinct from old.balance_locked
       or new.last_synced_at is distinct from old.last_synced_at or new.sync_error is distinct from old.sync_error
       or new.is_live is distinct from old.is_live or new.trader_login is distinct from old.trader_login
       or new.removed is distinct from old.removed then
      raise exception 'Это поле меняет только система или админ';
    end if;
    if old.removed then
      raise exception 'Счёт удалён админом';
    end if;
    if old.balance_locked and (new.initial_balance is distinct from old.initial_balance or new.phase is distinct from old.phase) then
      raise exception 'Баланс и этап подтверждены админом';
    end if;
  end if;
  return new;
end $$;
create table if not exists public.notifications (
  id bigserial primary key,
  kind text not null,
  user_id uuid references public.profiles(id) on delete cascade,
  text text not null,
  link text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_created on public.notifications(created_at desc);
alter table public.notifications enable row level security;
drop policy if exists p_notif_sel on public.notifications;
drop policy if exists p_notif_upd on public.notifications;
create policy p_notif_sel on public.notifications for select using (public.is_admin());
create policy p_notif_upd on public.notifications for update using (public.is_admin());

-- Новый трейдер
create or replace function public.notify_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'trader' then
    insert into public.notifications (kind, user_id, text, link)
    values ('signup', new.id, 'Новый трейдер: ' || coalesce(nullif(new.name, ''), new.email), '/admin/trader/' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists notify_signup on public.profiles;
create trigger notify_signup after insert on public.profiles for each row execute function public.notify_signup();

-- События по счёту: подключение, запрос на удаление, цель выполнена, счёт закрыт
create or replace function public.notify_account() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := (select coalesce(nullif(name, ''), email) from public.profiles where id = new.user_id);
  acc text := '#' || coalesce(new.trader_login, new.ctid_trader_account_id)::text;
  link text := '/admin/trader/' || new.user_id;
begin
  if new.active and not old.active and not new.balance_locked then
    insert into public.notifications (kind, user_id, text, link) values ('connect', new.user_id, who || ' подключил счёт ' || acc || ' — подтвердите баланс', link);
  end if;
  if new.delete_requested_at is not null and old.delete_requested_at is null then
    insert into public.notifications (kind, user_id, text, link) values ('remove', new.user_id, who || ' просит удалить счёт ' || acc, link);
  end if;
  if new.status is distinct from old.status and new.status = 'passed' then
    insert into public.notifications (kind, user_id, text, link) values ('passed', new.user_id, who || ' выполнил цель фазы на счёте ' || acc, link);
  end if;
  if new.status is distinct from old.status and new.status = 'failed' then
    insert into public.notifications (kind, user_id, text, link) values ('failed', new.user_id, who || ': счёт ' || acc || ' закрыт по лимиту', link);
  end if;
  return new;
end $$;
drop trigger if exists notify_account on public.ctrader_accounts;
create trigger notify_account after update on public.ctrader_accounts for each row execute function public.notify_account();
alter table public.notifications add column if not exists account_id bigint references public.ctrader_accounts(id) on delete cascade;
drop policy if exists p_notif_del on public.notifications;
create policy p_notif_del on public.notifications for delete using (public.is_admin());

create or replace function public.notify_account() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := (select coalesce(nullif(name, ''), email) from public.profiles where id = new.user_id);
  acc text := '#' || coalesce(new.trader_login, new.ctid_trader_account_id)::text;
  link text := '/admin/trader/' || new.user_id;
begin
  -- Подключил счёт и ждёт подтверждения (без повторов)
  if new.active and not old.active and not new.balance_locked
     and not exists (select 1 from public.notifications where kind = 'connect' and account_id = new.id) then
    insert into public.notifications (kind, user_id, account_id, text, link) values ('connect', new.user_id, new.id, who || ' подключил счёт ' || acc || ' — подтвердите баланс', link);
  end if;
  -- Подтвердил баланс или трейдер переключился на другой счёт — вопрос закрыт
  if (new.balance_locked and not old.balance_locked) or (not new.active and old.active) then
    delete from public.notifications where kind = 'connect' and account_id = new.id;
  end if;
  if new.balance_locked and not old.balance_locked then
    delete from public.notifications where kind = 'signup' and user_id = new.user_id;
  end if;
  -- Запрос на удаление: появился / отклонён или отменён
  if new.delete_requested_at is not null and old.delete_requested_at is null then
    insert into public.notifications (kind, user_id, account_id, text, link) values ('remove', new.user_id, new.id, who || ' просит удалить счёт ' || acc, link);
  end if;
  if new.delete_requested_at is null and old.delete_requested_at is not null then
    delete from public.notifications where kind = 'remove' and account_id = new.id;
  end if;
  if new.status is distinct from old.status and new.status = 'passed' then
    insert into public.notifications (kind, user_id, account_id, text, link) values ('passed', new.user_id, new.id, who || ' выполнил цель фазы на счёте ' || acc, link);
  end if;
  if new.status is distinct from old.status and new.status = 'failed' then
    insert into public.notifications (kind, user_id, account_id, text, link) values ('failed', new.user_id, new.id, who || ': счёт ' || acc || ' закрыт по лимиту', link);
  end if;
  return new;
end $$;

-- Разовая уборка: старые уведомления без привязки к счёту заменяем актуальными
delete from public.notifications where kind in ('connect', 'remove') and account_id is null;
delete from public.notifications n where kind = 'signup'
  and exists (select 1 from public.ctrader_accounts a where a.user_id = n.user_id and a.balance_locked);
insert into public.notifications (kind, user_id, account_id, text, link)
select 'connect', a.user_id, a.id,
       coalesce(nullif(p.name, ''), p.email) || ' подключил счёт #' || coalesce(a.trader_login, a.ctid_trader_account_id)::text || ' — подтвердите баланс',
       '/admin/trader/' || a.user_id
from public.ctrader_accounts a join public.profiles p on p.id = a.user_id
where a.active and not a.balance_locked and not a.removed;
insert into public.notifications (kind, user_id, account_id, text, link)
select 'remove', a.user_id, a.id,
       coalesce(nullif(p.name, ''), p.email) || ' просит удалить счёт #' || coalesce(a.trader_login, a.ctid_trader_account_id)::text,
       '/admin/trader/' || a.user_id
from public.ctrader_accounts a join public.profiles p on p.id = a.user_id
where a.delete_requested_at is not null and not a.removed;
