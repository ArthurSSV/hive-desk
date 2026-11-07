-- 005: защита данных от правок трейдером и код приглашения. Выполнить один раз в Supabase → SQL Editor.

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
