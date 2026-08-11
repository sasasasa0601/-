# Chip Ledger — ポーカーのチップ増減計算・記録アプリ

オフラインでテキサスホールデムを遊ぶときの、チップの増減計算・記録・共有をするスマホ向け Web アプリ。

- 初期チップと最終チップを入れるだけで、各プレイヤーの増減を自動計算
- 全員の増減が **プラマイゼロ** になっているかを常時バリデーション（ゼロでなければ確定できない）
- 試合の日時・参加者・増減結果を保存し、履歴と通算成績としていつでも参照可能
- **URL を送るだけ** で同席者が同じ画面を見られる。ログイン不要
- プレイ中の入力は他の端末へ**リアルタイム反映**

---

## 1. システム構成と技術スタック

| レイヤー | 採用 | 理由 |
| --- | --- | --- |
| フロントエンド | **Next.js 16 (App Router) + React 19 + TypeScript** | 画面数が少なくクライアント主導なので、静的配信 + クライアント取得で十分速い。Vercel へのデプロイが最短 |
| スタイル | **Tailwind CSS v4** | スマホ実機での微調整が多い。クラスが JSX に閉じるので調整が速い |
| DB / API / リアルタイム | **Supabase**（PostgreSQL + PostgREST + Realtime） | 「履歴保存」「URL 共有」「リアルタイム同期」が 1 サービスで揃う。**チップ計算の整合性を DB の制約とトリガーで守れる**のが Firebase より効く |
| ホスティング | **Vercel** | Next.js との相性。プレビュー環境が自動で立つ |

```
 スマホ (同席者の端末) ─┬─ Next.js (Vercel, 静的配信)
                        │
                        ├─ Supabase PostgREST ── PostgreSQL
                        │    (x-share-code ヘッダ + RLS)      ← 保存・取得
                        │
                        └─ Supabase Realtime (Broadcast)      ← 変更の合図
```

### 認証を置かない代わりの設計 — Capability URL

「URL を共有するだけで見られる」という要件は、裏を返すと **URL そのものが合鍵** ということです。
そこでログインは設けず、ルームごとに推測不可能な `share_code`（31 種の文字 × 12 桁 ≒ 59bit）を持たせ、
クライアントは全リクエストに `x-share-code` ヘッダを付けます。RLS がそのヘッダと行の `share_code` を突き合わせるので、

- コードを知っていれば：読める・書ける（同席者は全員 URL を持っている前提）
- コードを知らなければ：**anon キーを持っていても 1 行も見えない**（一覧すら取れない）

`supabase/tests/rls_and_balance.sql` でこの分離を実際に検証しています。

> 現金が絡む用途や、参加者を跨いだ改ざん防止が要るなら、Supabase Auth（マジックリンク）を足して
> ルームにメンバーシップを持たせるのが次のステップです。今回は「その場の仲間内」を前提に、
> 摩擦ゼロを優先しています。

### リアルタイムに Broadcast を使う理由

Postgres Changes（WAL 購読）は RLS を JWT で評価しますが、本設計の RLS は **HTTP ヘッダ**を見ます。
Realtime の文脈にヘッダは存在しないため、Postgres Changes では必ず fail-closed になります。
そこで「変更したよ」という合図だけを `room:{share_code}` チャンネルへ Broadcast し、
受け取った端末が自分の権限で読み直す方式にしています（`src/lib/useRoomChannel.ts`）。
チャンネル名が推測不可能なコードなので、同席者以外は覗けません。

---

## 2. データベース設計

`supabase/migrations/0001_init.sql` が完全な定義です。

```
rooms 1──n sessions 1──n session_players
  └──n players（名簿。入力候補として使う）
```

### `rooms` — ルーム（いつメンの単位。この URL を共有する）

| 列 | 型 | 説明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `share_code` | text UNIQUE | URL に載る合鍵。`^[0-9a-z]{8,32}$` |
| `name` | text | 例「金曜ポーカー」 |
| `chip_rate` | numeric(12,2) | 1 チップあたりの金額。`0` なら金額換算を表示しない |
| `created_at` | timestamptz | |

### `players` — ルームの常連名簿

