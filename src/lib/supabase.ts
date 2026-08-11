import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

export type ConfigProblem =
  /** .env.local が無い / 変数が空 */
  | "missing"
  /** .env.example のプレースホルダのまま */
  | "placeholder"
  /** URL の形になっていない */
  | "invalid-url"
  | null;

function detectProblem(): ConfigProblem {
  if (!url || !anonKey) return "missing";

  // プレースホルダのままだと実在しないホストへ投げてしまい、
  // ブラウザには "TypeError: Failed to fetch" としか出ない。
  // 原因が非常に分かりにくいので、通信する前に弾く。
  if (/^https:\/\/x+\.supabase\.co\/?$/i.test(url)) return "placeholder";
  if (anonKey.includes("...") || anonKey.length < 40) return "placeholder";

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "invalid-url";
    }
  } catch {
    return "invalid-url";
  }

  return null;
}

export const configProblem = detectProblem();

/** .env.local が未設定でもビルド/起動は通し、UI 側で案内を出すための判定 */
export const isSupabaseConfigured = configProblem === null;

const clients = new Map<string, SupabaseClient>();

/**
 * ルームの share_code をヘッダに固定した Supabase クライアントを返す。
 * この x-share-code を RLS ポリシーが検証するので、
 * コードを知らないルームのデータは 1 行も取得できない。
 */
export function getRoomClient(shareCode: string): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase の環境変数が未設定です。.env.example を参考に .env.local を作成してください。",
    );
  }

  const cached = clients.get(shareCode);
  if (cached) return cached;

  const client = createClient(url, anonKey, {
    auth: {
      // このアプリは Supabase Auth を使わない(合鍵は URL の share_code)。
      // storageKey をクライアントごとに分けておかないと、
      // 「Multiple GoTrueClient instances detected」の警告が出る。
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `poker-ledger-${shareCode}`,
    },
    global: { headers: { "x-share-code": shareCode } },
  });

  clients.set(shareCode, client);
  return client;
}
