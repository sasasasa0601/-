import { Card } from "./ui";

/** 環境変数が無いときに、真っ白な画面ではなく手順を出す */
export function SetupNotice() {
  return (
    <main className="p-5">
      <Card className="space-y-4">
        <h1 className="text-lg font-bold">セットアップが必要です</h1>
        <p className="text-sm leading-relaxed text-ink-300">
          Supabase の接続情報が設定されていません。以下の手順で 5 分ほどで動きます。
        </p>
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
            API の URL と anon key を記入
          </li>
          <li>開発サーバーを再起動</li>
        </ol>
      </Card>
    </main>
  );
}
