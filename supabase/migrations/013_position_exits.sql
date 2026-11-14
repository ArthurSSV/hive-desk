-- 013: выходы позиции (по тейку / по стопу / вручную) и сырые закрывающие ордера cTrader для проверки.
-- Выполнить один раз в Supabase → SQL Editor.
alter table public.position_meta add column if not exists exits jsonb;  -- [{ts, price, kind}] по времени
alter table public.position_meta add column if not exists raw jsonb;    -- закрывающие ордера как их отдал cTrader
