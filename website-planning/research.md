# SQLPreShift 제품 웹사이트 — Research

## 1. 요약

SQLPreShift의 **랜딩 + 사용 가이드 통합 제품 웹사이트**를 만든다(메모리 `sqlpreshift-website-plan` 확정: Next.js 15 `output:"export"` 정적 + Calm Clarity 토큰 공유, GitHub Pages/Vercel 배포, `.dmg` 다운로드 포함). 핵심 미결 결정은 **기존 `frontend/`를 재사용·확장(옵션 A) vs 별도 디렉토리 분리(옵션 B)** 이며, 이 결정이 토큰 공유 방식·배포 경로·번들 의존성을 모두 종속시킨다 — 본 research는 결론을 내리지 않고 trade-off만 정리한다(§6). 5개 병렬 조사가 디렉토리/토큰 공유 방식에서 **서로 모순된 권고**를 냈고, 검증 결과 일부 "재사용 가능" 주장(LanguageToggle 독립성, AppBackdrop 무인자 재사용, `next/font`+basePath 호환)이 **코드와 어긋남**을 확인했다. 또한 `basePath`/배포 타깃 미결정이 구조 결정을 가로막는 선행 블로커다(§8).

> 표기 규칙: 직접 검증한 사실은 `file:line`으로, 추론은 [추측]으로 표시한다. 본 research가 원자료(5개 조사)의 단정을 **반박·정정한 지점은 ⚠️로 강조**한다.

---

## 2. 재사용 가능 자산 (그대로 공유 vs 분리 필요)

| 자산 | 위치 | 판정 | 근거 / 주의 |
|---|---|---|---|
| **Calm Clarity 토큰** | `frontend/src/styles/tokens.css` | ✅ 공유 가능(순수 CSS 변수) | 색/타이포/간격/elevation/radius/motion. 단 **다크 단일 테마**·space 상한 64px·타입 4단계(§3) |
| **i18n 헬퍼** | `frontend/src/lib/i18n.ts` | ✅ 공유 가능(순수 유틸) | `pick(lang,en,ko)`/`makeT(lang)`. 의존 없음 |
| **LanguageToggle** | `frontend/src/components/LanguageToggle/index.tsx` | ⚠️ **비독립 — 분리 필요** | `:3` `usePipelineStore` import, `:13-14`에서 store의 `language`/`setLanguage`를 직접 읽음. **순수 컴포넌트 아님** — 웹사이트로 옮기려면 language 슬라이스를 별도 store로 떼거나 props화 필요 |
| **AppBackdrop** | `frontend/src/components/AppBackdrop/index.tsx` | △ 재사용 가능하나 **무인자 아님** | `:30-34` `stage: 'lobby' \| 'work'` prop **필수**. 호출부에서 `stage="lobby"` 명시 주입해야 함. aurora+디더 본체는 위치 고정이라 그대로 동작 |
| **API 클라이언트** | `frontend/src/lib/api.ts` | ❌ 앱 전용 | 웹사이트는 backend 호출 없음 → `API_BASE` 3계층 폴백(`:118-121`)이 **무의미**. 가져오면 dead 코드/타입만 남음. ⚠️ "동일 설정 공유 가능"은 비약 |
| API 타입 정의 | `api.ts` (`ColumnDef`/`NodeDef`/`RiskItem` 등) | △ 문서용으로만 | 가이드에서 "이런 데이터를 다룬다" 설명에 인용 가능 |
| **ERD/파이프라인 컴포넌트** | `components/erd/`, `InputPanel/`, `DiffControls/`, `AuditDrawer/`, `DiagnosticsPanel/`, `DatabaseConnect/`, `ModelSettings/` 등 | ❌ 전부 분리 | pipeline 상태 제어 결합 |
| **Zustand store** | `store/pipeline.ts`, `store/erdLab.ts` | ❌ 앱 상태 | 정적 콘텐츠엔 불필요. 단 language 토글만은 §위 LanguageToggle 때문에 최소 슬라이스 필요할 수 있음 |
| **Monaco self-host** | `lib/monaco-setup.ts` | ❌ 불필요 | 웹사이트는 온라인 → CDN 가능하나 SQL 뷰 자체가 가이드에 불요 |
| **RootLayout** | `frontend/src/app/layout.tsx` | ⚠️ **그대로 상속 시 충돌** | `:22` `<html lang="ko">` **하드코딩** → UI 영어 SoT 방침과 정면 충돌(§8). `:2,6` `Plus_Jakarta_Sans` next/font import(§4 함정), `:11-14` metadata 2줄(OG/twitter 카드 부재) |

