# 🏢 임마누엘컴퍼니 AI 오피스

자동화 루틴이 도는 5층 사옥을 한 화면에서 보는 정적 웹 대시보드입니다.
빌드 도구도, 서버도, 외부 라이브러리도 쓰지 않습니다. HTML · CSS · JS · JSON 네 파일이 전부입니다.

- 지도: 순수 SVG로 그리는 2.5D 아이소메트릭 사무실(층마다 도면이 다릅니다)
- 왼쪽: 층별 안내 · 이 층의 담당 · 막힘/결재 배지
- 오른쪽: `현황` / `결재·요청` / `지시 초안` 탭
- 지도에서 사람을 누르면 그 자리의 상세 현황이 열립니다

## 파일

| 파일 | 역할 |
| --- | --- |
| `index.html` | 화면 뼈대 |
| `styles.css` | 디자인 · 반응형 레이아웃 |
| `app.js` | 상태 읽기 · SVG 지도 생성 · 패널 렌더링 · 복사 |
| `office-state.json` | **오피스 상태의 원본.** 여기만 고치면 화면이 바뀝니다 |
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

- 담지 않는 것: 본명 · 주소 · 전화번호 · 이메일 · 블로그/샵 아이디 · 고객 정보 · 계좌/카드 정보
- 대신 쓰는 말: "네이버 블로그", "티스토리 블로그", "반려견", "강남 3·9호선", "지사"
- 매물은 동·번지 대신 "보증금 / 월세 / 평수"만 씁니다
- 캠페인 이름·마감일처럼 이미 공개된 정보는 그대로 써도 됩니다

## 상태 갱신 요령

`office-state.json` 위쪽의 두 값을 먼저 바꿔 주세요.

```json
"updatedAt": "2026-11-26T12:25:00+09:00",
"updatedLabel": "11월 26일 12:25 기준",
"updatedSource": "아침 브리핑(05:04) · 체험단 루틴(10:35) · 매물 확인(11:00) 기록 반영"
```

그다음 루틴이 끝난 자리의 상태를 고칩니다.

```json
{
  "id": "trial",
  "name": "체험단 담당",
  "pill": "체험단",              // 지도에 뜨는 짧은 이름 (2~4글자 권장)
  "role": "무료 체험단 자동 지원",
  "color": "#6f86d8",            // 캐릭터 옷 색
  "status": "working",           // working | ok | waiting | approval | blocked | paused
  "note": "매일 10:30 루틴 완료 · 오늘 신규 4건 접수",
  "desk": { "x": 1.4, "y": 1.8, "w": 2.6, "d": 1.4 },   // 책상 (그리드 좌표)
  "stand": { "x": 2.75, "y": 3.9 },                     // 캐릭터가 서는 자리
  "routines": [
    { "name": "무료 체험단 자동 탐색 · 지원", "when": "매일 10:30",
      "state": "ok", "stateLabel": "오늘 완료",
      "last": "오늘 10:30 · 신규 4건", "next": "11/27 10:30" }
  ],
  "recent": [ { "time": "10:30", "text": "…" } ],
  "next":   [ { "time": "11/27", "text": "…" } ]
}
```

- 좌표계는 `x` 0~12, `y` 0~9 입니다. 책상은 `desk`(왼쪽 위 모서리 + 너비/깊이), 사람은 `stand`(서는 지점)로 잡습니다.
- 가구는 `furniture` 배열로 층마다 다르게 놓습니다: `rug` · `shelf` · `plant` · `sofa` · `table` · `chair` · `boxes` · `dogbed` · `tripod` · `lamp` · `cooler` · `partition` · `window` · `screen` · `board` · `whiteboard`
- `labels` 는 바닥에 띄우는 구역 이름표입니다.
- 담당을 잠시 숨기려면 `staff` 배열에서 빼면 됩니다. 자리만 비워 두고 싶으면 `"placeholder": true` 를 주면 점선 자리로 그려집니다.
- 결재·요청은 `approvals` 에 넣습니다. `options` 의 각 항목이 복사 문구가 됩니다.

```json
{
  "id": "a1", "floorId": "f4", "team": "콘텐츠 · 수익화팀",
  "title": "체험단 2차 활용 조건 허용 여부",
  "tone": "이번 주", "due": "다음 접수 전에 정하면 좋아요",
  "why": "왜 결정이 필요한지 한두 문장",
  "options": [
    { "label": "허용", "text": "체험단 콘텐츠 2차 활용·저작권 2년 조건, 앞으로도 허용해줘." },
    { "label": "건별 판단", "text": "체험단 2차 활용 조건은 건별로 나한테 물어봐 줘." }
  ]
}
```

## 확인 방법

```bash
python3 -m json.tool office-state.json > /dev/null   # JSON 문법
```

브라우저에서 열면 지도와 패널이 그려집니다. `file://` 로 열면 브라우저가 JSON 읽기를 막기 때문에
상태 파일을 불러오지 못합니다. **GitHub Pages 주소로 열어 보세요.**

## 상태 표기

| 상태 | 뜻 |
| --- | --- |
| 작업중 | 지금 돌고 있는 자리 |
| 정상 | 돌고 있고 문제 없음 |
| 대기 | 다음 차례·결정을 기다림 |
| 결재필요 | 대표님 결정이 필요 |
| 막힘 | 확인·권한이 없어 멈춤 |
| 보류 | 지금은 하지 않기로 함 |

상단 배지의 `작업 · 대기 · 막힘`은 **자리(담당) 수**, `결재`는 **안건 수**입니다.
