// renderer에 백엔드 API base만 노출한다(최소 권한).
// main이 창 URL 쿼리(?apiPort=n)로 동적 포트를 넘기고, 여기서 읽어 노출한다.
const { contextBridge } = require('electron');

const params = new URLSearchParams(globalThis.location?.search || '');
const port = params.get('apiPort');
const apiBase = port ? `http://127.0.0.1:${port}` : null;

contextBridge.exposeInMainWorld('desktop', { apiBase });
