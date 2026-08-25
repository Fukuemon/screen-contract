import type { ApprovalRequest, ApprovalResult, ExecutionEvent } from "@screen-contract/api";
import { httpBase, type ServerTarget } from "./connection.js";

/**
 * Workflow Server の HTTP API を叩く。
 *
 * **web はドメインロジックを持たない。** すべての操作は api 経由で app 層の
 * use case を呼ぶ (context/architecture.md)。
 */

export interface RecordedStepView {
  readonly action:
    | { readonly kind: "click"; readonly ref: string }
    | { readonly kind: "clickPoint"; readonly x: number; readonly y: number };
  readonly expect: readonly { readonly kind: string }[];
  readonly warning?: string | undefined;
}

interface ElementDefView {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly locator: { readonly role: string; readonly name: string };
}

/** server が持つ run の状態。**判定の正本は server 側にある。** */
export interface ViewportSnapshot {
  readonly runId: string;
  readonly status: "idle" | "paused" | "completed" | "failed";
  readonly mode: "view" | "operate";
  readonly recording: boolean;
  readonly events: readonly ExecutionEvent[];
  readonly entryUrl: string;
  readonly steps: readonly RecordedStepView[];
  readonly newElements: readonly ElementDefView[];
}

export interface PickedElementView {
  readonly locator: { readonly role: string; readonly name: string };
  readonly box: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly unique: boolean;
  readonly matches: number;
}

export interface ApiClient {
  viewport(): Promise<ViewportSnapshot>;
  startRun(): Promise<ViewportSnapshot>;
  resumeRun(): Promise<ViewportSnapshot>;
  setMode(mode: "view" | "operate"): Promise<ViewportSnapshot>;
  setRecording(recording: boolean): Promise<ViewportSnapshot>;
  navigate(url: string): Promise<ViewportSnapshot>;
  setViewport(size: { readonly width: number; readonly height: number }): Promise<ViewportSnapshot>;
  resolveAt(point: {
    readonly x: number;
    readonly y: number;
  }): Promise<PickedElementView | undefined>;
  allowedOrigins(): Promise<readonly string[]>;
  listAuthProfiles(): Promise<readonly string[]>;
  saveAuthProfile(name: string): Promise<readonly string[]>;
  useAuthProfile(name: string | undefined): Promise<void>;
  removeAuthProfile(name: string): Promise<readonly string[]>;
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
      // server が返す理由は列挙で、外部入力を反射しない。
      const detail = ((await response.json().catch(() => ({}))) as { error?: string }).error;
      throw new Error(
        `Workflow Server が ${String(response.status)} を返しました${detail === undefined ? "" : ` (${detail})`}`,
      );
    }
    return response;
  }

  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    return (await (await call(path, init)).json()) as T;
  }

  function post<T>(path: string, body?: unknown): Promise<T> {
    return json<T>(path, {
      method: "POST",
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    });
  }

  return {
    viewport: () => json<ViewportSnapshot>("/viewport"),
    startRun: () => post<ViewportSnapshot>("/viewport/start"),
    resumeRun: () => post<ViewportSnapshot>("/viewport/resume"),
    setMode: (mode) => post<ViewportSnapshot>("/viewport/mode", { mode }),
    setRecording: (recording) => post<ViewportSnapshot>("/viewport/recording", { recording }),
    navigate: (url) => post<ViewportSnapshot>("/viewport/navigate", { url }),
    setViewport: (size) => post<ViewportSnapshot>("/viewport/size", size),

    async resolveAt(point): Promise<PickedElementView | undefined> {
      const { picked } = await post<{ picked: PickedElementView | null }>(
        "/viewport/resolve",
        point,
      );
      return picked ?? undefined;
    },

    async allowedOrigins(): Promise<readonly string[]> {
      return (await json<{ origins: readonly string[] }>("/viewport/origins")).origins;
    },

    async listAuthProfiles(): Promise<readonly string[]> {
      return (await json<{ profiles: readonly string[] }>("/auth/profiles")).profiles;
    },

    async saveAuthProfile(name): Promise<readonly string[]> {
      return (await post<{ profiles: readonly string[] }>("/auth/profiles", { name })).profiles;
    },

    async useAuthProfile(name): Promise<void> {
      await post("/auth/use", { name: name ?? null });
    },

    async removeAuthProfile(name): Promise<readonly string[]> {
      return (
        await json<{ profiles: readonly string[] }>(`/auth/profiles/${encodeURIComponent(name)}`, {
          method: "DELETE",
        })
      ).profiles;
    },

    listApprovals: () => json<readonly ApprovalRequest[]>("/approvals"),
    approve: (requestId) =>
      post<ApprovalResult>(`/approvals/${encodeURIComponent(requestId)}/approve`),
    loadDraft: async (key) => (await call(`/drafts/${key}`)).text(),
    loadAuthoritative: async (key) => (await call(`/authoritative/${key}`)).text(),
  };
}
