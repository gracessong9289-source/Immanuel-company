# 🏢 임마누엘컴퍼니 · 송블리 본부

사옥을 3D 아이소메트릭 도면으로 보고, 파트별 진행 현황을 한 화면에서 확인하는 정적 웹앱입니다.
빌드 도구도, 서버도, 외부 라이브러리도 쓰지 않습니다. HTML · CSS · JS · JSON + 이미지 한 장이 전부입니다.

- **오피스** — `Workspace` 카드 · 상태 칩 · 3D 사옥 도면과 7개 핀
- **회의실** — 대표님 결정을 기다리는 안건 + 한 번에 복사되는 지시 문장
- **작업실** — 자동으로 도는 루틴과 마지막 실행 · 다음 실행
- **현황** — 집계 · 오늘 업데이트 · 다음 일정
- **메모** — 빠른 메모 저장(`localStorage`) · 복사해서 대화창에 붙여 넣기

핀이나 공간을 누르면 아래에서 상세 시트가 올라옵니다. 상세 시트의 `피클에 지시 복사` 버튼을 누르면
그대로 대화창에 붙여 넣을 수 있는 문장이 복사됩니다.

## 파일

| 파일 | 역할 |
| --- | --- |
| `index.html` | 화면 뼈대 (헤더 · 탭 · 5개 뷰 · 시트) |
| `styles.css` | 디자인 · 반응형 레이아웃 |
| `app.js` | 상태 읽기 · 핀/뷰 렌더링 · 시트 · 복사 · 메모 |
| `office-state.json` | **오피스 상태의 원본.** 여기만 고치면 화면이 바뀝니다 |
| `assets/office-3d.png` | 3D 아이소메트릭 사옥 도면 (텍스트 없는 순수 일러스트) |
| `README.md` | 이 문서 |

## 주소

- 저장소: `https://github.com/gracessong9289-source/Immanuel-company`
- 사이트: `https://gracessong9289-source.github.io/Immanuel-company/`

`main` 브랜치와 `gh-pages` 브랜치가 같은 내용을 담고 있습니다. GitHub Pages는 `gh-pages`를 바라봅니다.
**코드를 고칠 때는 두 브랜치에 모두 올려야** 사이트에 반영됩니다.

```
git add -A
git commit -m "상태 갱신"
git push origin main
git push origin main:gh-pages
```

## 개인정보 원칙 (공개 저장소)

이 페이지는 **공개(Public) 웹**입니다. `office-state.json`에는 업무 상태만 담습니다.

- 담지 않는 것: 본명 · 주소 · 전화번호 · 이메일 · 블로그/샵 아이디 · 연구자/소속 · 고객 정보 · 계좌/카드 정보
- 대신 쓰는 말: "대표님", "송블리", "김봉순", "네이버 블로그", "박사 학위논문", "지사", "측정도구"
- 캠페인 이름·마감일처럼 이미 공개된 정보는 그대로 써도 됩니다.
- 화면 아래에 이 원칙을 한 줄로 적어 둡니다(`site.privacyNote`).

## 상태 갱신 요령

`office-state.json` 위쪽 값을 먼저 바꿉니다.

```json
"updatedAt": "2026-11-27T21:45:00+09:00",
"updatedLabel": "11월 27일 21:45 기준",
"updatedSource": "아침 브리핑(05:04) · 체험단 확인(10:31) · 리틀리 판매 오픈(15:42) 기록 반영"
```

그다음 파트(`spots`)의 상태를 고칩니다.

```json
{
  "id": "trial",                  // 고유 id
  "pin": "체험단",                 // 지도 핀에 뜨는 이름
  "name": "체험단",                // 시트 제목
  "part": true,                   // 가동 파트 수에 포함할지 (라운지는 false)
  "x": 45, "y": 58,               // 핀 중심 (도면 기준 %, 0~100)
  "role": "무료 체험단 자동 탐색 · 지원",
  "tone": "live",                 // live | ok | wait | block | miss | idle
  "statusLabel": "오늘 4건 접수",
  "summary": "이 자리가 하는 일 두세 문장",
  "headline": "오늘 한 줄 요약",
  "tasks": [
    { "title": "체험단 자동 탐색 · 지원", "when": "매일 10:30",
      "state": "ok", "stateLabel": "오늘 완료", "note": "신규 4건" }
  ],
  "recent": [ { "time": "10:31", "text": "…" } ],
  "next":   [ { "time": "11/28 10:30", "text": "…" } ],
  "prompts": [ { "label": "오늘 신청 정리", "text": "오늘 신청한 체험단 정리해줘." } ]
}
```

- `x`·`y`는 도면 이미지 기준 비율입니다. 핀은 그 지점에 가운데 정렬로 놓입니다.
  핀이 겹치면 `x`·`y`를 3~5씩 옮겨 조정하세요.
- `tone`이 그대로 색이 됩니다: `live`/`ok` 초록 · `wait` 노랑 · `block`/`miss` 빨강 · `idle` 회색.
- 결재·요청은 `approvals`, 자동 루틴은 `routines`, 오늘 기록은 `updates`, 다음 일정은 `schedule`에 넣습니다.
  `approvals[].options`의 각 항목이 복사 버튼이 됩니다.
- 도면 이미지를 바꾸면 `map.image`와 `index.html`의 `width`/`height`, 그리고 7개 핀 좌표를 함께 손봐야 합니다.

## 확인 방법

```bash
python3 -m json.tool office-state.json > /dev/null   # JSON 문법
```

`file://`로 열면 브라우저가 JSON 읽기를 막기 때문에 상태를 불러오지 못합니다.
**GitHub Pages 주소로 열어 보세요.**
