---
inclusion: always
---
# 폴더 구조

| 경로 | 내용 |
|---|---|
| `index.html` | 앱 화면, GitHub Pages 진입점 |
| `src/app.js` | 화면 렌더링과 상호작용 (`data/demo.json`을 읽어 그린다) |
| `src/engine.js` | 붙여넣기 점검 엔진: 약속·질문·날짜·미정 사항 찾기 |
| `src/styles.css` | 스타일 |
| `data/demo.json` | 가상 인물의 하루치 연락과 Kiro가 만든 분석 결과 |
| `tests/engine.test.js` | 엔진 테스트 (`npm test`) |
| `package.json` | `npm test` 스크립트만 있음, 의존성 없음 |
| `slides/` | 발표자료 원본 HTML |
| `PRESENTATION.pdf` | 발표자료 PDF (레포 최상단) |
| `.kiro/steering/` | 제품·기술·구조, 비서 판단 규칙 |
| `.kiro/specs/focus-assistant-mvp/` | 요구사항·설계·작업 목록 |
| `.kiro/hooks/` | 저장 시 자동 점검과 제출 전 점검 hook |

파일 하나는 한 작업자만 고친다. 새 최상위 폴더를 만들 때는 이 표를 먼저 고친다.
