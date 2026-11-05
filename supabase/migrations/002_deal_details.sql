-- 002: детали сделок (символ, лоты, цены) и правило прибыльных дней.
-- Выполнить один раз в Supabase → SQL Editor.
alter table public.deals add column if not exists symbol text;
alter table public.deals add column if not exists lots numeric;
alter table public.deals add column if not exists price numeric;
alter table public.deals add column if not exists entry_price numeric;

update public.settings
set rules = rules || '{"minDays":3,"profitDayPct":0.5}'::jsonb
where id = 1 and not (rules ? 'profitDayPct');
