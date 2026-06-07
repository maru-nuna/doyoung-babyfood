-- 도영이 이유식 PWA: Supabase 스키마
-- Supabase → SQL Editor에 통째로 붙여넣고 Run 하면 됩니다.

-- 1. 옛 버전(앱·테이블) 정리: babyfood_meals → babyfood_babies 순으로 제거
drop table if exists public.babyfood_meals cascade;
drop table if exists public.babyfood_babies cascade;

-- 2. 새 PWA용 상태 테이블 (한 행에 전체 State JSON)
create table if not exists public.bbf_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.bbf_state enable row level security;

-- 개인용: anon 키로 읽기/쓰기 허용
drop policy if exists "allow anon all" on public.bbf_state;
create policy "allow anon all" on public.bbf_state
  for all to anon using (true) with check (true);
