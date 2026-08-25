import type { ApprovalRequest, ApprovalResult } from "@screen-contract/api";
import { httpBase, type ServerTarget } from "./state/connection.js";

/**
 * Workflow Server の HTTP API を叩く。
 *
 * **web はドメインロジックを持たない。** すべての操作は api 経由で app 層の
 * use case を呼ぶ (context/architecture.md)。
 */

export interface ApiClient {
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

  return {
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
