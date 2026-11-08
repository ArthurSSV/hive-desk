-- 007: уведомления админу. Выполнить один раз в Supabase → SQL Editor.
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