**참조 자산(놓쳤던 것):** `/Users/taehyunan/.claude/skills/design-guide/design_guideline_repo/guide-site/index.html` — **같은 Calm Clarity로 만든 가이드 사이트 HTML(132KB)이 이미 실재**한다(확인: `<link href="../tokens/tokens.css">`, sticky nav + `backdrop-filter blur`, `data-theme="light"` 기본). 5개 조사 중 누구도 발견하지 못했으나, **랜딩 레이아웃·nav·반응형 패턴의 직접 참조 후보**다. 단 이 사이트는 **light 기본 + SUIT/Jakarta CDN 폰트**라 앱(다크 단일)과 테마가 다르므로 그대로 복붙은 불가(§3, §8).

---

## 3. 디자인 토큰 시스템 (Calm Clarity — 카테고리 + 함정)

`frontend/src/styles/tokens.css`는 색/타이포/간격/elevation/radius/motion 6범주를 CSS 변수로 정의한 **specialized 다크 graphite variant**다(`:60-100` 직접 확인). design-guide 스킬의 원본 토큰(`design_guideline_repo/tokens/tokens.css`)과 **구조는 같고 값·범위가 다르다**.

**검증된 토큰 현황(`tokens.css:63-99`):**
- **radius**: sm(4)/md(8)/lg(12)/pill(999) — 충분
- **space**: `--space-xs/sm/md/lg` named + `--space-1/2/3/4/5/6/8/12/16` 4px alias. **정의됨: 1/2/3/4/5/6/8/12/16**(5=20px도 `:77`에 채워짐). **미정의: 7/9/10/11/13/14/15**.
  - ⚠️ **정정**: 여러 조사가 "space 구멍"으로 경고했으나, 실제 문제는 "구멍"이 아니라 **상한 부족**이다. 최대값이 `--space-16`(64px, `:81`)이고 그 위가 없다. **랜딩 hero/섹션은 96~128px 여백이 흔한데 `--space-20`/`--space-24`가 없어, 참조 시 메모리 경고대로 silent fallback→0 붕괴**한다. 랜딩용 대형 여백 토큰을 신규 추가해야 한다.
- **typography**: `--font-size-xs(11)/sm(12)/md(13)/lg(15)`의 **4단계뿐**(`:86-89`). ⚠️ design-guide **원본**엔 `--text-display/h1/h2/h3/body/caption` 6단계 type scale이 있지만 **앱 `tokens.css`엔 없다**. 랜딩 hero/H1/H2가 필요하므로 **상위 헤딩 토큰 신규 추가 필수**. (2번째 조사 "6단계 없음, 추가 필요" + 5번째 조사 "원본엔 있음"은 **둘 다 부분적으로 맞다 — 가리키는 tokens.css가 다를 뿐**.)
- **폰트**: `--font-mono`(Fira Code) / `--font-sans`(-apple-system)만(`:84-85`). 언어별 폰트(Plus Jakarta / SUIT) **미명시** — 실제 sans 폰트는 `layout.tsx:2,6`의 `next/font/google` Plus_Jakarta_Sans가 body className으로 주입(토큰 밖).
- **motion**: `--transition-fast/base/slow` + `--ease-settle`(탄성 정착) + `--transition-settle`(`:91-99`). 원본보다 세분화 — 그대로 상속 권장.
- **elevation**: `--shadow-card/float/modal/focus`(`:60` 등 목적별 명명). 원본은 sm/md/lg/xl. ⚠️ 병합 시 **이름 매핑 테이블 필요**(`--shadow-float` ↔ 원본 `--shadow-md`).

