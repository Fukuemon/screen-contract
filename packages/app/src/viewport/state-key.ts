/**
 * 画面状態の代理鍵 (ADR-0029)。
 *
 * **記録中は DSL の state 名がまだ無い。** state 名は Screen 文書が確定して初めて
 * 決まり、記録はその文書を起こすための操作である。鍵が無いまま採番すると番号を
 * 1 本の列で持つことになり、別の画面へ移っても前の番号が残る。
 *
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
