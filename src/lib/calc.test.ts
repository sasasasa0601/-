import { describe, expect, it } from "vitest";
import { netOf, settlements, summarize } from "./calc";

describe("netOf", () => {
  it("最終 - 初期 を返す", () => {
    expect(netOf({ buyIn: 1000, cashOut: 1500 })).toBe(500);
    expect(netOf({ buyIn: 1000, cashOut: 400 })).toBe(-600);
  });

  it("未入力なら null", () => {
    expect(netOf({ buyIn: 1000, cashOut: null })).toBeNull();
  });
});

describe("summarize", () => {
  it("プラマイゼロを検出する", () => {
    const s = summarize([
      { buyIn: 1000, cashOut: 1500 },
      { buyIn: 1000, cashOut: 900 },
      { buyIn: 1000, cashOut: 600 },
    ]);
    expect(s.totalBuyIn).toBe(3000);
    expect(s.totalCashOut).toBe(3000);
    expect(s.diff).toBe(0);
    expect(s.isBalanced).toBe(true);
  });

  it("チップが多いとき diff が正になる", () => {
    const s = summarize([
      { buyIn: 1000, cashOut: 1500 },
      { buyIn: 1000, cashOut: 800 },
    ]);
    expect(s.diff).toBe(300);
    expect(s.isBalanced).toBe(false);
  });

  it("チップが足りないとき diff が負になる", () => {
    const s = summarize([
      { buyIn: 1000, cashOut: 500 },
      { buyIn: 1000, cashOut: 1000 },
    ]);
    expect(s.diff).toBe(-500);
    expect(s.isBalanced).toBe(false);
  });

  it("未入力があるうちは balanced にならない", () => {
    const s = summarize([
      { buyIn: 1000, cashOut: 2000 },
      { buyIn: 1000, cashOut: null },
    ]);
    expect(s.missingCount).toBe(1);
    expect(s.isComplete).toBe(false);
    expect(s.isBalanced).toBe(false);
  });

  it("リバイでバイインが増えても整合する", () => {
    const s = summarize([
      { buyIn: 3000, cashOut: 0 }, // 1000 スタート + リバイ 2 回、全部溶かした
      { buyIn: 1000, cashOut: 4000 },
    ]);
    expect(s.diff).toBe(0);
    expect(s.isBalanced).toBe(true);
  });

  it("空の試合は balanced ではない", () => {
    expect(summarize([]).isBalanced).toBe(false);
  });
});

describe("settlements", () => {
  it("マイナスの人からプラスの人への送金に変換する", () => {
    const plan = settlements([
      { name: "A", net: 500 },
      { name: "B", net: -100 },
      { name: "C", net: -400 },
    ]);
    expect(plan).toEqual([
      { from: "C", to: "A", amount: 400 },
      { from: "B", to: "A", amount: 100 },
    ]);
  });

  it("全員の受払いが釣り合う", () => {
    const rows = [
      { name: "A", net: 1200 },
      { name: "B", net: -700 },
      { name: "C", net: 300 },
      { name: "D", net: -800 },
    ];
    const plan = settlements(rows);
    for (const row of rows) {
      const paid = plan
        .filter((p) => p.from === row.name)
        .reduce((a, p) => a + p.amount, 0);
      const received = plan
        .filter((p) => p.to === row.name)
        .reduce((a, p) => a + p.amount, 0);
      expect(received - paid).toBe(row.net);
    }
  });

  it("増減が全員ゼロなら送金なし", () => {
    expect(settlements([{ name: "A", net: 0 }, { name: "B", net: 0 }])).toEqual([]);
  });
});