| 列 | 型 | 説明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `room_id` | uuid FK → rooms | ON DELETE CASCADE |
| `name` | text | `UNIQUE (room_id, name)` |

### `sessions` — 1 試合

| 列 | 型 | 説明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `room_id` | uuid FK → rooms | ON DELETE CASCADE |
| `title` | text | 任意のメモ |
| `played_at` | timestamptz | **試合の日付と時間**（編集可） |
| `status` | text | `open`（入力中） / `closed`（確定済み） |
| `created_at` / `updated_at` | timestamptz | `updated_at` はトリガーで自動更新 |

### `session_players` — 試合の参加者とチップ

| 列 | 型 | 説明 |
| --- | --- | --- |
| `id` | uuid PK | |
| `session_id` | uuid FK → sessions | ON DELETE CASCADE |
| `player_id` | uuid FK → players | 名簿への参照（任意） |
| `name` | text | **スナップショット**。名簿の名前を後で変えても履歴は変わらない |
| `seat_no` | integer | 並び順 |
| `buy_in` | integer | 初期チップ（リバイ込みの合計） |
| `cash_out` | integer NULL | 終了時チップ。`NULL` は未入力 |
| `net` | integer GENERATED | **`cash_out - buy_in`**。DB が計算するのでクライアントとズレようがない |

チップ枚数を `numeric` ではなく `integer` にしているのは、丸め誤差で「プラマイゼロ」判定が揺れないようにするためです。

### 整合性を DB 側で守る

| 仕組み | 内容 |
| --- | --- |
| `net` 生成列 | 増減の計算式を DB に固定。アプリのバグで壊れない |
| `assert_session_balanced` トリガー | `status` を `closed` にするとき、**未入力ゼロ かつ 増減合計 = 0** でなければ拒否 |
| `block_closed_session_edit` トリガー | 確定済みの試合の結果は書き換え不可（「再編集」に戻せば可） |
| `room_standings` ビュー | 確定済みの試合だけを名前ごとに集計（通算成績） |

クライアント側でも同じ判定を `src/lib/calc.ts` で行い、ボタンを無効化して即座にフィードバックします。
UI は速さのため、DB は正しさのため、と役割を分けています。

---

## 3. UI / 画面構成

スマホ片手操作前提。最大幅 `max-w-md`、タップ領域は最低 44px、チップ入力欄は `inputMode="numeric"` でテンキーが出ます。

### `/` トップ

```
┌─────────────────────────┐
│ CHIP LEDGER             │
│ ポーカーの              │
│ チップ計算と記録        │
├─────────────────────────┤
│ ┌ ルームを作る ───────┐ │
│ │ [ルーム名        ]  │ │
│ │ [ 新しいルームを作る]│ │  ← 金色 = 主導線
│ └─────────────────────┘ │
│ 最近のルーム             │  ← localStorage のブックマーク
│  ・金曜ポーカー          │
│ ┌ コードで参加 ───────┐ │
│ │ [共有コード ] [参加] │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

### `/r/[code]` ルーム（履歴・通算成績）

```
┌─────────────────────────┐
│ ROOM                    │
│ 金曜ポーカー ✎    [共有] │  ← タップで名前を編集 / OS 共有シート
├─────────────────────────┤
│ [ ＋ 新しい試合をはじめる ]│
│                          │
│ 進行中                   │
│  ┌ 8/11 20:30  続きから ┐│
│  └──────────────────────┘│
│ ┌─ 履歴 ─┬─ 通算成績 ─┐  │  ← タブ切り替え
│ │2026/08/04 (火) 21:00 │  │
│ │ あきら         +2,300│  │  緑
│ │ ひかる         −1,100│  │  赤
│ │ かおる         −1,200│  │
│ └──────────────────────┘  │
│ 1 チップ = [ 10 ] 円      │
└─────────────────────────┘
```

### `/r/[code]/s/[id]` 試合（入力画面 — アプリの中心）

```
┌─────────────────────────┐
│ ← 試合の記録      [共有] │
│ [メモ            ]       │
│ [2026/08/11 20:30]       │  ← 日時は編集可
│ [初期チップを全員に][一括]│
│ ┌ プレイヤーカード ────┐ │
│ │ [あきら        ]  [×]│ │
│ │ 初期     最終    増減 │ │
│ │[1,000] [1,500]  +500 │ │  ← 増減はその場で再計算
│ │ ＋リバイ 1,000        │ │
│ └──────────────────────┘ │
│ ┌ ＋ プレイヤーを追加 ─┐ │  ← 要件の「＋」。破線で常に末尾
│ └──────────────────────┘ │
├═════════════════════════┤  ← ここから下は画面下に固定
│ ✓ プラマイゼロ。確定でき │
│   ます             ±0    │
│   初期合計 3,000         │
│   最終合計 3,000         │
│ [  この結果で確定する  ] │
└─────────────────────────┘
```

差分が出ているときは同じ位置が赤くなり、`チップが 300 枚 多すぎます` のように
**どちらに何枚ズレているか**を言い切ります。確定ボタンはゼロになるまで押せません。

確定後は入力欄がロックされ、代わりに「誰が誰にいくら渡すか」の**精算プラン**（`src/lib/calc.ts` の `settlements`）が出ます。

---

## 4. セットアップ

```bash
npm install

