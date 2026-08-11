import type { ConfigProblem } from "@/lib/supabase";
import { Card } from "./ui";

const HEADLINE: Record<NonNullable<ConfigProblem>, string> = {
  missing: "セットアップが必要です",
  placeholder: ".env.local がサンプルのままです",
  "invalid-url": "接続先 URL の形式が正しくありません",
};

const DETAIL: Record<NonNullable<ConfigProblem>, string> = {
  missing: "Supabase の接続情報が設定されていません。以下の手順で 5 分ほどで動きます。",
  placeholder:
    ".env.example の値をコピーしたまま、実際のプロジェクトの値に置き換えていないようです。この状態で操作すると「Failed to fetch」になります。",
  "invalid-url":
    "NEXT_PUBLIC_SUPABASE_URL は https://<プロジェクトref>.supabase.co の形で指定してください。",
};

/** 環境変数が無い / サンプルのままのときに、真っ白な画面ではなく手順を出す */
export function SetupNotice({ problem }: { problem: ConfigProblem }) {
  const key = problem ?? "missing";

  return (
    <main className="p-5">
      <Card className="space-y-4">
        <h1 className="text-lg font-bold">{HEADLINE[key]}</h1>
        <p className="text-sm leading-relaxed text-ink-300">{DETAIL[key]}</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink-300">
          <li>
            <a
              className="text-chip-gold underline"
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
            >
              Supabase
            </a>
            で無料プロジェクトを作成
          </li>
          <li>
            SQL Editor で <code className="text-ink-50">supabase/migrations/0001_init.sql</code>{" "}
            を実行
          </li>
          <li>
            <code className="text-ink-50">.env.example</code> を{" "}
            <code className="text-ink-50">.env.local</code> にコピーし、Project Settings &gt;
            API の <b className="text-ink-50">Project URL</b> と{" "}
            <b className="text-ink-50">anon public</b> キーを貼り付ける
          </li>
          <li>
            開発サーバーを<b className="text-ink-50">再起動</b>する（
            <code className="text-ink-50">NEXT_PUBLIC_</code> はビルド時に埋め込まれるため）
          </li>
        </ol>
      </Card>
    </main>
  );
}
