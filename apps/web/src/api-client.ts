import type { ApprovalRequest, ApprovalResult, ExecutionEvent } from "@screen-contract/api";
import { httpBase, type ServerTarget } from "./state/connection.js";

/**
 * Workflow Server の HTTP API を叩く。
 *
 * **web はドメインロジックを持たない。** すべての操作は api 経由で app 層の
 * use case を呼ぶ (context/architecture.md)。
 */

/** server が持つ run の状態。判定の正本は server 側にある。 */
export interface ViewportSnapshot {
  readonly runId: string;
  readonly status: "idle" | "paused" | "completed" | "failed";
  readonly mode: "view" | "operate";
  readonly recording: boolean;
  readonly events: readonly ExecutionEvent[];
  readonly entryUrl: string;
}

export interface ApiClient {
  viewport(): Promise<ViewportSnapshot>;
  startRun(): Promise<ViewportSnapshot>;
  resumeRun(): Promise<ViewportSnapshot>;
  setMode(mode: "view" | "operate"): Promise<ViewportSnapshot>;
  setRecording(recording: boolean): Promise<ViewportSnapshot>;
  listApprovals(): Promise<readonly ApprovalRequest[]>;
  approve(requestId: string): Promise<ApprovalResult>;
  loadDraft(key: string): Promise<string>;
  loadAuthoritative(key: string): Promise<string>;
}

export interface ApiClientOptions {
  readonly target: ServerTarget;
  readonly token: string;
  readonly fetch?: typeof globalThis.fetch | undefined;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const base = httpBase(options.target);
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function call(path: string, init?: RequestInit): Promise<Response> {
    // `headers` は配列や Headers も取りうる。spread すると添字の羅列になる。
    const headers = new Headers(init?.headers);
    // トークンはヘッダで渡す。URL の query に載せない。
    headers.set("authorization", `Bearer ${options.token}`);
    const response = await doFetch(`${base}${path}`, { ...init, headers });
    if (!response.ok && response.status !== 409 && response.status !== 404) {
      throw new Error(`Workflow Server が ${String(response.status)} を返しました`);
    }
    return response;
  }

  async function json(path: string, init?: RequestInit): Promise<ViewportSnapshot> {
    return (await (await call(path, init)).json()) as ViewportSnapshot;
  }

  function post(path: string, body?: unknown): Promise<ViewportSnapshot> {
    return json(path, {
      method: "POST",
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    });
  }

  return {
    viewport: () => json("/viewport"),
    startRun: () => post("/viewport/start"),
    resumeRun: () => post("/viewport/resume"),
    setMode: (mode) => post("/viewport/mode", { mode }),
    setRecording: (recording) => post("/viewport/recording", { recording }),

    async listApprovals(): Promise<readonly ApprovalRequest[]> {
      return (await (await call("/approvals")).json()) as readonly ApprovalRequest[];
    },
    async approve(requestId: string): Promise<ApprovalResult> {
      const response = await call(`/approvals/${encodeURIComponent(requestId)}/approve`, {
        method: "POST",
      });
      return (await response.json()) as ApprovalResult;
    },
    async loadDraft(key: string): Promise<string> {
      return (await call(`/drafts/${key}`)).text();
    },
    async loadAuthoritative(key: string): Promise<string> {
      return (await call(`/authoritative/${key}`)).text();
    },
  };
}