**함정 — styled-jsx 신뢰불가**(메모리 `sqlpreshift-styled-jsx-untrusted`, 커밋 7fa8578): 외부 const 문자열·motion 요소·createPortal에 styled-jsx가 미적용돼 흰 박스 버그가 난다. 그래서 앱은 **모든 스타일을 인라인 `style` 속성 + tokens.css 전역변수**로 작성(예: `LanguageToggle/index.tsx:18-26`, `AppBackdrop/index.tsx:39-68` 전부 인라인). 웹사이트가 컴포넌트 수가 많고 styled-jsx/framer-motion을 쓸 계획이면 **인라인 강제 또는 CSS Modules/별도 CSS-in-JS** 도입 결정 필요(후자는 `next.config` transpilePackages 설정 동반).

---

## 4. 배포 + .dmg 다운로드

**static export 제약(`next.config.ts:3-11` 직접 확인):**
- `output:"export"`(`:8`) — `next build`가 `out/`(index.html + `_next/`) 생성. dev(`localhost:3000`)·packaged(`app://`) 동일 코드.
- ⚠️ **`assetPrefix`를 두지 않는 이유가 코드 주석에 명시됨**(`:6-7`): "**`next/font`가 상대경로를 거부하고**, Electron은 app:// 핸들러가 절대 `/_next/` 경로를 매핑한다." → **이것이 §8의 핵심 리스크다.** 웹사이트를 GitHub Pages 서브경로(`/sql-preshift/`)에 배포하려면 `basePath`가 필요한데, **`next/font`가 상대경로/basePath와 충돌하는지 본 조사들은 미검증**(여러 조사가 "정상 호환"이라 반복 단정했으나 근거 없음, 오히려 이 주석은 반대 신호). Vercel 루트 배포면 basePath 불요라 문제 회피.

**.dmg 산출물(직접 측정):**
- 위치: `desktop/release/SQLPreShift-0.1.0-arm64.dmg`, **실측 128,201,341 bytes**(2026-06-26 23:55 생성).
  - ⚠️ **크기 모순 정정**: 3번째 조사 "122MB" = **122.26 MiB**(÷1024²), 4번째 조사 "128MB" = **128.2 MB**(÷1000²). **둘은 같은 파일의 단위 차이**(MiB vs MB)일 뿐 어느 쪽도 틀리지 않았다. 표기는 "약 122 MiB / 128 MB"로 통일 권장.
- `electron-builder` 설정: `desktop/package.json` build 섹션 target=dmg arch=[arm64], `dist` 스크립트가 frontend 빌드 후 `electron-builder --mac dmg --arm64`. **코드 서명·공증(notarization) 없음** → 설치 시 quarantine 우회 필수.
- `out/`(`.gitignore:7`)·`desktop/release/`(`.gitignore:9`) 모두 git 제외.

**다운로드 UX(README.md:62-88 확인, 가이드에 그대로 이식):**
1. Releases에서 `SQLPreShift-*.dmg` 받기 → 2. Applications로 드래그 → 3. **첫 실행** 우클릭>열기, 또는 `xattr -dr com.apple.quarantine /Applications/SQLPreShift.app`(공증 전 차단 우회).

**배포 인프라 현황:**
- **GitHub Releases 미구성**: git tag 없음, `.github/workflows/` 없음. README `:67` Releases 링크는 가리키지만 실제 릴리스 미발표. → 수동 Release 생성 + .dmg 첨부 필요. **단 `/release` 스킬이 존재**하므로 자동화 경로 검토 가능(원조사는 "수동 필수"로만 단정 — 반쪽).
- 정적 배포 타깃 코드에 없음. 메모리 `sqlpreshift-website-plan`만 "GitHub Pages/Vercel" 언급. → §8 블로커.
- **Ollama 설치 가이드**: README `:80-83` `ollama pull gemma4:latest` / `bge-m3:latest`. ✅ **메모리 `sqlpreshift-ollama-host-arch`와 태그 일치 검증 완료**(채팅 gemma4:latest, 임베딩 bge-m3:latest 1024차원). 가이드에 그대로 이식 가능.

---

## 5. 콘텐츠 원천

