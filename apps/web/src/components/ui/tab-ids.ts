/**
 * タブとパネルを結ぶ id。
 *
 * **部品と呼び出し側で同じものを引く。** 別々に組み立てると、`aria-controls` の
 * 指す先が存在しないパネルになる。
 */
export function tabId(id: string): string {
  return `tab-${id}`;
}

export function panelId(id: string): string {
  return `panel-${id}`;
}
