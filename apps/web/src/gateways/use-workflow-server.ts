import { useEffect, useState } from "react";
import { createWorkflowServerClient, type WorkflowServerClient } from "./workflow-server.js";
import { readEmbeddedToken, serverTargetOf } from "../lib/connection.js";

/**
 * Workflow Server のクライアント。
 *
 * 接続先は自分が配信された origin に固定する。選ばせると、ループバックの
 * 別ポート (実行基盤) を指定できてしまう (ADR-0008)。
 *
 * `location` と `document` は effect の中で読む。描画中に読むと、SSR や
 * prerender で `undefined` を触ることになる。
 */
export function useWorkflowServer(): {
  client: WorkflowServerClient | undefined;
  error: string | undefined;
} {
  const [state, setState] = useState<{ client?: WorkflowServerClient; error?: string }>({});

  useEffect(() => {
    try {
      setState({
        client: createWorkflowServerClient({
          target: serverTargetOf(globalThis.location.origin),
          token: readEmbeddedToken(globalThis.document),
        }),
      });
    } catch (cause) {
      setState({ error: (cause as Error).message });
    }
  }, []);

  return { client: state.client, error: state.error };
}