**랜딩 카피 추출(README.md 전수 확인):** README가 섹션화 가능한 완성된 카피를 보유.
- **Hero**: 한 줄 설명 "안전 게이트"(`:5`) + "적용한 뒤에 후회하지 말고, 적용하기 전에 막는다"(`:30`)
- **Why**: 마이그레이션 비가역성(`:24-32`)
- **Key Features 5종**(`:38-42`): 누적 dry-run+단일TX / 위험룰18종+golden path / size-aware / read-only 무결성진단 / 로컬 LLM(NL→SQL+RAG, 선택)
- **How it works**: mermaid flowchart Connect→Input→ERD Diff→Risk→Dry-run→Apply→Rollback(`:48-58`)
- **Download/Guide**: §4
- **Architecture / Run from source**(`:92-100`): docker compose 데모 DB(ERP 92-table, Pagila), SQLite 메타DB
- **섹션화 제안**: Hero → Features → How it works → Download & Install Guide → (Ollama optional) → Architecture

⚠️ **카피 톤 미검증**: README는 **문서체**다. 랜딩 hero/기능 카피로 바로 쓸 마케팅 톤인지 평가 없음 — **재작성 필요할 수 있음**. UI 영어 SoT 방침상 **README.en.md를 원본으로 삼되 랜딩용 리라이트** 전제.

**사용 가이드 흐름**(README + `backend/AGENTS.md` 런타임DB 분리 개념): 설치(.dmg) → 연결(런타임 DB, quarantine 우회) → 무결성 진단(read-only) → 입력(SQL/NL) → ERD diff → 위험감지+golden path → dry-run 스택 누적 → Apply/Rollback. README는 이 흐름을 암묵적으로만 담아 가이드로 재전개 필요.

**🚨 확보 못한 비주얼 자산 리스트(블로커성):**
- `assets/`에 **`placeholder.png`(1822 bytes) 1개뿐** — 실제 스크린샷 0.
- README TODO 주석: `:17` hero.gif(전체 파이프라인 8-10s), `:85` s1-connect.png(연결 화면).
- 캡처 도구 `frontend/scripts/shot-mid.mjs`는 **hover 3프레임(m0/m50/m100)만** 캡처하고, **localhost:3000에 앱+ERD 엣지(`.react-flow__edge-path`)가 떠 있어야 동작**(DB 연결·입력·diff까지 수동 준비 전제). → **단계별 풀 파이프라인 캡처 파이프라인은 사실상 없음.**
- ⚠️ **정책 충돌(사용자 재확인 필요)**: 4번째 조사는 "스크린샷 구현 전 **반드시 확보**(블로킹)"라 했으나, 메모리 `sqlpreshift-positioning:30-32`는 "**히어로/데모 영상은 기능·구현 완성 *이후* 꾸미기 단계에서 다룬다(사용자 명시), 지금은 착수 안 함**"으로 못박았다. → **"플레이스홀더로 먼저 짓고 미디어는 나중"이 맞는지 사용자 결정 필요**(§8).

**준수 규칙(메모리):** UI 문자열 전부 영어(`sqlpreshift-ui-english`, 확립 용어사전 Ready/Analyzing/Preview/Applying/Applied·Add/Remove/Modify·Split/Unified·Risks) · 화살표 글리프 금지(`sqlpreshift-no-arrow-glyphs`) · 이모지 금지 · 디자인 기준 InputPanel(`sqlpreshift-design-baseline`: glass-trim+shadow-float+accent glow+광활한 여백+settle 모션).

---

## 6. 핵심 결정: 재사용 vs 별도 디렉토리 (trade-off만 — 결론은 사용자)

⚠️ **조사 간 합의 없음**: 1번째 조사는 **옵션 A 변형**(frontend 내 `website/` 폴더)을, 2·5번째 조사는 **옵션 B**(별도 `site/` 분리)를 권고했다. **양쪽 다 동일하게 `@xyflow`/Monaco 무거운 의존성을 인지하고도 반대 결론**을 냈다 — 미결정이 양분됨. 아래는 사실 기반 trade-off만.

