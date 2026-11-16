-- 014: архив выбывших счетов. Счёт в архиве не синхронизируется и не показывается в «Группе»,
-- но его история остаётся и учитывается в прошлых днях «Сводки».
-- Выполнить один раз в Supabase → SQL Editor.
alter table public.ctrader_accounts add column if not exists archived boolean not null default false;
alter table public.ctrader_accounts add column if not exists archived_at timestamptz;

-- Трейдер не может сам менять архив, ручную отметку и права доступа
create or replace function public.guard_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.user_id is distinct from old.user_id or new.ctid_trader_account_id is distinct from old.ctid_trader_account_id
       or new.status is distinct from old.status or new.status_day is distinct from old.status_day
       or new.balance is distinct from old.balance or new.balance_locked is distinct from old.balance_locked
       or new.last_synced_at is distinct from old.last_synced_at or new.sync_error is distinct from old.sync_error
       or new.is_live is distinct from old.is_live or new.trader_login is distinct from old.trader_login
       or new.removed is distinct from old.removed
       or new.manual_failed is distinct from old.manual_failed or new.access_rights is distinct from old.access_rights
       or new.archived is distinct from old.archived or new.archived_at is distinct from old.archived_at then
      raise exception 'Это поле меняет только система или админ';
    end if;
    if old.removed then
      raise exception 'Счёт удалён админом';
    end if;
    if old.archived and new.active then
      raise exception 'Счёт в архиве';
    end if;
    if old.balance_locked and (new.initial_balance is distinct from old.initial_balance or new.phase is distinct from old.phase) then
      raise exception 'Баланс и этап подтверждены админом';
    end if;
  end if;
  return new;
end $$;
