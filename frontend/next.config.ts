import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 개발 모드 우하단 'N' dev indicator 숨김 — 매 접속 시 노출되는 게 거슬려 제거.
  devIndicators: false,
};

export default nextConfig;
