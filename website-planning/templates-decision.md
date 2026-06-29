# SQLPreShift 웹사이트 — 템플릿 5종 비교 및 추천

## 1. 요약 (어떤 템플릿을 추천하며 왜)

**추천 1순위: `template-1-linear-precision.html` (Linear 정밀)** — 적대적 비평 기준 **quality 7.5 / ai-smell 2.5(최저 동률) / guide-detail 7**로, 5종 중 종합 최상위다. 우리의 핵심 평가축인 "**고급스럽고 차분한 다크(graphite) + AI티 안 남 + 포트폴리오 데모로서 정직함**"에 가장 근접한다.

다만 **결정적 단서**가 하나 있다: 디스크를 직접 확인한 결과 `template-*.html` 5개 파일이 **물리적으로 존재하지 않는다**(`website-planning/`에는 `research.md`만 있음). 즉 모든 점수는 적대적 비평가들이 "**CSS 스캐폴드가 `<style>` 중간에서 잘려 `<body>`가 통째로 없는**" 상태에서 매긴 **추정치**다. 5개 비평 전부가 이 한계를 "치명적 미검증"으로 명시했다. 따라서 1순위 선정은 "**디자인 시스템 의도(토큰 규율·accent 절제·목업 정성)의 우열**"에 대한 판단이며, 실제 채택 확정 전에 본문을 채워 렌더·반응형·가이드 카피를 재검증해야 한다.

**한 줄 결론**: 스타일 1(Linear 정밀)을 베이스로 채택하되, **스타일 3(Docs-integrated)의 가이드 IA**와 **스타일 5(Editorial)의 매니페스토 hero 카피**를 그래프팅하고, 본문을 채워 반응형·가이드 본문을 검증한 뒤 Next.js로 옮긴다.

---

## 2. 레퍼런스에서 배운 핵심 패턴 (설치형 앱 사이트 공통 우수 패턴)

5개 레퍼런스(Linear · Raycast · TablePlus/Tauri · Obsidian · Warp)가 반복적으로 합의한 패턴:

1. **단일 primary CTA를 3지점 반복** — nav 우측 끝 · hero · closing band에 **동일 라벨**로(`Download for macOS`). 두 번째 동급 버튼을 옆에 두지 않는다. 보조는 조용히(`View on GitHub`).
2. **다운로드 버튼 바로 아래 메타 한 줄** — 버전·OS 요구사항·용량·대체 설치 경로를 muted 텍스트로 박는다(Raycast `v1.104.20 · macOS 13+ · homebrew`, TablePlus `Apple Silicon · macOS 10.13+`). 우리 버전: `macOS · Apple Silicon · ~122 MiB · .dmg · or build from source`.
3. **elevation은 그림자가 아니라 톤 레이어링** — graphite 캔버스 위에 surface 단계를 균일한 lightness 증분으로 쌓는다(Linear의 LCH 원칙). 깊이를 보더·글로우가 아닌 표면 톤에서.
4. **accent 1색을 "거의 안 쓰는 절제"** — Linear는 "blue를 얼마나 적게 쓸지를 제한했다"고 명시. 포화 그라데이션·네온 글로우 회피가 곧 프리미엄 신호. accent는 primary CTA·active 상태·diff 강조에만.
5. **일러스트 금지, 진짜 산출물만** — 실제 제품 UI 캡처를 dpr=2 고해상도로. 흐린 스샷=즉시 싸구려. 우리는 ERD Diff(Split/Unified)·Risk Check 모달·Dry-run Stack을 보여준다.
6. **마케팅과 how-to를 분리** — 랜딩은 설득용, 설치/사용은 사이드바+TOC 가이드(Raycast manual, Tauri Starlight). 한 화면에 한 메시지(one-idea-per-section).
7. **우리만의 필수 차별점 — 미공증 첫 실행 안내** — Linear/Raycast/Warp는 전부 notarize/Homebrew라 Gatekeeper 단계가 없다. SQLPreShift는 미공증 `.dmg`라 우클릭>Open / `xattr -dr com.apple.quarantine`를 **Caution/Tip 콜아웃**으로 전면화해야 한다. 레퍼런스가 비운 지점을 우리가 채운다.
8. **정직한 신뢰 신호** — 가짜 고객 로고·"100k+ developers"·MAU 카운터 금지(포트폴리오 데모라 즉시 거짓이 됨). 검증 가능한 사실만: 18 rules · 1 TX · 100% local · MIT · ERP 92-table/Pagila.

---

## 3. 템플릿 5종 비교표

