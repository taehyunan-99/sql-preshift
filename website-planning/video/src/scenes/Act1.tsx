import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig, Easing } from 'remotion';
import { C, SPRING } from '../theme';
import { CommandBar } from '../ui/CommandBar';
import { TableCard, type Col } from '../ui/TableCard';
import { s } from '../timing';

// ACT1 — 자연어 입력 → ERD 적용 (0~9.0s)
// 비트: 입력창 줌인 → 타이핑 → 자동감지 배지 → Analyze 스피너 → 전기연결(FK 점등) → ERD 등장(+status glow) → 충분히 머묾 → dim 퇴장

const NL_TEXT = 'Add a status column to orders and index created_at';

// orders 테이블 — status 컬럼이 added로 등장(주인공).
const ORDERS_COLS: Col[] = [
  { name: 'id', type: 'bigint', pk: true },
  { name: 'customer_id', type: 'bigint', fk: true },
  { name: 'product_id', type: 'bigint', fk: true },
  { name: 'total', type: 'numeric' },
  { name: 'created_at', type: 'timestamptz' },
  { name: 'status', type: 'text', diff: 'added' },
];

const CUSTOMERS_COLS: Col[] = [
  { name: 'id', type: 'bigint', pk: true },
  { name: 'name', type: 'text' },
  { name: 'email', type: 'text' },
];

const PRODUCTS_COLS: Col[] = [
  { name: 'id', type: 'bigint', pk: true },
  { name: 'name', type: 'text' },
  { name: 'price', type: 'numeric' },
];

const ORDER_ITEMS_COLS: Col[] = [
  { name: 'id', type: 'bigint', pk: true },
  { name: 'order_id', type: 'bigint', fk: true },
  { name: 'qty', type: 'integer' },
];

// ERD 카드 절대 배치 — 1920x1080 무대. orders를 중앙에 두고 위성 테이블을 배치.
// FK 관계: orders.customer_id→customers, orders.product_id→products, order_items.order_id→orders
const LAYOUT = {
  customers: { x: 250, y: 250, w: 300 },
  products: { x: 250, y: 620, w: 300 },
  orders: { x: 760, y: 360, w: 360 },
  order_items: { x: 1340, y: 470, w: 300 },
};

// FK 연결선 — [from카드, to카드] 쌍. 전기 흐름처럼 차례로 점등.
const EDGES: Array<{ from: keyof typeof LAYOUT; to: keyof typeof LAYOUT }> = [
  { from: 'orders', to: 'customers' },
  { from: 'orders', to: 'products' },
  { from: 'order_items', to: 'orders' },
];

