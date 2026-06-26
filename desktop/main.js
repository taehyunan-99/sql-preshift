// SQLPreShift 데스크톱 셸(Electron 메인 프로세스).
// PyInstaller sidecar 바이너리를 spawn하고, stdout의 SQLPRESHIFT_PORT=n 을 파싱해
// 백엔드 포트를 알아낸 뒤 /health 200까지 기다렸다가 창을 로드한다.
// 정적 Next out/은 app:// custom protocol로 서빙한다(file:// 절대경로 문제 회피).

const { app, BrowserWindow, dialog, protocol, net } = require('electron');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const isDev = !app.isPackaged;

// app://는 표준 fetch/CSP가 적용되도록 권한을 부여(자산 로딩에 필요).
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let sidecar = null; // child_process 핸들 — 종료 시 kill용
let apiPort = 0;

// ─── sidecar 경로: dev는 빌드 산출물, packaged는 앱 리소스 ──────────────
function sidecarPath() {
  if (isDev) {
    return path.join(
      __dirname,
      '..',
      'backend',
      'dist',
      'sqlpreshift-backend',
      'sqlpreshift-backend',
    );
  }
  // extraResources로 Contents/Resources/backend/ 에 onedir 통째 복사됨(3d).
  return path.join(process.resourcesPath, 'backend', 'sqlpreshift-backend');
}

// ─── sidecar 기동 + 포트 파싱 + /health 게이트 ─────────────────────────
function startBackend() {
  return new Promise((resolve, reject) => {
    sidecar = spawn(sidecarPath(), [], { stdio: ['ignore', 'pipe', 'pipe'] });

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Backend did not report a port within 20s.'));
      }
    }, 20000);

    // stdout을 라인 단위로 — 청크 분절에도 SQLPRESHIFT_PORT=n 을 안전히 잡는다.
    const rl = readline.createInterface({ input: sidecar.stdout });
    rl.on('line', (line) => {
      const m = /^SQLPRESHIFT_PORT=(\d+)$/.exec(line.trim());
      if (m && !settled) {
        const port = Number(m[1]);
        // 포트 출력 != 소켓 open — /health 200까지 폴링한다.
        waitForHealth(port, 18000)
          .then(() => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              apiPort = port;
              resolve(port);
            }
          })
          .catch((err) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              reject(err);
            }
          });
      }
    });

    sidecar.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
    sidecar.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Backend exited early (code ${code}).`));
      }
    });
  });
}

function waitForHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/health', timeout: 1000 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else retry();
        },
      );
      req.on('error', retry);
      req.on('timeout', () => req.destroy());
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error('Backend health check timed out.'));
      else setTimeout(tick, 250);
    };
    tick();
  });
}

// ─── app:// 핸들러: 요청 경로를 out/ 파일로 매핑(SPA 폴백 포함) ─────────
function registerAppProtocol() {
  const outDir = isDev
    ? path.join(__dirname, '..', 'frontend', 'out')
    : path.join(process.resourcesPath, 'out'); // packaged: extraResources로 복사(asar 밖, 3d)
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    let filePath = path.join(outDir, rel);
    // 디렉토리/확장자 없는 라우트는 정적 index.html로 폴백(SPA).
    if (!path.extname(filePath)) filePath = path.join(outDir, 'index.html');
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#0e1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // 동적 포트를 쿼리로 전달 — preload가 읽어 renderer에 노출(3c).
  if (isDev) {
    win.loadURL(`http://localhost:3000/?apiPort=${port}`);
  } else {
    win.loadURL(`app://./index.html?apiPort=${port}`);
  }
}

// ─── 생명주기: 종료 시 sidecar 확실히 kill(좀비 방지) ──────────────────
function killSidecar() {
  if (!sidecar || sidecar.killed) return;
  sidecar.kill('SIGTERM');
  const proc = sidecar;
  setTimeout(() => {
    if (proc && !proc.killed) proc.kill('SIGKILL');
  }, 3000);
}

app.whenReady().then(async () => {
  registerAppProtocol();
  try {
    const port = await startBackend();
    createWindow(port);
  } catch (err) {
    dialog.showErrorBox('SQLPreShift', `Failed to start the backend.\n\n${err.message}`);
    app.exit(1);
  }
});

app.on('window-all-closed', () => {
  killSidecar();
  app.quit();
});
app.on('before-quit', killSidecar);
// 앱 크래시/강제 종료 시에도 동기 정리.
process.on('exit', () => {
  if (sidecar && !sidecar.killed) sidecar.kill('SIGKILL');
});
