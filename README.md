# JD Golf Hub - Frontend

싱글파일 HTML/CSS/JS (JD Times와 동일한 패턴). 별도 빌드 과정 없이 정적 호스팅(Cloudflare Pages 등)에 `index.html` 하나만 올리면 된다.

## 로컬 확인

`index.html`을 브라우저로 바로 열거나, 아래처럼 로컬 서버로 띄운다.

```bash
npx serve .
```

## 배포 전 설정

`index.html` 상단 `<script>` 안의 `CONFIG.API_BASE` 값을 배포한 백엔드 Worker 주소로 교체한다.

```js
const CONFIG = {
  API_BASE: 'https://jd-golf-hub-backend.<your-subdomain>.workers.dev',
};
```

## 배포

Cloudflare Pages에 이 폴더를 그대로 연결 (JD Times와 동일 방식). 커맨드라인으로는:

```bash
npx wrangler pages deploy . --project-name=jd-golf-hub
```

## 현재 구현 범위 (MVP1)

- **날씨**: 위치 권한 허용 → 오늘 시간대별 예보 + 기온/바람/강수확률 기반 복장 추천
- **스코어**: 수동 입력/수정/삭제 (골프장, 코스, 총타수, FIR/GIR/퍼트, 평점, 출처, 메모)
- **통계**: 최근10 평균, 베스트 스코어, 총 라운드, 평균 FIR/GIR/퍼트, 코스별 평균
- **홈**: 위 통계 요약 + 날씨 요약 대시보드
- **예약/맛집 탭**: MVP2~4 예정 안내 placeholder만 존재

## 다음 단계

- MVP2: 맛집(카카오맵), 골프장 마스터 DB, 동반자 관리
- MVP3: 스코어카드/화면캡처 사진 인식 (공용 이미지 인식 컴포넌트)
- MVP4: 골팡 조건검색 + 동반예약 비교 + 가중치 점수 추천
- MVP5: 예약확정 메시지 붙여넣기 AI 파싱
