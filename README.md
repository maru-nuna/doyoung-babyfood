# 도영이 이유식 트래커

날짜별 이유식 계획과 실제 먹은 양을 기록하는 웹앱.

## 첫 실행 전 1번만 할 일

### 1. Supabase에 테이블 만들기
1. https://supabase.com/dashboard 에서 프로젝트(`junlsoooxfsqvuejdldu`) 선택
2. 왼쪽 메뉴 **SQL Editor** 클릭 → **New query**
3. `schema.sql` 파일 내용을 전부 복사해서 붙여넣기
4. 우측 하단 **Run** 클릭 → "Success" 뜨면 끝

### 2. 로컬에서 열기 (테스트)
브라우저로 `index.html`을 직접 열거나, 가벼운 서버로 띄우기:
```bash
cd 도영이이유식
python3 -m http.server 5500
# http://localhost:5500 접속
```

## 사용 방법
- **첫 실행**: 아기 이름 + 생년월일 입력 → 저장
- **주간 탭**: 7일치 한눈에 보기. 칸의 "먹은 양"에 숫자만 입력하면 자동 저장
- **하루 탭**: 끼니별 카드. "재료 편집" 버튼으로 베이스/토핑 추가·삭제·끼니 추가
- **새 재료**: 이전에 없었던 재료는 파란색으로 강조
- **D+ 일수**: 헤더에 자동 표시
- **합계**: 일별·주간 먹은 양과 계획 대비 달성률 자동 계산

## 파일 구조
- `index.html`: 페이지 골격
- `style.css`: 스타일
- `app.js`: 모든 로직 (Supabase 연동 + 렌더링)
- `config.js`: Supabase URL/Key
- `schema.sql`: DB 테이블 생성 SQL (1번만 실행)

## 배포 (Vercel)
1. `vercel` CLI 또는 https://vercel.com 에 폴더 업로드
2. 빌드 설정 없이 그대로 배포 (정적 파일)
