/**
 * 画面状態の鍵。
 *
 * query と fragment を落とす。同じ画面を指す URL が別の状態として増えると、
 * 番号を振り直す先が分からなくなる。解釈できない URL はそのまま鍵にする —
 * 落とすと、番号が黙ってどこかの画面へ紛れ込む。
 */
export function stateKeyOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}
