import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** .env.local が未設定でもビルド/起動は通し、UI 側で案内を出すための判定 */
export const isSupabaseConfigured = Boolean(url && anonKey);

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
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-share-code": shareCode } },
  });

  clients.set(shareCode, client);
  return client;
}
