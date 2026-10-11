import type { ElementDef } from "@screen-contract/core-element";

/** core 同士は型の参照のみ許可される (context/codebase.md の Dependency Rules)。ここは import type で守る。 */
export function renderTable(elements: readonly ElementDef[]): string {
  return elements.map((element) => element.name).join("\n");
}
