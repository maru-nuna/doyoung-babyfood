-- 도영이 이유식 트래커: Supabase 스키마
-- 기존 프로젝트와 안 겹치게 babyfood_ 접두사 사용

-- 1. 아기 정보
create table if not exists babyfood_babies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  birth_date date not null,
  start_date date,
  created_at timestamptz default now()
);

-- 이미 babies 테이블이 있다면 컬럼만 추가 (안전: 데이터 보존)
alter table babyfood_babies add column if not exists start_date date;

-- 2. 끼니 (날짜 + 끼니번호 단위)
-- base/toppings는 [{name, planned}] 배열로 저장
create table if not exists babyfood_meals (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid references babyfood_babies(id) on delete cascade,
  date date not null,
  meal_number int not null,
  base jsonb not null default '[]'::jsonb,
  toppings jsonb not null default '[]'::jsonb,
  actual_eaten int,
  memo text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (baby_id, date, meal_number)
);

create index if not exists babyfood_meals_baby_date_idx
  on babyfood_meals (baby_id, date);

-- RLS: 로그인 없이 anon key로 접근 (개인용)
alter table babyfood_babies enable row level security;
alter table babyfood_meals enable row level security;

drop policy if exists "babyfood_babies_all" on babyfood_babies;
drop policy if exists "babyfood_meals_all" on babyfood_meals;

create policy "babyfood_babies_all" on babyfood_babies
  for all using (true) with check (true);

create policy "babyfood_meals_all" on babyfood_meals
  for all using (true) with check (true);
