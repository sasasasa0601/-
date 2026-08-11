/**
 * チップ計算ロジック(純粋関数)。
 * UI にも DB にも依存しないので、そのまま単体テストできる。
 */

export type ChipRow = {
  /** 初期チップ(リバイ・追加バイイン込みの合計) */
  buyIn: number;
  /** 終了時チップ。未入力は null */
  cashOut: number | null;
};

export type SessionSummary = {
  /** 場に出たチップの総数 */
  totalBuyIn: number;
  /** 回収されたチップの総数(未入力は 0 扱い) */
  totalCashOut: number;
  /**
   * 差分 = totalCashOut - totalBuyIn
   *  0  : プラマイゼロ。正しい
   *  +N : チップが N 枚多い(誰かの最終チップが多すぎる / 初期の申告漏れ)
   *  -N : チップが N 枚足りない
   */
  diff: number;
  /** 最終チップが未入力の人数 */
  missingCount: number;
  /** 全員入力済み かつ diff === 0 */
  isBalanced: boolean;
  /** 全員が最終チップを入力済みか */
  isComplete: boolean;
};

/** 1 人分の増減。未入力なら null。 */
export function netOf(row: ChipRow): number | null {
  return row.cashOut === null ? null : row.cashOut - row.buyIn;
}

/** 試合全体を集計し、プラマイゼロかどうかを判定する。 */
export function summarize(rows: readonly ChipRow[]): SessionSummary {
  let totalBuyIn = 0;
  let totalCashOut = 0;
  let missingCount = 0;

  for (const row of rows) {
    totalBuyIn += row.buyIn;
    if (row.cashOut === null) {
      missingCount += 1;
    } else {
      totalCashOut += row.cashOut;
    }
  }

  const diff = totalCashOut - totalBuyIn;
  const isComplete = rows.length > 0 && missingCount === 0;

  return {
    totalBuyIn,
    totalCashOut,
    diff,
    missingCount,
    isComplete,
    isBalanced: isComplete && diff === 0,
  };
}

/**
 * 精算プラン: 「誰が誰にいくら渡すか」を最小回数に近い形で求める。
 * マイナスの人を小さい順、プラスの人を大きい順に貪欲にマッチングする。
 * (最適解は NP 困難だが、実用上この貪欲法で送金回数は十分少なくなる)
 */
export type Settlement = { from: string; to: string; amount: number };

export function settlements(
  rows: readonly { name: string; net: number | null }[],
): Settlement[] {
  const debtors = rows
    .filter((r) => (r.net ?? 0) < 0)
    .map((r) => ({ name: r.name, left: -(r.net as number) }))
    .sort((a, b) => b.left - a.left);
  const creditors = rows
    .filter((r) => (r.net ?? 0) > 0)
    .map((r) => ({ name: r.name, left: r.net as number }))
    .sort((a, b) => b.left - a.left);

  const result: Settlement[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].left, creditors[j].left);
    if (amount > 0) {
      result.push({ from: debtors[i].name, to: creditors[j].name, amount });
      debtors[i].left -= amount;
      creditors[j].left -= amount;
    }
    if (debtors[i].left === 0) i += 1;
    if (creditors[j].left === 0) j += 1;
  }

  return result;
}
