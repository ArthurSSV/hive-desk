-- 012: стоп, тейк и причина закрытия позиции (из истории ордеров cTrader и открытых позиций).
-- Нужно для аналитики «Стоп и RR». Выполнить один раз в Supabase → SQL Editor.
create table if not exists public.position_meta (
  account_id bigint not null references public.ctrader_accounts(id) on delete cascade,
  position_id bigint not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  sl numeric,                 -- первоначальный стоп (цена)
  tp numeric,                 -- первоначальный тейк (цена)
  sl_source text,             -- order — из ордера на вход, open — увидели у открытой позиции
  close_reason text,          -- sltp — закрыта по стопу/тейку, stopout — стоп-аут, manual — вручную
  updated_at timestamptz not null default now(),
  primary key (account_id, position_id)
);
alter table public.position_meta enable row level security;
drop policy if exists p_meta_sel on public.position_meta;
create policy p_meta_sel on public.position_meta for select using (user_id = auth.uid() or public.is_admin());
