-- 004: команды кураторов. Выполнить один раз в Supabase → SQL Editor.
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