| 축 | 옵션 A: 기존 `frontend/` 재사용·확장 | 옵션 B: 별도 디렉토리 분리 |
|---|---|---|
| **구조** | `app/(marketing)/`·`app/(pipeline)/` route group 또는 `app/website/` prefix 추가. 현재 `src/app`엔 `layout.tsx`+`page.tsx`만(라우트 그룹 없음) | monorepo에 Next 3개(backend·frontend·`site`) |
| **토큰 공유** | ✅ 자동(같은 `src/styles/tokens.css`) | 결정 필요: 복사 / symlink / npm workspace |
| **번들 의존성** | ⚠️ `@xyflow/react`·`monaco`·`dagre` 등 앱 전용 무거운 dep가 그대로 존재. 트리셰이킹 의존 | ✅ 최소 dep로 신규(§7). ERD/Monaco 없음 |
| **Electron 패키징** | ⚠️ `desktop/package.json` extraResources가 `../frontend/out` **전체 복사** → **마케팅 라우트가 .dmg에 섞여 들어감**(개념적·용량 부정합). "라우트 필터링"이 electron-builder/Next export에서 실제 가능한지 **미검증** | ✅ frontend/out만 선택 포함, 깔끔 |
| **배포** | Electron 정적 export 설정 공유. basePath 없음(앱과 동일) | ✅ 독립 basePath/배포(GitHub Pages/Vercel) 자유 |
| **metadata/lang** | layout.tsx `:22` `lang="ko"` 하드코딩·metadata 2줄을 페이지별로 분기 필요(route group별 layout) | 신규 작성이라 영어 SoT·OG 카드 처음부터 정합 |
| **API_BASE** | `window.desktop?.apiBase` 단일 HTML 최적화 → 다중 엔트리 전환 시 Electron 로직 변경 | backend 무관 — 애초에 불요 |
| **`page.tsx` 리팩토링** | 거대 클라이언트 page.tsx를 route group으로 재구성 부담 | 없음 |
| **유지보수 리스크** | ✅ 단일 프로젝트, 토큰 드리프트 없음 | ⚠️ 토큰 복사본 2개 → 한쪽만 갱신 시 시각 불일치(symlink/workspace로 완화) |
| **hot-reload** | ✅ 단일 | 분산(2 프로젝트 동시) |

**토큰 공유 방식도 3파 분열(서로 배타적)**: 1번째 "import 그대로 공유"(→옵션 A 강제) / 2번째 "복사 baseline+delta"(→드리프트) / 5번째 "symlink 또는 npm workspace"(→모노레포 재구성). 어느 디렉토리 결정을 하든 이 공유 방식이 따라온다.

---

## 7. 기술 스택 (재사용 vs 마케팅 불필요)

`frontend/package.json` 기준 분류:

| 분류 | 패키지 | 웹사이트 |
|---|---|---|
| **재사용(코어)** | Next.js 15, React 19, motion | ✅ 정적 사이트에 그대로 |
| **선택적** | zustand, @tanstack/react-query | △ 단순 정적이면 불요. 단 LanguageToggle 재사용 시 zustand 최소 슬라이스 필요(§2) |
| **앱 전용(제거)** | `@xyflow/react`, `dagre`, `@monaco-editor/react`, `monaco-editor` | ❌ ERD/SQL 뷰 없음 → 정적 번들 비대화 방지 위해 제거 |

- **옵션 A 선택 시**: 위 앱 전용 dep가 한 package.json에 공존 — 트리셰이킹으로 마케팅 번들에서 빠지는지 빌드 검증 필요.
- **옵션 B 선택 시**: 최소 `site/package.json`(next/react/motion[+react-query/zustand 선택])로 신규.
- **폰트**: layout.tsx의 `Plus_Jakarta_Sans` next/font. guide-site는 CDN(`fonts.googleapis.com` Jakarta + jsdelivr SUIT) 사용. ⚠️ `next/font`+basePath 충돌 리스크(§4)와 직결 — 배포 타깃 결정 후 폰트 로딩 방식 확정.
- **design-guide 스킬**: 토큰·컴포넌트 문서를 부분 로드(전체 CSS 아님)하므로 웹사이트 구성 시 `/design-guide`로 토큰 효율적 호출 가능.

---

## 8. 미해결 리스크 + 다음 단계 질문 (plan 전 사용자 답변 필요)

**선행 블로커 — 이 결정 없이 코드 시작 시 자산 경로 전면 재작업:**
1. **배포 타깃은 GitHub Pages인가 Vercel인가?** Pages면 서브경로 `/sql-preshift/` → `basePath` 필수 → **`next/font`와 basePath 조합 충돌 검증 필요**(`next.config.ts:6-7` 주석이 "next/font가 상대경로 거부"라 경고, 미검증). Vercel 루트면 basePath 불요로 회피. `next/font`·정적 자산 경로·.dmg 링크 형식이 전부 여기 종속.
2. **디렉토리: 옵션 A vs B?**(§6) + **토큰 공유 방식: 공유/복사/symlink/workspace?** — 셋은 묶여 있음.

