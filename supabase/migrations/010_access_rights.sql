-- 010: права доступа счёта в cTrader (full / close_only / no_trading / no_login).
-- Проп отключает торговлю при нарушении или прохождении фазы — по этому признаку ставим Failed / Пройдено.
-- Выполнить один раз в Supabase → SQL Editor.
alter table public.ctrader_accounts add column if not exists access_rights text;
