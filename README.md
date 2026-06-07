# 도영이 이유식 PWA

아기 이유식 식단표(1~56일) + 재료 테스트 체크리스트. 단일 페이지 PWA, Supabase 동기화.

## 파일
- `index.html` — 앱 본체 (데이터·로직·스타일 전부 포함, Supabase 키 하드코딩)
- `manifest.webmanifest` — PWA 설치 정보
- `sw.js` — 서비스워커(오프라인 캐시)
- `icon-192.png`, `icon-512.png` — 앱 아이콘
- `schema.sql` — Supabase 테이블 생성 SQL (1회 실행)

## 첫 설정 (Supabase 테이블 만들기)
1. https://supabase.com/dashboard 에서 프로젝트 `junlsoooxfsqvuejdldu` 선택
2. 좌측 **SQL Editor** → New query
3. `schema.sql` 내용 전체 붙여넣기 → **Run**
   - 옛 `babyfood_babies`/`babyfood_meals` 테이블이 삭제되고 새 `bbf_state` 테이블이 생성됩니다.

## 배포 (Vercel)
빌드 설정 없는 정적 파일. 폴더를 Vercel에 그대로 올리면 끝.

## 데이터 구조
`bbf_state` 테이블의 `id='doyoung'` 한 행에 전체 상태를 JSON으로 저장.
```json
{
  "tested":    { "닭고기": { "done": true, "date": "2025-06-12", "note": "..." } },
  "logs":      { "6/12|0|eaten": "80", "6/12|0|memo": "...", "6/12|s|snack": "배" },
  "overrides": { "6/12|0|top": "닭고기 15g · 브로콜리 15g" }
}
```

## PWA 설치
- iOS Safari: 공유 → "홈 화면에 추가"
- Android Chrome: 메뉴 → "앱 설치"
- 데스크탑 Chrome/Edge: 주소창 우측 설치 아이콘
