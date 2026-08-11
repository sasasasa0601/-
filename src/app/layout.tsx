import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chip Ledger — ポーカーのチップ計算",
  description:
    "オフラインポーカーのチップ増減を計算して記録し、URL を共有するだけで仲間と結果を見られるアプリ。",
};

export const viewport: Viewport = {
  themeColor: "#05130e",
  width: "device-width",
  initialScale: 1,
  // 入力欄タップ時の自動ズームは許容しつつ、ピンチズームは残す
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        <div className="mx-auto min-h-dvh w-full max-w-md">{children}</div>
      </body>
    </html>
  );
}