# 1) https://supabase.com/dashboard で無料プロジェクトを作成
# 2) SQL Editor で supabase/migrations/0001_init.sql を丸ごと実行
# 3) 接続情報を設定
cp .env.example .env.local
#    Project Settings > API の Project URL と anon public key を記入

npm run dev   # http://localhost:3000
```

Realtime を使う場合は、Supabase ダッシュボードの **Realtime** が有効（デフォルト有効）であることだけ確認してください。
Broadcast のみを使うのでテーブルの publication 設定は不要です。

### Vercel へのデプロイ

```bash
vercel
```

環境変数 `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を Vercel 側にも設定します。
どちらもブラウザに露出する公開値です。**`service_role` キーは絶対に置かないでください**（RLS を貫通します）。

---

## 5. 確認コマンド

```bash
npm run typecheck   # 型チェック
npm run lint        # ESLint (React Compiler ルール込み)
npm test            # 計算ロジックの単体テスト
npm run build       # 本番ビルド
```

DB 側の検証（RLS の分離と「プラマイゼロ」トリガー）は、ローカルの PostgreSQL に対して実行できます。

```bash
createuser anon && createuser authenticated
psql -v ON_ERROR_STOP=1 -f supabase/migrations/0001_init.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_and_balance.sql
```

---

## 6. ディレクトリ構成

```
src/
  app/
    page.tsx                        トップ
    r/[code]/page.tsx               ルーム（履歴・通算成績）
    r/[code]/s/[sessionId]/page.tsx 試合（入力）
    layout.tsx  globals.css
  components/
    screens/HomeScreen.tsx
    screens/RoomScreen.tsx
    screens/SessionScreen.tsx       ＋ボタン・楽観更新・確定処理
    PlayerCard.tsx                  参加者 1 人分の入力カード
    BalanceBar.tsx                  プラマイゼロのバリデーション表示
    ShareButton.tsx  ui.tsx  SetupNotice.tsx
  lib/
    calc.ts        増減・合計・精算プランの純粋関数（テスト対象）
    api.ts         Supabase へのデータアクセス
    supabase.ts    x-share-code ヘッダ付きクライアント
    useRoomChannel.ts  リアルタイム同期
    useAsyncData.ts    取得と再取得
    types.ts  format.ts  shareCode.ts  recentRooms.ts
supabase/
  migrations/0001_init.sql          スキーマ・トリガー・RLS
  tests/rls_and_balance.sql         DB 側の検証
```

---

## 7. 既知の割り切りと次の一手

- **URL を知る人は誰でも編集できる。** 仲間内前提の割り切りです。改ざん防止が要るなら Supabase Auth + メンバーシップテーブルへ。
- **リバイは `buy_in` への加算として記録し、個々の履歴は残していません。** 「何時に誰がいくら追加したか」まで残すなら `chip_events` テーブル（`type`, `amount`, `created_at`）を足すのが素直です。
- **同時編集の衝突解決は last-write-wins。** 同じプレイヤーの同じ欄を 2 人が同時に触ると後勝ちになります。実運用では 1 台が入力係になることが多いので、まずはこれで十分と判断しました。
