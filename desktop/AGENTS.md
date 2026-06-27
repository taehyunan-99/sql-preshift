# desktop 작업 가이드

Electron 셸은 백엔드(PyInstaller sidecar)와 프론트(Next 정적 out/)를 하나의 macOS 앱으로 묶는 얇은 래퍼다 — 핵심 로직은 backend/frontend에 있고 여기엔 두지 않는다.

## 1. WHAT — 이 모듈은 무엇을 하는가
PyInstaller sidecar 바이너리를 spawn하고, stdout의 `SQLPRESHIFT_PORT=n`을 파싱해 백엔드 포트를 알아낸 뒤 `/health` 200까지 기다렸다가 창을 연다. 정적 Next `out/`은 `app://` custom protocol로 서빙한다. 앱 종료 시 sidecar를 kill한다.

## 2. CONTENTS — 파일과 기술 스택
- `main.js` — 메인 프로세스(plain JS). sidecar spawn·포트 파싱·`/health` 게이트·`app://` 핸들러·생명주기 kill.
- `preload.js` — 창 URL 쿼리(`?apiPort=n`)에서 포트를 읽어 `window.desktop.apiBase`로 노출(contextBridge).
- `package.json` — Electron + electron-builder + dev 편의(concurrently/wait-on). 패키징 `build` 키(3d).

기술 스택: Electron 33, electron-builder. 메인은 plain JS(TS 빌드 스텝 없음 — Simplicity First).

## 3. HOW — 일반적인 수정은 어떻게 하는가
- 개발: `npm run dev`(루트 `desktop/`에서). `next dev`(:3000) + electron 동시 기동. dev는 `localhost:3000`을, packaged는 `app://`을 로드한다(`app.isPackaged` 분기).
- sidecar 경로: dev는 `../backend/dist/sqlpreshift-backend/sqlpreshift-backend`, packaged는 `process.resourcesPath/backend/`(extraResources, 3d).

## 4. HOW NOT — 시스템을 깨뜨리는 비명백한 함정
- `assetPrefix`로 정적 자산을 상대경로화하지 말 것 — `next/font`가 상대 prefix를 거부한다. `app://` 핸들러가 절대 `/_next/` 경로를 `out/`로 매핑하는 게 이 프로젝트의 방식이다.
- 동적 포트는 빌드타임 env에 박을 수 없다(sidecar가 매 기동 빈 포트를 OS에서 받음) — preload 주입으로만 전달한다.
- sidecar는 onedir 번들이다. 바이너리만 복사하면 안 되고 `_internal/`·`data/` 동반 디렉토리를 통째로 옮겨야 한다(asar 밖, extraResources).

## 5. WHERE — 다른 모듈과의 의존성
- **의존**: backend sidecar 바이너리(`backend/dist/`, PyInstaller spec로 빌드), frontend 정적 `out/`(`output:"export"`).
- **경계**: renderer로의 포트 전달은 `window.desktop.apiBase` 단일 — frontend `src/lib/api.ts:116`의 `API_BASE`가 이걸 우선 읽는다.

## 6. WHY — 코드에 안 적힌 배경 지식
포트폴리오/데모용 설치형. Ollama는 3단계에서 동봉하지 않으며 호스트 `localhost:11434`에 별도 설치돼 있다고 가정한다(4단계 예정).

## 7. COMMANDS — 빌드/테스트/린트
- 개발: `npm run dev`
- 프론트 빌드(패키징 입력): `npm run build:front`
- macOS .dmg 빌드: `npm run dist`(3d 이후)

## 8. ⚠️ LEARNED CAUTIONS — 학습된 주의사항
<!--
누적된 주의사항은 별도 파일 LEARNED_CAUTIONS.md에 보관됩니다.
learn 스킬(/learn 또는 Codex의 $learn)은 LEARNED_CAUTIONS.md에만 항목을 추가하며 이 본문은 수정하지 않습니다.
-->

@./LEARNED_CAUTIONS.md

자세한 내용은 [LEARNED_CAUTIONS.md](./LEARNED_CAUTIONS.md) 참조.
