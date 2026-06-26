import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 설치형: Electron이 정적 out/을 로드하므로 static export.
  // next build가 out/(index.html + _next/)를 생성한다(next export는 deprecated).
  // assetPrefix는 두지 않는다 — next/font가 상대경로를 거부하고, Electron은
  // app:// custom protocol 핸들러가 절대 /_next/ 경로를 out/로 매핑한다(3b).
  output: "export",
  // 개발 모드 우하단 'N' dev indicator 숨김 — 매 접속 시 노출되는 게 거슬려 제거.
  devIndicators: false,
};

export default nextConfig;
