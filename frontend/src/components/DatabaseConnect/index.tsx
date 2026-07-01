'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  connectDatabase,
  testConnection,
  getLlmStatus,
  CURATED_MODELS,
  type ConnectionStatus,
  type LlmStatus,
} from '../../lib/api';
import { usePipelineStore } from '../../store/pipeline';
import LanguageToggle from '../LanguageToggle';
import AppBackdrop from '../AppBackdrop';
import ModelPicker from '../ModelSettings/ModelPicker';

// 온보딩 전체화면 게이트 — target DB 미연결 시 메인 진입 전 노출.
// 첫 화면은 2카드 허브(진입형): 왼쪽 Language model 카드 / 오른쪽 Database 카드.
// 카드를 누르면 전체화면이 해당 뷰로 전환된다(샘플 진입 경험). DB 연결 성공 시 onConnected.
//
// 교체 모달 재사용(onCancel 있음): 허브 없이 DB 폼만 곧장 노출(메인엔 TopBar Model이 별도).

interface Props {
  onConnected: (status: ConnectionStatus) => void;
  // 메인에서 교체 모달로 재사용할 때 닫기 버튼 노출. 최초 게이트에선 undefined.
  onCancel?: () => void;
}

const FIELD: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-2) var(--space-3)',
  background: 'var(--bg-input)',
  // border는 longhand로 — fieldStyle가 borderColor를 덮어쓰므로 shorthand와 섞이면 React 경고.
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'var(--border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
  fontSize: 'var(--font-size-md)',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
};

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--font-size-xs)',
  color: 'var(--text-secondary)',
  marginBottom: 6,
};

type View = 'hub' | 'db' | 'model';

