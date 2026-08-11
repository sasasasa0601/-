/**
 * ルームの共有コード生成。
 * URL に載る「合鍵」なので、推測されない長さ・エントロピーが必要。
 *
 * 英小文字 + 数字のうち紛らわしい文字 (0/o, 1/l/i) を除いた 31 種 × 12 文字
 *   => 約 31^12 ≒ 7.9 * 10^17 通り (約 59 bit)
 * 総当たりは現実的でない。
 */
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const LENGTH = 12;

export function generateShareCode(): string {
  const bytes = new Uint8Array(LENGTH);
  crypto.getRandomValues(bytes);

  let code = "";
  for (const byte of bytes) {
    // 256 は 31 の倍数ではないので厳密には偏るが、最大でも 0.4% 程度で実用上問題ない
    code += ALPHABET[byte % ALPHABET.length];
  }
  return code;
}

/** DB 側の CHECK 制約 '^[0-9a-z]{8,32}$' と揃えた検証 */
export function isValidShareCode(code: string): boolean {
  return /^[0-9a-z]{8,32}$/.test(code);
}