export const Act1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 1) 입력창 줌인 (0~1.2s)
  const zoomIn = spring({ frame, fps, config: { damping: 200, mass: 0.8 }, durationInFrames: s(1.2) });
  const barScale = interpolate(zoomIn, [0, 1], [0.88, 1]);
  const focus = interpolate(frame, [s(0.3), s(1.2)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 2) 타이핑 (1.2~4.2s) — 더 천천히
  const typeStart = s(1.2);
  const typeEnd = s(4.2);
  const charCount = Math.round(
    interpolate(frame, [typeStart, typeEnd], [0, NL_TEXT.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }),
  );
  const typed = NL_TEXT.slice(0, charCount);

  // 3) 자동감지 배지 (4.0~4.4s) — 통통 튀게 등장(pop spring)
  const badgeReveal = interpolate(frame, [s(4.0), s(4.4)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const badgePop = spring({ frame: frame - s(4.0), fps, config: SPRING.pop, durationInFrames: s(0.6) });

  // 4) Analyze "클릭" — Act2 Undo와 동일한 클릭 호흡으로 통일(기준 타이밍).
  //    클릭 t=4.6: 눌림 [t, t+0.1, t+0.22], ripple [t, t+0.35], 다음 작업 t+0.45.
  const analyzeClickPress = interpolate(frame, [s(4.6), s(4.7), s(4.82)], [1, 0.93, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const analyzeRipple = interpolate(frame, [s(4.6), s(4.95)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 5) Analyze 스피너 (5.4~6.2s) — 클릭(4.6) 후 다음 단계 전까지 여운을 더 길게(gap 0.8s). 충분히 보여준다(0.8s).
  const analyzing = frame >= s(5.4) && frame < s(6.2);
  const spinDeg = (frame * 12) % 360;

  // 6) 입력창 퇴장 (6.25~6.8s) — 스피너 종료(6.2) 뒤 위로 오르며 페이드아웃
  const barExit = interpolate(frame, [s(6.25), s(6.8)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  const barY = interpolate(barExit, [0, 1], [0, -70]);
  const barOpacity = interpolate(barExit, [0, 1], [1, 0]);
  const barVisible = frame < s(6.8);

  // 7) ERD 등장 (6.6~7.8s) — 입력창 퇴장과 크로스페이드. 통통 안착(settle: 약한 오버슈트).
  const erdStart = s(6.6);
  const erdSpring = spring({ frame: frame - erdStart, fps, config: SPRING.settle, durationInFrames: s(1.2) });
  const erdOpacity = interpolate(frame, [erdStart, erdStart + s(0.8)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const erdScale = interpolate(erdSpring, [0, 1], [0.94, 1]);

  // 7) FK 연결선 전기 점등 (7.2~8.4s) — 각 엣지가 stagger로 차오름. ERD 등장 직후.
  const wireBase = s(7.2);
  const wireStep = s(0.35);
  const wireDur = s(0.6);

  // 8) status glow — ERD 안착 후 피어오름(8.0~8.8s)
  const glow = interpolate(frame, [s(8.0), s(8.8)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 9) ERD 퇴장 (9.4~10.0s) — 완전히 페이드아웃(0까지). 0.15 잔상이 남으면 다음 막에 비쳐 지저분.
  const erdExit = interpolate(frame, [s(9.4), s(10.0)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const erdStageOpacity = erdOpacity * interpolate(erdExit, [0, 1], [1, 0]);
  const erdStageScale = erdScale * interpolate(erdExit, [0, 1], [1, 0.98]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* ERD 레이어 — 절대 배치된 카드 + FK 연결선 */}
      {frame >= erdStart && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: erdStageOpacity,
            transform: `scale(${erdStageScale})`,
            transformOrigin: 'center center',
          }}
        >
          {/* ERD 캔버스 dot grid — 앱 ERD 배경 점 재현. noise로 안 보이게 점은 더 작게(0.8px)·
              간격 넓게(56px)·대비 낮게(0.5 alpha). ERD 장면에만 깔려 정체성을 준다. */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `radial-gradient(rgba(60,72,79,0.5) 0.8px, transparent 0.8px)`,
              backgroundSize: '56px 56px',
              pointerEvents: 'none',
            }}
          />
          {/* FK 연결선 — 카드 뒤 레이어. 전기처럼 차례로 점등. */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <defs>
              <linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={C.accent} stopOpacity="0.2" />
                <stop offset="50%" stopColor={C.accentHi} stopOpacity="0.9" />
                <stop offset="100%" stopColor={C.accent} stopOpacity="0.2" />
              </linearGradient>
            </defs>
            {EDGES.map((e, i) => {
              // 빛의 흐름 방향을 변경 테이블(orders) 기준으로 통일한다.
              // 선의 의미(FK 관계)는 EDGES 그대로지만, 점등·입자는 "항상 orders 쪽으로" 모여들게
              // a(시작)=orders가 아닌 쪽, b(도착)=orders. 이러면 세 선의 시각적 흐름이 하나로 통일된다.
              const ordersEnd: keyof typeof LAYOUT = 'orders';
              const fromKey = e.from === ordersEnd ? e.to : e.from; // 바깥쪽
              const toKey = ordersEnd;                               // 변경 테이블
              const a = LAYOUT[fromKey];
              const b = LAYOUT[toKey];
              // 두 카드 중심을 잇는 직선(카드 가장자리에서 시작)
              const ax = a.x + a.w / 2;
              const ay = a.y + 70;
              const bx = b.x + b.w / 2;
              const by = b.y + 70;
              // 엣지별 stagger 점등 진행
              const p = interpolate(
                frame,
                [wireBase + i * wireStep, wireBase + i * wireStep + wireDur],
                [0, 1],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
              );
              if (p <= 0) return null;
              // 선을 점등 진행만큼 그림(from→to로 빛이 흐름)
              const curX = ax + (bx - ax) * p;
              const curY = ay + (by - ay) * p;
              // 점등 완료 후 흐르는 입자 — 선을 따라 여러 입자가 끊임없이 순환(살아있는 데이터 흐름).
              // 각 엣지마다 위상을 어긋나게(i*0.4) 해서 동시 점멸처럼 안 보이게 한다.
              const flowDone = p >= 1;
              const particles = [0, 0.5]; // 입자 2개가 0.5 간격으로 흐름
              return (
                <g key={i}>
                  <line x1={ax} y1={ay} x2={curX} y2={curY} stroke="url(#edgeGrad)" strokeWidth={2.5} />
                  {/* 점등 헤드 — 그려지는 동안의 빛 입자 */}
                  <circle cx={curX} cy={curY} r={p < 1 ? 5 : 0} fill={C.accentHi} opacity={p < 1 ? 1 : 0} />
                  {/* 흐르는 입자 — 점등 완료 후 선을 따라 반복 순환 */}
                  {flowDone &&
                    particles.map((offset, pi) => {
                      // frame 기반 0~1 순환 위치(2.4s 주기), 엣지/입자별 위상차
                      const flow = (((frame - wireBase) / s(2.4) + offset + i * 0.27) % 1 + 1) % 1;
                      const px = ax + (bx - ax) * flow;
                      const py = ay + (by - ay) * flow;
                      // 양 끝에서 페이드(중간이 가장 밝음) — 입자가 카드에 닿을 때 자연 소멸
                      const fade = Math.sin(flow * Math.PI);
                      return (
                        <circle
                          key={pi}
                          cx={px}
                          cy={py}
                          r={3}
                          fill={C.accentHi}
                          opacity={fade * 0.85}
                        />
                      );
                    })}
                </g>
              );
            })}
          </svg>

          {/* 카드들 — 절대 배치 */}
          {([
            ['customers', CUSTOMERS_COLS, 'unchanged'],
            ['products', PRODUCTS_COLS, 'unchanged'],
            ['order_items', ORDER_ITEMS_COLS, 'unchanged'],
            ['orders', ORDERS_COLS, 'modified'],
          ] as const).map(([key, cols, diff]) => {
            const l = LAYOUT[key as keyof typeof LAYOUT];
            return (
              <div key={key} style={{ position: 'absolute', left: l.x, top: l.y, width: l.w }}>
                <TableCard
                  table={key}
                  columns={cols as Col[]}
                  diff={diff}
                  glow={diff === 'modified' ? glow : 1}
                  width={l.w}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* 입력창 레이어 */}
      {barVisible && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `translateY(${barY}px) scale(${barScale})`,
            opacity: barOpacity,
          }}
        >
          <CommandBar
            text={typed}
            showCursor={frame >= typeStart && frame < s(4.4) && Math.floor(frame / 15) % 2 === 0}
            focus={focus}
            badge={badgeReveal > 0.05 ? { label: 'Detected: Natural Language', pct: 98 } : null}
            badgePop={badgePop}
            analyzing={analyzing}
            spinnerDeg={spinDeg}
            actionLabel={analyzing ? 'Analyzing…' : 'Analyze'}
            clickRipple={analyzeRipple}
            clickPress={analyzeClickPress}
          />
        </div>
      )}
    </div>
  );
};
