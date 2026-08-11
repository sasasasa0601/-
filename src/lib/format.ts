/** 1,500 のような桁区切り */
export function formatChips(value: number): string {
  return value.toLocaleString("ja-JP");
}

/** 増減を符号つきで。0 は "±0" */
export function formatSigned(value: number): string {
  if (value === 0) return "±0";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toLocaleString("ja-JP")}`;
}

/**
 * チップ数 → 円。chip_rate が 0 なら null(金額を表示しない)。
 * numeric 型は環境によって文字列で返ることがあるので、明示的に数値化する。
 */
export function toYen(chips: number, chipRate: number): number | null {
  const rate = Number(chipRate);
  if (!Number.isFinite(rate) || rate === 0) return null;
  return Math.round(chips * rate);
}

export function formatYen(value: number): string {
  return `${value < 0 ? "−" : ""}¥${Math.abs(value).toLocaleString("ja-JP")}`;
}

/** 2026/08/11 (火) 20:30 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} (${weekday}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> 用のローカル時刻文字列 */
export function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 入力文字列 → 整数。空文字は null。 */
export function parseIntOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
