-- 009: админ может одновременно быть трейдером. Выполнить один раз в Supabase → SQL Editor.
alter table public.profiles add column if not exists is_trader boolean not null default false;

-- Трейдер не может сам себе включить этот признак (менять его может только админ)
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.id is distinct from old.id or new.role is distinct from old.role or new.email is distinct from old.email
       or new.team_id is distinct from old.team_id or new.wallet is distinct from old.wallet or new.created_at is distinct from old.created_at
       or new.is_trader is distinct from old.is_trader then
      raise exception 'Можно изменить только имя';
    end if;
  end if;
  return new;
end $$;