| 파일명 | 스타일 | quality | ai-smell↓ | guide-detail | 한줄평 |
|---|---|:---:|:---:|:---:|---|
| **template-1-linear-precision** | Linear 정밀(절제 다크·정밀 타이포) | **7.5** | **2.5** | **7** | 토큰 규율·목업 정성·정직함이 최상위. 폰트(Jakarta)·반응형 견고성만 보강하면 베이스 최적 |
| template-2-product-hero | 대담한 히어로(CSS 목업 중앙) | 7.0 | 3.0 | 6.5 | 데모 임팩트는 강하나 hero 고정 px·7열 flow 반응형 위험, ai-smell 약간 높음 |
| template-3-docs-integrated | 가이드 통합(좌 sticky TOC+본문) | 7.5 | 3.0 | **7** | 가이드 깊이 최우선=미공증 마찰 많은 우리에 적합. trust strip·6칼럼 리듬·hero 글로우가 경계선 |
| template-4-terminal-craft | 터미널 craft(모노스페이스·코드 아티팩트) | 7.0 | 2.5 | 6.5 | SQL/diff 제품 본질과 정합. hero가 터미널 로그로 약해질 위험, 본문 미검증 |
| template-5-editorial-calm | 에디토리얼(매니페스토·pull-quote) | 6.5 | 2.5 | **4** | "안전 게이트의 왜"를 서사로 파는 포지셔닝 정합 최고. 단 guide-detail 4로 가장 낮음, CTA 기본 대비 약함 |

**판독**: quality·ai-smell·guide-detail을 동시에 본 합은 **1번(7.5/2.5/7) > 3번(7.5/3/7) > 4번(7/2.5/6.5) ≈ 2번(7/3/6.5) > 5번(6.5/2.5/4)**. 1번이 ai-smell 최저(2.5)면서 quality 최고(7.5)를 겸비한 유일한 항목이다.

---

## 4. 추천 1순위 + 근거

### 1순위: `template-1-linear-precision.html`

**점수 근거**: quality 7.5(공동 최고) · ai-smell 2.5(최저 동률) · guide-detail 7(최고 동률). 세 축을 모두 상위에서 만족하는 유일한 후보.

**우리 프로젝트 적합성**:

- **graphite 다크 단일 테마와 정합** — 적대적 비평이 "제품 SoT 색/그림자/반경/spacing 토큰을 그대로 가져오고, 사양 구멍(헤딩 스케일 부재·`--space` 64px 상한)만 정확히 짚어 `--space-20/24/32`·`--text-hero/h1/h2` clamp를 신규 정의했다"고 확인. 이는 `research.md §8`이 선행 토큰 작업으로 지목한 **5번(대형 여백)·6번(헤딩 스케일)** 블로커를 코드 레벨에서 이미 의식한 흔적이다. 메모리 `sqlpreshift-design-baseline`의 "silent 0 붕괴" 함정을 정확히 회피.

- **DB 안전게이트 톤(차분·정밀)과 정합** — accent(teal)를 primary CTA·active 탭·diff 강조·PK 표시에만 점적 사용. body::before radial glow도 0.07 alpha 단일 레이어로 "blob 도배" 함정 회피. Linear가 명문화한 "**accent를 적게 쓰는 절제가 곧 timeless/premium**" 원칙을 가장 충실히 구현.

- **포트폴리오 데모로서 정직함** — trust-grid를 가짜 통계 카운터 대신 검증 가능한 사실(18 rules·1 TX·100% local·MIT·ERP/Pagila)로만 채움. 화살표 글리프는 gradient 라인 커넥터·rotate(45deg) 사각형·shield SVG로, 이모지 0개 — `sqlpreshift-no-arrow-glyphs`·이모지 금지 가드 준수.

- **우리만의 차별점(미공증 마찰)을 숨기지 않음** — quarantine 우회를 step + code-bar(라벨/copy-btn/copied 상태)로 전면 노출, sticky dl-card에 OS·~122 MiB·요구사항+alt(xattr) 경로까지. `.code pre .pr`(프롬프트 user-select:none)까지 신경 쓴 "실제로 복붙해 본 사람의 디테일".

**왜 2·3·4·5가 아닌가**:
- **3번**(7.5/3/7): 가이드 깊이는 1번과 동급이나 ai-smell 3(trust strip 제네릭 신뢰배지·6칼럼 feature 리듬 어긋남·hero 글로우 클리셰)으로 1번보다 0.5 높다. 단 **가이드 IA는 1번보다 우수** → §5에서 그래프팅.
- **4번**(7/2.5/6.5): 모노스페이스 craft가 제품 본질과 정합하나 quality 0.5 낮고, 비평이 "hero가 터미널 로그로 귀결돼 약해질 위험"을 지적.
- **5번**(6.5/4/...): 매니페스토 포지셔닝 정합은 최고지만 **guide-detail 4로 압도적 최하** — 미공증 설치 마찰이 핵심인 우리에겐 치명적. 단 **hero 카피·서사**는 최고 → §5에서 그래프팅.
- **2번**(7/3/6.5): 임팩트는 강하나 hero 고정 px·7열 flow 반응형 위험이 1번과 동일하게 존재하면서 ai-smell만 높다.

