# SQLPreShift 데모 영상 — 상세 시나리오 (샷 리스트)

- **목적**: 메인 페이지 hero 영상. 제품의 핵심 가치(적용 전에 위험을 막는다)를 18초 안에.
- **언어**: 전부 영어 (실제 앱 UI가 영어 SoT).
- **길이**: ~18초, 끝에서 처음으로 부드럽게 loop.
- **톤**: graphite 다크(#1A2024) + teal glow(#2BA8A0). 차분하고 정밀한 모션. 과한 바운스 금지.
- **해상도**: 1920×1080 (retina 2x 권장), 30fps.
- **소리**: 없음 (hero 자동재생 muted loop).

---

## 색 토큰 (실제 앱과 동일)
| 의미 | hex |
|------|-----|
| 배경 | `#1A2024` / 캔버스 `#161B1F` / 표면 `#222A30` |
| accent (teal) | `#2BA8A0` / hover `#34C2B8` |
| 추가(added) | `#5B9A6F` |
| 삭제(removed) | `#C45B5B` |
| 변경(modified) | `#C4955A` |
| 텍스트 | `#E6EBEC` / 보조 `#9BA8AD` |

---

## 타임라인 (총 ~18s, 30fps = 540 프레임)

### ACT 1 — 자연어 입력 → ERD 적용 (0 ~ 6.5s)

| 시간 | 샷 | 디테일 |
|------|----|----|
| 0.0~1.0s | **입력창 줌인** | 다크 배경 중앙에 floating pill 입력창. 살짝 작게 시작 → 부드럽게 줌인하며 teal focus glow 점등. |
| 1.0~3.5s | **자연어 타이핑** | 커서 깜빡임 후 타닥타닥(글자별 stagger) 타이핑: `Add a status column to orders and index created_at` |
| 3.0~3.5s | **자동 감지 배지** | 입력 끝나갈 때 `Detected: Natural Language · 98%` 배지가 teal로 페이드인. |
| 3.5~4.2s | **분석** | `Analyze` 버튼 눌림(살짝 scale down) → `Analyzing…` 스피너 회전. |
| 4.2~6.5s | **ERD 등장** | 화면이 ERD Split 뷰로 전환(blur→선명 + scale-in). `orders` 테이블 카드에 `+ status text` 컬럼이 초록(added) glow로 그려짐. `~Modified` 배지 점등. 우상단 `Split` 토글, 3색 범례. |

### ACT 2 — SQL 입력 → 실수 → 경고 → 되돌리기 (6.5 ~ 13.5s)

| 시간 | 샷 | 디테일 |
|------|----|----|
| 6.5~7.0s | **입력창 복귀** | ERD가 살짝 뒤로 물러나고(dim) 입력창이 다시 전면으로. |
| 7.0~9.0s | **SQL 타이핑** | 이번엔 SQL 직접 입력: `DELETE FROM orders;` (WHERE 절 없음 — 아찔한 실수) `Detected: SQL` 배지. |
| 9.0~9.5s | **분석** | `Analyze` → 스피너. |
| 9.5~11.5s | **위험 경고 모달** | 상단 빨강 밴드 모달이 떠오름(scale + fade). `CRITICAL · DELETE_WITHOUT_WHERE`. 메시지: `Deletes every row — no WHERE clause`. sizeNote: `~1.2M rows will be deleted` (빨강 mono, 펄스 강조). |
| 10.5~11.5s | **golden-path 강조** | 모달 안에 teal로 대안이 슬라이드인: `Suggested: add a WHERE clause, or wrap in a transaction` |
| 11.5~13.5s | **되돌리기** | `Undo` 버튼이 강조(teal ring) → 클릭 → 위험 변경이 스택에서 사라짐(빨강 카드가 fade out + 위로 사라짐). 안도감 주는 비트. |

### ACT 3 — 안전하게 적용 → 완료 (13.5 ~ 18s)

| 시간 | 샷 | 디테일 |
|------|----|----|
| 13.5~14.5s | **dry-run 스택** | 안전한 변경 2건이 스택에 쌓여 표시. 각 행 우측 `dry-run ok` 초록 체크. (1) `ALTER TABLE orders ADD status` (2) `CREATE INDEX CONCURRENTLY idx_created` |
| 14.5~15.5s | **Apply All** | `Apply All (2)` 버튼이 teal로 강조 → 클릭 → 확인 모달 짧게: `2 changes · single transaction`. |
| 15.5~16.5s | **적용 진행** | 트랜잭션 진행 표시(progress shimmer가 좌→우 스윕, 앱의 실제 shimmer 재현). |
| 16.5~17.5s | **완료** | 상단에서 AppliedToast가 떨어지며: `2 changes applied` (초록 dot + 초록 텍스트). 하단 CompletedBar `Applied`. |
| 17.5~18.0s | **엔딩** | 전체가 살짝 dim → 중앙에 SQLPreShift 로고(teal glow) + 한 줄 `Stop it before you apply it.` → 처음으로 crossfade loop. |

---

## 추가 제안 디테일 (내가 더하면 좋다고 본 것)

1. **"전기 연결" 연출 차용 (Langbase 참고)** — ACT 1에서 자연어 입력이 "분석"될 때, 입력창 → ERD로 teal 라인이 흐르듯 연결되며 ERD가 켜지는 연출. 자연어가 SQL/스키마로 "변환"되는 느낌을 시각화.
2. **커서 동선** — 마우스 커서를 실제로 보여주며 버튼으로 이동(Screen Studio 느낌). 클릭 시 작은 ripple. 실제 조작감.
3. **숫자 강조 비트** — `~1.2M rows`가 뜰 때 잠깐 크게 펄스 → "규모가 곧 위험"이라는 메시지 각인.
4. **대비 연출** — ACT 2의 위험(빨강) vs ACT 3의 안전(초록/teal) 색 대비를 의도적으로 강하게. "막았다 → 안전하게 적용"의 안도 서사.
5. **loop 이음새** — 엔딩 로고에서 ACT1 입력창으로 crossfade하되, 입력창이 비어있는 상태로 시작해 자연스럽게 반복.

---

## 미해결/확인 필요
- ACT 2의 위험 규칙을 `CREATE_INDEX_BLOCKING`으로 했는데, ACT 1에서 이미 `created_at` 인덱스를 자연어로 요청 → ACT 2에서 SQL로 또 인덱스? 흐름상 **ACT 2는 다른 위험**(예: `ADD_NOT_NULL_NO_DEFAULT` 또는 `DELETE_WITHOUT_WHERE`)이 더 자연스러울 수 있음. → 시나리오 확정 시 조정.