export default function DatabaseConnect({ onConnected, onCancel }: Props) {
  const language = usePipelineStore((s) => s.language);
  const ko = language === 'ko';

  // 뷰 전환 — 교체 모달(onCancel)은 허브를 건너뛰고 곧장 DB 폼.
  const [view, setView] = useState<View>(onCancel ? 'db' : 'hub');

  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('5432');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [dbname, setDbname] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [tested, setTested] = useState(false);

  // 포커스 글로우용 — 현재 포커스된 입력 필드 키.
  const [focused, setFocused] = useState<string | null>(null);
  // Test Connection 진행 중 여부(shimmer 표시용).
  const [testing, setTesting] = useState(false);

  // 모델 선택 — 허브의 Model 카드는 현재 선택을 요약 표시한다.
  const [llm, setLlm] = useState<LlmStatus | null>(null);
  useEffect(() => {
    if (!onCancel) getLlmStatus().then(setLlm).catch(() => setLlm(null));
  }, [onCancel]);
  // 모델 뷰에서 허브로 돌아올 때마다 최신 선택을 다시 읽어 카드에 반영.
  useEffect(() => {
    if (view === 'hub' && !onCancel) getLlmStatus().then(setLlm).catch(() => {});
  }, [view, onCancel]);

  // 현재 선택 모델 표시용 — 큐레이션이면 tier 라벨, 아니면 태그 그대로, 없으면 None.
  const selectedTag = llm?.chatModel?.trim() ?? '';
  const selectedCurated = CURATED_MODELS.find((m) => m.tag === selectedTag);

  const req = () => ({ host, port: Number(port) || 5432, user, password, dbname });

  // 포커스 글로우 — 포커스된 입력에 accent border + 은은한 ring.
  const fieldStyle = (key: string): React.CSSProperties => {
    const on = focused === key;
    return {
      ...FIELD,
      borderColor: on ? 'var(--color-accent-border)' : 'var(--border)',
      // 포커스 글로우 — InputPanel과 동일 언어(4px accent-10 링 + 30px 색광 번짐).
      boxShadow: on ? '0 0 0 4px var(--color-accent-10), 0 0 30px -4px var(--color-accent)' : 'none',
      transition: 'border-color var(--transition-base), box-shadow var(--transition-base)',
    };
  };
  const focusProps = (key: string) => ({
    onFocus: () => setFocused(key),
    onBlur: () => setFocused((f) => (f === key ? null : f)),
  });

  async function handleTest() {
    setBusy(true);
    setTesting(true);
    setError(null);
    setWarnings([]);
    try {
      const res = await testConnection(req());
      if (res.success) {
        setTested(true);
        setWarnings(res.warnings);
      } else {
        setError(res.message);
        setTested(false);
      }
    } catch {
      setError(ko ? '연결 테스트에 실패했습니다. 백엔드가 실행 중인지 확인하세요.' : 'Connection test failed. Check that the backend is running.');
    } finally {
      setBusy(false);
      setTesting(false);
    }
  }

  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      const status = await connectDatabase(req());
      onConnected(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : (ko ? '연결에 실패했습니다.' : 'Failed to connect.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        overflowX: 'hidden',
        overflowY: 'auto',
        padding: 'var(--space-8) var(--space-4)',
      }}
    >
      {/* 공통 배경 — 전 화면 동일 후광. 연결 화면은 후광이 주역(lobby). */}
      <AppBackdrop stage="lobby" />

      {/* 언어 토글 — 시작화면엔 TopBar가 없으므로 우상단에 직접 배치. */}
      <div style={{ position: 'absolute', top: 'var(--space-4)', right: 'var(--space-4)', zIndex: 2 }}>
        <LanguageToggle />
      </div>

      {/* 브랜드 헤더는 허브에서만. 진입 뷰(db/model)는 자체 Back + 제목을 갖는다. */}
      {view === 'hub' && (
        <HubView
          ko={ko}
          selectedTag={selectedTag}
          selectedTier={selectedCurated?.tier ?? null}
          onPickDb={() => { setError(null); setView('db'); }}
          onPickModel={() => setView('model')}
        />
      )}

      {view === 'db' && (
        <EntryShell
          width={460}
          title={ko ? '데이터베이스 연결' : 'Connect a database'}
          subtitle={ko ? 'PostgreSQL 연결 정보를 입력하세요.' : 'Enter your PostgreSQL connection details.'}
          backLabel={onCancel ? (ko ? '취소' : 'Cancel') : (ko ? '뒤로' : 'Back')}
          onBack={onCancel ? onCancel : () => setView('hub')}
        >
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <div style={{ flex: 2 }}>
              <label style={LABEL}>Host</label>
              <input style={fieldStyle('host')} {...focusProps('host')} value={host} onChange={(e) => setHost(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={LABEL}>Port</label>
              <input style={fieldStyle('port')} {...focusProps('port')} value={port} onChange={(e) => setPort(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <label style={LABEL}>Database</label>
            <input style={fieldStyle('dbname')} {...focusProps('dbname')} value={dbname} onChange={(e) => setDbname(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <div style={{ flex: 1 }}>
              <label style={LABEL}>User</label>
              <input style={fieldStyle('user')} {...focusProps('user')} value={user} onChange={(e) => setUser(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={LABEL}>Password</label>
              <input
                style={fieldStyle('password')}
                {...focusProps('password')}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {/* SSRF 경고(차단 아님) */}
          {warnings.map((w) => (
            <p key={w} style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)' }}>
              {w}
            </p>
          ))}

          {/* 에러 배너 */}
          {error && (
            <div
              style={{
                marginTop: 'var(--space-3)',
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--color-error-bg)',
                border: '1px solid var(--color-error-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-error)',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
            {/* Secondary 버튼 — testing 중 accent shimmer 스윕(진행 피드백). */}
            <button
              onClick={handleTest}
              disabled={busy}
              style={{
                position: 'relative',
                overflow: 'hidden',
                flex: 1,
                padding: 'var(--space-2) var(--space-4)',
                background: testing
                  ? 'linear-gradient(100deg, transparent 30%, color-mix(in srgb, var(--color-accent) 28%, transparent) 50%, transparent 70%)'
                  : 'transparent',
                backgroundSize: testing ? '200% 100%' : undefined,
                animation: testing ? 'btn-shimmer 1.1s linear infinite' : undefined,
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: 'var(--font-size-md)',
                fontWeight: 600,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.5 : 1,
                transition: 'background var(--transition-base)',
              }}
            >
              {ko ? '연결 테스트' : 'Test Connection'}
            </button>
            {/* Primary 버튼 — accent 배경. Test 통과 시 풀 accent. */}
            <button
              onClick={handleConnect}
              disabled={busy}
              style={{
                flex: 1,
                padding: 'var(--space-2) var(--space-4)',
                background: tested ? 'var(--color-accent)' : 'var(--color-accent-20)',
                border: '1px solid var(--color-accent-border)',
                borderRadius: 'var(--radius-md)',
                color: tested ? 'var(--text-inverse)' : 'var(--text-primary)',
                fontSize: 'var(--font-size-md)',
                fontWeight: 600,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.5 : 1,
                transition: 'background var(--transition-base)',
              }}
            >
              {ko ? '연결' : 'Connect'}
            </button>
          </div>
        </EntryShell>
      )}

      {view === 'model' && (
        <EntryShell
          width={500}
          title={ko ? '자연어 모델' : 'Language model'}
          subtitle={
            ko
              ? '자연어를 SQL로 바꿀 때 쓰는 모델을 고르세요. SQL 직접 입력에는 필요하지 않습니다.'
              : 'Pick the model used to turn natural language into SQL. Not needed for direct SQL input.'
          }
          backLabel={ko ? '뒤로' : 'Back'}
          onBack={() => setView('hub')}
        >
          <ModelPicker onReady={setLlm} onDone={() => setView('hub')} />
        </EntryShell>
      )}
    </div>
  );
}

/* ─── 허브: 2카드 진입형 ──────────────────────────────────────────────── */

function HubView({
  ko,
  selectedTag,
  selectedTier,
  onPickDb,
  onPickModel,
}: {
  ko: boolean;
  selectedTag: string;
  selectedTier: string | null;
  onPickDb: () => void;
  onPickModel: () => void;
}) {
  // 모델 카드 부제 — 선택됨이면 tier·tag, None이면 미선택 안내.
  const modelSub =
    selectedTag === '' ? (
      <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {ko ? '모델 없음 . SQL 직접 입력만' : 'No model . direct SQL only'}
      </span>
    ) : (
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-accent-hover)', fontWeight: 600 }}>
          {selectedTier ?? (ko ? '선택됨' : 'Selected')}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
          {selectedTag}
        </span>
      </span>
    );

  return (
    <div style={{ position: 'relative', zIndex: 1, width: 720, maxWidth: '94vw' }}>
      {/* 브랜드 헤더 — 진입 stagger fade-up. 카드와는 넉넉히 떨어뜨려 메인 화면의 광활함을 잇는다. */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-12)' }}>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.34, 1.2, 0.64, 1] }}
          style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}
        >
          SQL<span style={{ color: 'var(--color-accent)' }}>PreShift</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.34, 1.2, 0.64, 1], delay: 0.08 }}
          style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)', lineHeight: 1.5 }}
        >
          {ko
            ? '실제 PostgreSQL 데이터베이스에 대해 스키마 변경을 미리 확인하세요. 배포 전에, 안전하게.'
            : 'Preview schema changes against a live PostgreSQL database. Safely, before they ship.'}
        </motion.p>
      </div>

      {/* 2카드 — 동일 디자인. 왼쪽 Model(보조), 오른쪽 Database(주). */}
      <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'stretch' }}>
        <EntryCard
          delay={0.16}
          eyebrow={ko ? '선택 . 자연어용' : 'Optional . for natural language'}
          title={ko ? '자연어 모델' : 'Language model'}
          subtitle={modelSub}
          action={selectedTag === '' ? (ko ? '모델 고르기' : 'Choose model') : (ko ? '변경' : 'Change')}
          onClick={onPickModel}
        />
        <EntryCard
          delay={0.24}
          primary
          eyebrow={ko ? '필수 . 시작점' : 'Required . to begin'}
          title={ko ? '데이터베이스' : 'Database'}
          subtitle={
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {ko ? 'PostgreSQL 연결 정보를 입력해 연결' : 'Connect with your PostgreSQL credentials'}
            </span>
          }
          action={ko ? '연결하기' : 'Connect'}
          onClick={onPickDb}
        />
      </div>
    </div>
  );
}

// 허브의 두 진입 카드 — 동일 구조/디자인. primary면 accent 톤을 살짝 더 입힌다.
function EntryCard({
  delay,
  eyebrow,
  title,
  subtitle,
  action,
  primary = false,
  onClick,
}: {
  delay: number;
  eyebrow: string;
  title: string;
  subtitle: React.ReactNode;
  action: string;
  primary?: boolean;
  onClick: () => void;
}) {
  // hover — 테두리만 밝게(border-strong + 미세 1px ring). accent 글로우·lift는 쓰지 않아
  // 모델 카드 hover와 동일 언어로 통일. accent는 '선택/주 카드'에만 남겨 위계를 또렷이.
  // (포커스 글로우는 입력 필드 전용 — 카드 호버에는 과함.)
  const hoverGlow = {
    borderColor: 'var(--border-strong)',
    boxShadow: '0 0 0 1px var(--border-strong), var(--shadow-float)',
  };
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ opacity: { duration: 0.3, delay }, y: { duration: 0.42, ease: [0.34, 1.2, 0.64, 1], delay } }}
      whileHover={hoverGlow}
      whileTap={{ scale: 0.995 }}
      className="glass-trim"
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        textAlign: 'left',
        // 카드 내부 여유(space-7 없음 → 28px 직접). 메인 화면의 호흡감 이식.
        padding: '28px',
        minHeight: 224,
        background: 'var(--bg-secondary)',
        // border는 longhand로 분리 — whileHover가 borderColor를 애니메이트하므로
        // shorthand `border`와 섞이면 React가 경고(shorthand/non-shorthand 충돌).
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: primary ? 'var(--color-accent-border)' : 'var(--border)',
        borderRadius: 'var(--radius-lg)',
        // 부유 카드 — shadow-float(메인 입력창과 동일 elevation).
        boxShadow: 'var(--shadow-float)',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* eyebrow — 위계 라벨(필수/선택). eyebrow↔제목 간격은 본문 블록 margin으로 준다. */}
      <span
        style={{
          fontSize: 'var(--font-size-xs)',
          fontWeight: 600,
          letterSpacing: '0.03em',
          // eyebrow는 양쪽 모두 text-secondary로 절제 — primary 구분은 카드 테두리·action accent가 담당
          // (가이드: 한 화면 accent 1~2곳). tertiary는 대비 부족이라 secondary.
          color: 'var(--text-secondary)',
        }}
      >
        {eyebrow}
      </span>

      {/* 제목 + 부제 — eyebrow와는 space-4(계층), 제목↔부제는 space-2(같은 묶음). flex:1로 위로 모음. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flex: 1, marginTop: 'var(--space-4)' }}>
        <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          {title}
        </span>
        {subtitle}
      </div>

      {/* action — 카드 진입 신호. 본문과 space-6 떨어뜨려 카드 바닥에 둠.
          accent는 주(primary) 카드에만 — 보조 카드는 text-secondary로 낮춰 색으로 위계를 준다
          (가이드: 한 화면 accent 1~2곳 절제). */}
      <span
        style={{
          marginTop: 'var(--space-6)',
          fontSize: 'var(--font-size-sm)',
          fontWeight: 600,
          color: primary ? 'var(--color-accent)' : 'var(--text-secondary)',
        }}
      >
        {action}
      </span>
    </motion.button>
  );
}