---

## 5. 추천안을 디벨롭할 방향 (그래프팅 — 특히 가이드 디테일)

**베이스 = 스타일 1**, 여기에 다른 템플릿의 검증된 강점을 이식한다.

### (A) 가이드 IA를 스타일 3에서 이식 — *최우선*
1번의 가이드 점수는 7이지만 비평이 "**스타일 훅은 화려한데 실제 따라할 문자열(ollama/xattr 명령·NL→SQL 예시)을 못 봤다**"고 유보했다. 3번의 **248px sticky TOC(top:84px, independent scroll) + `scroll-padding-top 80px`/`scroll-margin-top 84px` 앵커 보정 + `callout--caution`(quarantine)/`callout--tip`(Ollama) 시맨틱 분리 + `.code__copy` copied 상태**를 그래프팅한다. `research.md §8-10`이 지목한 "5개 조사 모두 미설계한 IA"를 3번 골격으로 메운다.

### (B) Hero 매니페스토 카피를 스타일 5에서 이식
1번의 약점은 비평이 지적한 "**eyebrow/section-head가 전부 mono+uppercase로 통일돼 템플릿 반복으로 읽힐 단조로움**"이다. 5번의 **manifesto 섹션(720px 좁은 컬럼) + pull-quote로 태그라인 `Don't regret after applying — stop it before.` 기념비화**를 hero 직후에 삽입해 "안전 게이트의 왜"를 서사로 판다(메모리 `sqlpreshift-positioning`의 "일상도구 아님→안전 게이트" 포지셔닝과 정합).

### (C) Risk Check를 인라인 카드가 아닌 "모달" 목업으로 — 스타일 3/4 차용
1번 비평이 "제품 핵심이 **Risk Check(모달)**인데 인라인 `.risk-card`로만 목업해 모달 서사가 약하다"고 지적. 3번의 `.mini-risk`(warning-border 오버레이) 또는 4번의 `.risk-card+.golden`(NOT VALID→VALIDATE 강조)을 **딤+오버레이 느낌의 모달 목업**으로 hero나 별도 자리에 세운다.

### (D) 폰트 교체 — Linear 톤 100% 재현
1번 비평: "Plus Jakarta Sans는 라운드·휴머니스트라 -0.035em 강한 음수 트래킹과 만나면 '정밀'보다 '둥근 SaaS'로 흐른다." → **Inter(또는 Inter Display/Inter 두 cut)** 또는 Obsidian식 **시스템 폰트 스택**으로 교체 검토. 단 `research.md §4·§7`이 경고한 **`next/font` + basePath 충돌**과 직결되므로 배포 타깃 결정(아래 §6-1) 후 폰트 로딩 방식 확정.

### (E) 반응형 견고성 보강 — 모든 템플릿 공통 약점
5개 비평 전부가 "**7열 flow·고정 px ERD 노드·N칼럼 feature 그리드의 모바일 미디어쿼리가 잘린 영역 밖**"을 지적. 그래프팅 시 **flow 7단계를 모바일 1칼럼 세로 스택**(`research.md §8-12`: 모바일 방문 다수·breakpoint 토큰 부재), ERD 노드를 절대 px 좌표에서 **flex/grid 흐름**으로 전환, TOC를 모바일에서 접기/숨김 처리한다.

### (F) 다운로드 메타 한 줄 — 레퍼런스 공통 패턴 확정 적용
모든 후보가 sticky dl-card 골격은 갖췄으나, 버튼 아래 메타를 `macOS · Apple Silicon · ~122 MiB / 128 MB · .dmg · or build from source (docker compose up -d)`로 확정 표기(MiB/MB 단위 모순은 `research.md §4`대로 "약 122 MiB / 128 MB" 병기).

---

## 6. 다음 단계 (Next.js 구현 전 결정할 것들 — research.md 미결 블로커 연결)

채택안을 실제 Next.js 정적 사이트로 옮기기 전, `research.md §8`의 **선행 블로커**를 먼저 해소해야 한다. 디자인 템플릿 선정과 **무관하게 코드 시작을 가로막는** 결정들이다.

### 선행 블로커 (이 결정 없이 시작하면 자산 경로 전면 재작업)
1. **배포 타깃: GitHub Pages vs Vercel** (`research.md §8-1`) — Pages면 서브경로 `/sql-preshift/` → `basePath` 필수 → **`next/font`가 상대경로/basePath와 충돌**(`next.config.ts:6-7` 주석이 경고, 미검증). Vercel 루트면 회피. **§5-(D) 폰트 교체가 여기 종속** — 폰트 로딩 방식이 배포 타깃에 묶임.
2. **디렉토리: 옵션 A(frontend 재사용) vs B(별도 site/) + 토큰 공유 방식**(공유/복사/symlink/workspace) (`research.md §6, §8-2`) — 5개 조사가 양분된 미결정. 옵션 A 선택 시 `desktop/package.json` extraResources가 `frontend/out` 전체를 `.dmg`에 넣어 **마케팅 라우트가 .dmg에 혼입**되는 문제 PoC 필요(`§8-3`).

