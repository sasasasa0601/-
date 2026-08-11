"use client";

import { useState } from "react";
import { Button } from "./ui";

/**
 * 共有ボタン。
 * スマホでは OS の共有シート、対応していなければクリップボードにコピーする。
 */
export function ShareButton({
  url,
  title,
  className = "",
}: {
  url: string;
  title: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const absolute = url.startsWith("http")
      ? url
      : `${window.location.origin}${url}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, url: absolute });
        return;
      } catch {
        // ユーザーがキャンセルした場合もここに来る。コピーにフォールバックする。
      }
    }

    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("この URL を共有してください", absolute);
    }
  }

  return (
    <Button onClick={share} className={className} aria-label="このページを共有">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13M12 3 8 7m4-4 4 4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      </svg>
      {copied ? "コピーしました" : "共有"}
    </Button>
  );
}
