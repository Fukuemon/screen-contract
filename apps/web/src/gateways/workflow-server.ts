import type { ApprovalRequest, ApprovalResult } from "@screen-contract/api";
import { parseSnapshot, type ElementDefView, type ViewportSnapshot } from "../entities/snapshot.js";
import { httpBase, type ServerTarget } from "../lib/connection.js";

/**
 * Workflow Server の HTTP API を叩く。
 *
 * **web はドメインロジックを持たない。** すべての操作は api 経由で app 層の
 * use case を呼ぶ (context/architecture.md)。
 */

export interface ObservedElementView {
  readonly role: string;
  readonly name: string;
  readonly box: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
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

export interface WorkflowServerClient {
  viewport(): Promise<ViewportSnapshot>;
  /**
   * run を起こす。
   *
   * @param url - 開く先。省略すると列挙の先頭 (entry) を開く。
   */
  startRun(url?: string): Promise<ViewportSnapshot>;
  /**
   * run を未開始へ戻す。
   *
   * 操作モードと記録は `paused` の run の枠内でしか使えない (ADR-0002)。run を
   * 終端まで走らせると `paused` を離れるため、**戻る経路をここが持つ**。
   */
  stopRun(): Promise<ViewportSnapshot>;
  setMode(mode: "view" | "operate"): Promise<ViewportSnapshot>;
  setRecording(recording: boolean): Promise<ViewportSnapshot>;
  navigate(url: string): Promise<ViewportSnapshot>;
  setViewport(size: { readonly width: number; readonly height: number }): Promise<ViewportSnapshot>;
  resolveAt(point: {
    readonly x: number;
    readonly y: number;
  }): Promise<PickedElementView | undefined>;
  observeElements(): Promise<readonly ObservedElementView[]>;
  consoleMessages(): Promise<
    readonly { readonly id: string; readonly level: string; readonly text: string }[]
  >;
  addBadge(locator: { readonly role: string; readonly name: string }): Promise<ViewportSnapshot>;
  removeBadge(id: ElementDefView["id"]): Promise<ViewportSnapshot>;
  moveBadge(id: ElementDefView["id"], to: number): Promise<ViewportSnapshot>;
  allowedOrigins(): Promise<readonly string[]>;
  addAllowedOrigin(origin: string): Promise<readonly string[]>;
  listAuthProfiles(): Promise<readonly string[]>;
  saveAuthProfile(name: string): Promise<readonly string[]>;
  useAuthProfile(name: string | undefined): Promise<void>;
  removeAuthProfile(name: string): Promise<readonly string[]>;
  listApprovals(): Promise<readonly ApprovalRequest[]>;
  approve(requestId: string): Promise<ApprovalResult>;
  loadDraft(key: string): Promise<string>;
  loadAuthoritative(key: string): Promise<string>;
}

export interface WorkflowServerClientOptions {
  readonly target: ServerTarget;
  readonly token: string;
  readonly fetch?: typeof globalThis.fetch | undefined;
}

export function createWorkflowServerClient(
  options: WorkflowServerClientOptions,
): WorkflowServerClient {
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

  async function snapshot(path: string, init?: RequestInit): Promise<ViewportSnapshot> {
    return parseSnapshot(await json<unknown>(path, init));
  }

  function postSnapshot(path: string, body?: unknown): Promise<ViewportSnapshot> {
    return snapshot(path, {
      method: "POST",
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    });
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
    viewport: () => snapshot("/viewport"),
    startRun: (url) => postSnapshot("/viewport/start", url === undefined ? {} : { url }),
    stopRun: () => postSnapshot("/viewport/stop"),
    setMode: (mode) => postSnapshot("/viewport/mode", { mode }),
    setRecording: (recording) => postSnapshot("/viewport/recording", { recording }),
    navigate: (url) => postSnapshot("/viewport/navigate", { url }),
    setViewport: (size) => postSnapshot("/viewport/size", size),

    async resolveAt(point): Promise<PickedElementView | undefined> {
      const { picked } = await post<{ picked: PickedElementView | null }>(
        "/viewport/resolve",
        point,
      );
      return picked ?? undefined;
    },

    async observeElements(): Promise<readonly ObservedElementView[]> {
      return (await json<{ elements: readonly ObservedElementView[] }>("/viewport/elements"))
        .elements;
    },

    async consoleMessages() {
      const { messages } = await json<{
        messages: readonly { level?: string; text?: string }[];
      }>("/viewport/console");
      return messages.map((message, index) => ({
        id: `console-${String(index)}`,
        level: message.level ?? "log",
        text: message.text ?? "",
      }));
    },

    addBadge: (locator) => postSnapshot("/viewport/badges", locator),
    removeBadge: (id) =>
      snapshot(`/viewport/badges/${encodeURIComponent(id)}`, { method: "DELETE" }),
    moveBadge: (id, to) => postSnapshot(`/viewport/badges/${encodeURIComponent(id)}/move`, { to }),

    async allowedOrigins(): Promise<readonly string[]> {
      return (await json<{ origins: readonly string[] }>("/viewport/origins")).origins;
    },

    async addAllowedOrigin(origin): Promise<readonly string[]> {
      return (await post<{ origins: readonly string[] }>("/viewport/origins", { origin })).origins;
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

export type { ElementDefView, RecordedStepView, ViewportSnapshot } from "../entities/snapshot.js";