### 토큰 작업 (구현 전 정의 — 채택 템플릿이 이미 신규 정의한 것을 SoT로 승격)
3. **대형 여백 토큰 신규 추가** `--space-20/24/32`(96~128px) — 현 상한 `--space-16`(64px). 채택 템플릿들이 이미 정의했으니 이를 `tokens.css`에 정식 반영 (`research.md §8-5`).
4. **헤딩 type scale 신규 추가** `--text-hero/h1/h2` clamp — 현 `--font-size-lg`(15px)가 최대 (`research.md §8-6`). design-guide 원본 naming과 통일 여부 결정.
5. **라이트/다크 모드 정책** (`research.md §8-7`) — 앱 토큰은 다크 단일, design-guide 원본/guide-site는 light 기본. 채택안은 전부 다크 단일이므로 **다크 고정 권장**, 단 병합 시 색상값·shadow 네이밍 매핑 테이블 필요.
6. **`<html lang="ko">` 하드코딩 처리** (`layout.tsx:22`, `research.md §8-4`) — UI 영어 SoT 방침과 충돌. 웹사이트 `lang="en"` 기본으로.

### 미디어/콘텐츠 (사용자 결정 필요)
7. **스크린샷 정책 충돌 해소** (`research.md §5, §8-8`) — "플레이스홀더로 먼저 짓고 미디어는 구현 후"(메모리 `sqlpreshift-positioning:30-32`, 사용자 명시) vs "선확보 블로킹"(조사). **현재 실 스크린샷 0개**, `shot-mid.mjs`는 풀 파이프라인 캡처 불가. → 채택 템플릿들이 전부 CSS 목업으로 만든 것이 이 정책과 정합("**실제 앱 캡처로 교체하면 신뢰도 한 단계 상승**"이라 모든 비평이 명시). **권장: CSS 목업으로 먼저 출시, 미디어는 후속**.
8. **README 카피 → 랜딩 마케팅 톤 리라이트 범위** (`research.md §5, §8-9`) — README는 문서체. §5-(B) 매니페스토 카피와 함께 영어 SoT 리라이트.

### 검증 게이트 (채택 확정 전 필수)
9. **템플릿 파일 실재화** — 5개 `template-*.html`이 **디스크에 없음**(`website-planning/`에 `research.md`만). 모든 점수가 CSS 발췌 기반 추정치이므로, 1순위(스타일 1)의 **`<body>` 본문을 채워** (a) 실제 hero/단계 카피, (b) 복사할 명령(`ollama pull gemma4:latest`/`bge-m3:latest`, `xattr -dr com.apple.quarantine`, `docker compose up -d`), (c) NL→SQL 예시, (d) 모바일 미디어쿼리가 들어갔는지 **렌더로 재검증**한 뒤에 채택 확정 — 실기기 Safari 검증 포함(메모리 `sqlpreshift-safari-webkit-rendering`: hero 글로우+nav `backdrop-filter blur` 합성 레이어 흐림 위험, 헤드리스 재현 불가).

---

**관련 파일 경로**:
- `/Users/taehyunan/Desktop/Repo/Practice/sql-preshift/website-planning/research.md` (유일하게 디스크 실재 — 블로커 SoT)
- `/Users/taehyunan/Desktop/Repo/Practice/sql-preshift/frontend/src/styles/tokens.css` (Calm Clarity 토큰, §8-5·6 신규 정의 대상)
- `/Users/taehyunan/Desktop/Repo/Practice/sql-preshift/frontend/src/app/layout.tsx` (`:22` `lang="ko"` 충돌, §8-4)
- `/Users/taehyunan/Desktop/Repo/Practice/sql-preshift/frontend/next.config.ts` (`:6-7` next/font+basePath 충돌 경고)
- `/Users/taehyunan/Desktop/Repo/Practice/sql-preshift/desktop/release/SQLPreShift-0.1.0-arm64.dmg` (128,201,341 bytes = 약 122 MiB / 128 MB)
- `/Users/taehyunan/.claude/skills/design-guide/design_guideline_repo/guide-site/index.html` (같은 Calm Clarity 가이드 사이트, nav/sticky/반응형 참조 후보)
- **주의**: `template-1~5.html` 5개 파일은 **디스크에 부재** — 본 추천은 적대적 비평의 CSS 발췌 분석에 기반하며, 채택 확정 전 §6-9 실재화·렌더 검증 필요