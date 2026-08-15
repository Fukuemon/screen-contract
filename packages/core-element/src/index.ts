import type { ElementId } from "@screen-contract/domain";

export interface ElementDef {
  readonly id: ElementId;
  readonly name: string;
}

/** 候補生成の Port。MVP では実装しない。推論はエージェント自身が行う (ADR-0019)。 */
export interface AiPort {
  suggestName(input: unknown): Promise<string>;
}