**구조 결정에 딸린 검증 항목:**
3. **옵션 A 선택 시**: Electron extraResources(`desktop/package.json`)가 `frontend/out` 전체를 .dmg에 넣으므로 마케팅 라우트 혼입 — **Next static export에서 특정 라우트만 .dmg에서 제외 가능한지** PoC 필요(미검증).
4. **layout.tsx `<html lang="ko">` 하드코딩(`:22`) 처리**: 영어 SoT 방침과 충돌. 웹사이트는 `lang="en"` 기본 + 토글로 갈지 결정.

**토큰 작업(구현 전 정의 필요):**
5. **랜딩용 대형 여백 토큰 신규 추가**(`--space-20`/`--space-24` 등 96~128px) — 현 상한 `--space-16`(64px). 미정의 var는 silent 0 붕괴.
6. **헤딩 type scale 신규 추가**(`--text-display`/h1/h2 등) — 현 `--font-size-lg`(15px)가 최대라 hero 불가. design-guide 원본 naming과 통일할지 결정.
7. **라이트/다크 모드 정책**: 앱 토큰은 **다크 단일**, design-guide 원본·guide-site는 **light 기본+다크 오버라이드+prefers-color-scheme**. 랜딩 기본 테마/토글 제공 여부 미결정. 병합 시 색상값 충돌(예: `--bg-primary`)·shadow 네이밍 충돌 → **매핑 테이블 필요**.

**미디어/콘텐츠:**
8. **스크린샷 정책 충돌 해소**(§5): "플레이스홀더로 먼저, 미디어는 구현 후"(positioning 메모리 `:30-32`)가 맞는지 vs "선확보 블로킹"(4번째 조사). 현재 실 스크린샷 0, `shot-mid.mjs`는 풀 파이프라인 캡처 불가.
9. **README 카피 → 랜딩 마케팅 톤 리라이트** 범위 확정(문서체 → 히어로/기능 카피).

**누락 영역(본 조사들이 다루지 않음 — plan에서 채워야):**
10. **정보구조(IA)/네비게이션**: 단일 롱페이지 vs `/guide`·`/download` 멀티페이지, 헤더/푸터, CTA 위치, 앵커 구조 — **5개 조사 모두 미설계**.
11. **SEO 메타**: OG 이미지·twitter 카드·sitemap·robots — layout.tsx metadata는 title/description 2줄뿐(`:11-14`).
12. **반응형/모바일**: 앱은 데스크톱 전용 ERD라 모바일 대응 없음. tokens.css에 **breakpoint 토큰 없음**(확인: media query 없이 리셋/스크롤바만). 랜딩은 모바일 방문 다수 → 반응형 신규 설계 필요.
13. **접근성·성능 예산**: 다크 graphite 색 대비, 키보드 네비, 폰트 로딩 CLS, 정적 export 번들 목표치 — 포트폴리오 인상에 직결되나 미조사.

**참고 자산:** `design-guide/.../guide-site/index.html`(132KB, 같은 Calm Clarity)이 nav/sticky/반응형/light 테마 참조 후보로 실재(§2) — plan 단계에서 검토 권장.

---

(근거 파일경로 요약 — 직접 검증분: `frontend/src/components/LanguageToggle/index.tsx:3,13-14` · `frontend/src/components/AppBackdrop/index.tsx:30-34` · `frontend/src/app/layout.tsx:2,11-14,22` · `frontend/src/styles/tokens.css:63-99` · `frontend/next.config.ts:6-8` · `desktop/release/SQLPreShift-0.1.0-arm64.dmg`=128,201,341 bytes · `README.md:5,17,30,38-42,48-58,67,80-85` · `/Users/taehyunan/.claude/skills/design-guide/design_guideline_repo/guide-site/index.html` 실재 · 메모리 `sqlpreshift-positioning:30-32`, `sqlpreshift-ollama-host-arch`, `sqlpreshift-website-plan`)