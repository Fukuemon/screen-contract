import type { StartRunInput, UseCases } from "@screen-contract/app";

/**
 * MCP と App Server 型 JSON-RPC が共有する tool 語彙 (ADR-0016)。
 *
 * api と同じく use case を戻り値へ出さない。出すと認可の掛け所が無くなる (ADR-0021)。
 */
export interface AgentHandlers {
  startRun(input: StartRunInput): Promise<void>;
}

export function createAgentHandlers(useCases: UseCases): AgentHandlers {
  return {
    async startRun(input: StartRunInput): Promise<void> {
      // MCP は stdio のため認証情報を要求しない。ループバック側でトークンを
      // 付与するのは MCP ブリッジである (ADR-0021)。
      await useCases.startRun(input);
    },
  };
}
