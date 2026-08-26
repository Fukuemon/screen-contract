import type {
  BoundingBox,
  ObservedElement,
  SemanticLocator,
} from "@screen-contract/core-execution";
import { AgentBrowserError } from "./error.js";

/**
 * Chrome DevTools Protocol への直結。
 *
 * **CLI だけでは地の文を取れない** ([adr/0030](../../../adr/0030-cdp-for-observation.md))。
 * `snapshot` も `--annotate` も、要素参照を振るのは role と accessible name の
 * 両方を持つ要素だけである。`paragraph` は name を持たず、`StaticText` は
 * テキストノードで、どちらも参照を持たない。画面仕様書は説明文にも番号を振る
 * ため、これでは足りない。
 *
 * **観測にだけ使う。** 操作は CLI のままとし、CDP へ寄せない。
 */

/** box をまとめて引くときの同時実行数。1 件ずつ待つと要素数に比例して伸びる。 */
const BOX_CONCURRENCY = 32;

/** 要素として扱わない AX の role。中身を持たない入れ物と、文字の断片。 */
const IGNORED_ROLES = new Set(["none", "generic", "InlineTextBox", "RootWebArea"]);

/** 地の文の role。**操作の対象にしない** — Locator で探せる要素ではない。 */
const TEXT_ROLE = "StaticText";

interface AxNode {
  readonly nodeId: string;
  readonly parentId?: string;
  readonly backendDOMNodeId?: number;
  readonly role?: { readonly value?: unknown };
  readonly name?: { readonly value?: unknown };
}

export interface CdpClient {
  observe(): Promise<readonly ObservedElement[]>;
  /**
   * 可視な要素の Locator。**box を取らない。**
   *
   * 期待状態の候補づくりに要るのは「何が見えているか」だけである。box まで取ると
   * 要素数に比例して伸びる (実測で 1208 要素 585ms)。
   */
  observeNames(): Promise<readonly SemanticLocator[]>;
  /** 繋がったままか。閉じていれば繋ぎ直す。 */
  alive(): boolean;
  close(): void;
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * 描画された四辺形から box を作る。
 *
 * `getBoxModel` は 4 隅を順に並べた 8 要素で返す。**取れなければ見えていない** —
 * 表示されていない要素は box を持たない。
 */
function boxOf(value: unknown): BoundingBox | undefined {
  const model = (typeof value === "object" && value !== null ? value : {}) as {
    model?: { border?: unknown; width?: unknown; height?: unknown };
  };
  const border = model.model?.border;
  if (!Array.isArray(border) || border.length < 8) {
    return undefined;
  }
  const xs = [border[0], border[2], border[4], border[6]].filter(
    (n): n is number => typeof n === "number",
  );
  const ys = [border[1], border[3], border[5], border[7]].filter(
    (n): n is number => typeof n === "number",
  );
  if (xs.length !== 4 || ys.length !== 4) {
    return undefined;
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(...xs) - x;
  const height = Math.max(...ys) - y;
  // 面積が無いものは見えていない。枠も番号も置けない。
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}

/**
 * 観測の対象になるノードを選ぶ。
 *
 * **名前を持たない入れ物は落とす。** Locator は role と name で引くため、名前が
 * 無いと指せない。中の `StaticText` が文字を持っている。
 *
 * **親と同じ文字の `StaticText` も落とす。** ボタンのラベルは親のボタンとして
 * 既に数えており、両方出すと枠が二重に描かれる。
 */
export function selectNodes(nodes: readonly AxNode[]): readonly AxNode[] {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  return nodes.filter((node) => {
    const role = stringOf(node.role?.value);
    const name = stringOf(node.name?.value);
    if (node.backendDOMNodeId === undefined || role === "" || IGNORED_ROLES.has(role)) {
      return false;
    }
    if (name === "") {
      return false;
    }
    if (role !== TEXT_ROLE) {
      return true;
    }
    const parent = node.parentId === undefined ? undefined : byId.get(node.parentId);
    return stringOf(parent?.name?.value) !== name;
  });
}

export interface CdpClientOptions {
  /** 対象タブの CDP エンドポイント。 */
  readonly endpoint: string;
}

export async function connectCdp(options: CdpClientOptions): Promise<CdpClient> {
  const socket = new WebSocket(options.endpoint);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () =>
      reject(new AgentBrowserError("browser/unresponsive", "CDP へ接続できません")),
    );
  });

  let sequence = 0;
  const pending = new Map<number, (message: { result?: unknown }) => void>();
  socket.addEventListener("message", (event) => {
    const raw = (event as { data: unknown }).data;
    if (typeof raw !== "string") {
      return;
    }
    const message = JSON.parse(raw) as { id?: number; result?: unknown };
    if (message.id !== undefined) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });

  function send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve) => {
      const id = (sequence += 1);
      pending.set(id, (message) => resolve(message.result));
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  await send("DOM.enable");
  await send("Accessibility.enable");

  return {
    async observe(): Promise<readonly ObservedElement[]> {
      const tree = (await send("Accessibility.getFullAXTree")) as { nodes?: AxNode[] };
      const targets = selectNodes(tree.nodes ?? []);
      const observed: ObservedElement[] = [];
      // まとめて投げる。1 件ずつ待つと要素数に比例して線形に伸びる。
      for (let at = 0; at < targets.length; at += BOX_CONCURRENCY) {
        const chunk = targets.slice(at, at + BOX_CONCURRENCY);
        const boxes = await Promise.all(
          chunk.map((node) => send("DOM.getBoxModel", { backendNodeId: node.backendDOMNodeId })),
        );
        for (const [index, raw] of boxes.entries()) {
          const node = chunk[index];
          const box = boxOf(raw);
          if (node === undefined || box === undefined) {
            continue;
          }
          const role = stringOf(node.role?.value);
          observed.push({
            role,
            name: stringOf(node.name?.value),
            box,
            actionable: role !== TEXT_ROLE,
          });
        }
      }
      return observed;
    },

    async observeNames(): Promise<readonly SemanticLocator[]> {
      const tree = (await send("Accessibility.getFullAXTree")) as { nodes?: AxNode[] };
      return selectNodes(tree.nodes ?? []).map((node) => ({
        role: stringOf(node.role?.value),
        name: stringOf(node.name?.value),
      }));
    },

    alive: () => socket.readyState === WebSocket.OPEN,
    close: () => socket.close(),
  };
}

/**
 * ブラウザの endpoint から、対象タブの endpoint を引く。
 *
 * **タブを選ぶ。** ブラウザ側の endpoint へ繋いでも AX ツリーは取れない。
 * いま開いている URL と一致するものを選び、無ければ最初のページを使う —
 * 選べないまま失敗させると、URL の表記揺れだけで観測が止まる。
 */
export async function pageEndpoint(browserEndpoint: string, currentUrl: string): Promise<string> {
  const port = new URL(browserEndpoint).port;
  let targets: readonly {
    readonly type?: unknown;
    readonly url?: unknown;
    readonly webSocketDebuggerUrl?: unknown;
  }[];
  try {
    targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as never;
  } catch {
    throw new AgentBrowserError("browser/unresponsive", "CDP のタブ一覧を取得できません");
  }
  const pages = targets.filter(
    (target) => target.type === "page" && typeof target.webSocketDebuggerUrl === "string",
  );
  const matched = pages.find((target) => target.url === currentUrl) ?? pages[0];
  if (matched === undefined) {
    throw new AgentBrowserError("browser/unresponsive", "CDP で開いているタブが見つかりません");
  }
  return matched.webSocketDebuggerUrl as string;
}
