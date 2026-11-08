-- 008: уведомления исчезают, когда админ решил вопрос. Выполнить один раз в Supabase → SQL Editor.
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
