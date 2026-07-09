# 도영이 이유식 PWA

아기 이유식 식단표(1~56일) + 재료 테스트 체크리스트. 단일 페이지 PWA, Supabase 동기화.

## 🌐 라이브 사이트

- **배포 URL:** https://doyoung-babyfood.vercel.app
- **GitHub 저장소:** https://github.com/maru-nuna/doyoung-babyfood
- **Supabase 프로젝트:** `junlsoooxfsqvuejdldu` (모임록·홈 프로텍터와 같은 프로젝트, 테이블만 별도)

## 🧱 기술 스택

- **프론트엔드:** 순수 HTML/CSS/JS 단일 파일(`index.html`, Supabase 키 하드코딩). 프레임워크·빌드 도구 없음.
- **데이터베이스:** Supabase (Postgres + REST API)
- **호스팅:** Vercel (정적 파일, 빌드 설정 없음)
- **PWA:** manifest + service worker (오프라인 캐싱 + 홈화면 설치)

## 📁 폴더 구조

```
03-doyoung-babyfood/
├── PROJECT.md              # 이 문서
├── vercel.json             # outputDirectory: "01-app"
├── 02-log/                 # 운영로그
└── 01-app/
    ├── index.html          # 앱 본체 (데이터·로직·스타일 전부 포함)
    ├── manifest.webmanifest
    ├── sw.js                # 서비스워커(오프라인 캐시)
    ├── icon-192.png, icon-512.png
    ├── schema.sql           # Supabase 테이블 생성 SQL (최초 1회)
    └── README.md            # 셋업 안내
```

## 🗄️ 데이터베이스 구조

`bbf_state` 테이블 하나로 전체 상태를 관리 (id='doyoung' 단일 행에 JSON 저장).

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | text (PK) | 고정값 `'doyoung'` |
| `data` | jsonb | 아래 구조의 전체 상태 |
| `updated_at` | timestamptz | 마지막 갱신 시각 |

```json
{
  "tested":    { "닭고기": { "done": true, "date": "2025-06-12", "note": "..." } },
  "logs":      { "6/12|0|eaten": "80", "6/12|0|memo": "...", "6/12|s|snack": "배" },
  "overrides": { "6/12|0|top": "닭고기 15g · 브로콜리 15g" }
}
```

RLS 켜져 있고 anon 키로 전체 read/write 허용 (개인용, 인증 없음).
옛 `babyfood_babies`/`babyfood_meals` 테이블은 `schema.sql` 실행 시 삭제되고 `bbf_state`로 대체됨.

## ⚙️ 주요 기능

- 월간 뷰 + 시작일 + 주간 스프레드시트 구조, 베이스/토핑 인라인 편집
- 클릭 기반 끼니 편집 모달, 일별 달성률 그래프
- 재료 단위(g/ml) 선택, 계획량/실제 먹은 양 분리 입력
- 계획량 계산: 하루 총량 → 끼니 기준 → 큐브 단위로 진화, 카테고리 기반 균형 식단 로직
- 신규 재료 안전 테스트(3일 간격) 규칙, 먹은 양 추이 그래프
- 이유식 탭: 1~28일 / 29~59일(2끼, 7/10~7/12 포함) / 60~87일(2끼) / 88~115일(3끼)
- "오늘의 식단" 무한 캐러셀, 읽기 전용 공유 보기(`?view=1`)
- 동시 저장 시 데이터 손실 방지(sync 경합 처리)

## 🚀 배포

빌드 설정 없는 정적 파일. Vercel이 GitHub push를 자동 감지해 배포.

## 📝 변경 이력

자세한 이력은 [02-log/](02-log/) 참고. 요약:

- 2026-05-15: v1 최초 배포. 월간 뷰 + 주간 스프레드시트 구조.
- 2026-06-07: PWA 전환 + Supabase 동기화 도입 (구조적 대개편).
- 2026-06-11~15: 계획량 계산 로직 개편(끼니 기준 → 큐브 단위), 신규 재료 안전 테스트 규칙 도입.
- 2026-06-24: 후기(57~84일) 탭 추가, 오늘의 식단 캐러셀 개선.
- 2026-07-06: 배포 파일을 `01-app` 하위로 정리.
- 2026-07-09: 7/12까지 2끼 유지 결정에 따라 탭 경계 조정(29~59일 / 60~87일 / 88~115일).