/* ─── 진입 뷰 셸 — Back+헤더+본문을 하나의 카드 안에 통합 ──────────────────────────────────────────────── */

// DB 폼·모델 선택 모두 동일 셸을 쓴다(hub 카드와 통일된 디자인).
// Back은 카드 좌상단 안쪽, 그 아래 제목/설명, 구분선, 본문 순으로 한 덩어리로 정돈한다.
function EntryShell({
  width,
  title,
  subtitle,
  backLabel,
  onBack,
  children,
}: {
  width: number;
  title: string;
  subtitle: string;
  backLabel: string;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      // opacity는 ease, 위치는 settle(메인 화면 진입 패턴과 동일한 곡선 분리).
      transition={{ opacity: { duration: 0.28 }, y: { duration: 0.42, ease: [0.34, 1.2, 0.64, 1] } }}
      className="glass-trim"
      style={{
        position: 'relative',
        zIndex: 1,
        width,
        maxWidth: '92vw',
        // 셸은 카드를 담는 컨테이너 — ERD 캔버스처럼 어두운 bg-primary로 내리고,
        // 그 안의 카드(모델 카드)는 bg-secondary로 올려 ERD 노드와 같은 elevation 위계.
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        // 부유 패널이므로 shadow-float(메인 입력창과 동일 elevation). 모달 아님.
        boxShadow: 'var(--shadow-float)',
        // 카드가 길어 화면이 짧으면 내부 스크롤(하단이 잘리지 않게).
        maxHeight: '84vh',
        overflowY: 'auto',
        // 패딩 넉넉히(space-7=28px 없음 → space-6). 헤더는 카드 안에 통합.
        padding: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        // 헤더 블록 ↔ 본문 블록은 독립 섹션 → space-6(가이드: 시각 분리 그룹).
        gap: 'var(--space-6)',
      }}
    >
      {/* 헤더 영역 — Back + 제목 + 설명. Back↔제목은 space-4, 제목↔설명은 space-2(계층 차등). */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {onBack && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <BackButton label={backLabel} onClick={onBack} />
          </div>
        )}
        <h2 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</h2>
        <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          {subtitle}
        </p>
      </div>

      {children}
    </motion.div>
  );
}

// Back — 카드 좌상단 안쪽의 절제된 텍스트 버튼(꺾쇠 글리프 금지이므로 라벨만).
function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        alignSelf: 'flex-start',
        padding: '4px 12px',
        background: hover ? 'var(--bg-hover)' : 'transparent',
        border: `1px solid ${hover ? 'var(--border-strong)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-pill)',
        color: hover ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'color 0.15s ease, border-color 0.15s ease, background 0.15s ease',
      }}
    >
      {label}
    </button>
  );
}
