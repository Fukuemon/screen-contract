import { parseStartRunInput, type UseCases } from "@screen-contract/app";

/**
 * MCP と App Server 型 JSON-RPC が共有する tool 語彙 (ADR-0016)。
 *
 * api と同じく use case を戻り値へ出さない。出すと認可の掛け所が無くなる (ADR-0021)。
 */
export interface AgentHandlers {
  /** 受け取るのは検証前の JSON-RPC パラメータである。型を信用しない。 */
  startRun(raw: unknown): Promise<void>;
}

/**
 * エージェントへ渡す use case を**承認を含まない形に絞る**。
 *
 * `UseCases` をそのまま渡すと `approve` へ届き、「承認は人間の行為」という
 * ADR-0017 の性質が型で守られない。規約ではなく型で示す。
 */
export type AgentUseCases = Pick<UseCases, "startRun" | "saveDraft" | "requestApproval">;

export function createAgentHandlers(useCases: AgentUseCases): AgentHandlers {
  return {
    async startRun(raw: unknown): Promise<void> {
      // MCP は stdio のため認証情報を要求しない。ループバック側でトークンを
      // 付与するのは MCP ブリッジである (ADR-0021)。
      // 認可を通していても入力は信用しない。エージェントは任意の文字列を送れる。
      await useCases.startRun(parseStartRunInput(raw));
    },
  };
}
