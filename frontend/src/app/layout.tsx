import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "../styles/tokens.css";

// Calm Clarity 권장 sans 폰트. body className으로 적용해 토큰 기본값보다 우선.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SQLPreShift",
  description: "SQL 스키마 변경 안전 워크플로우",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className={jakarta.className}>{children}</body>
    </html>
  );
}
