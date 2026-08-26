import { describe, expect, it } from "vitest";
import {
  authoritativeWriterOf,
  createApprovalQueue,
  draftStoreOf,
  parseStoreKey,
  type ApprovalQueue,
  type StorePort,
  type StoreSpace,
} from "./index.js";
import { contentRevision } from "./revision.js";

const KEY = parseStoreKey("screens/login");
const OTHER = parseStoreKey("screens/settings");

type Spaces = Record<StoreSpace, Map<string, string>>;

/** Port の相手は fake を使う (context/testing.md)。置き場ごとに別の Map を持つ。 */
function fakeStore(): StorePort & { readonly spaces: Spaces } {
  const spaces: Spaces = { draft: new Map(), authoritative: new Map(), history: new Map() };
  return {
    spaces,
    save: (space, key, value) => {
      spaces[space].set(key, value);
      return Promise.resolve();
    },
    load: (space, key) => Promise.resolve(spaces[space].get(key)),
  };
}

/** 同じ store を draft 側と正本側の両方へ渡す。別々にすると承認が観測できない。 */
function setup(): { queue: ApprovalQueue; spaces: Spaces } {
  const store = fakeStore();
  return {
    queue: createApprovalQueue(draftStoreOf(store), authoritativeWriterOf(store)),
    spaces: store.spaces,
  };
}

describe("draft の保存", () => {
  it("draft の置き場だけに書き、正本を触らない", async () => {
    // エージェントと AI 出力が書き込める範囲は draft までである (ADR-0017)。
    const { queue, spaces } = setup();
    await queue.saveDraft(KEY, "内容");
    expect(spaces.draft.get(KEY)).toBe("内容");
    expect(spaces.authoritative.size).toBe(0);
  });

  it("内容が同じなら同じ revision になる", async () => {
    // 編集して元に戻した draft は stale にならない (ADR-0017)。
    const { queue } = setup();
    expect(await queue.saveDraft(KEY, "内容")).toBe(await queue.saveDraft(KEY, "内容"));
  });

  it("内容が違えば revision が変わる", async () => {
    const { queue } = setup();
    expect(await queue.saveDraft(KEY, "A")).not.toBe(await queue.saveDraft(KEY, "B"));
  });
});

describe("承認依頼", () => {
  it("依頼した時点の draft の revision を固定する", async () => {
    const { queue } = setup();
    await queue.saveDraft(KEY, "内容");
    const request = await queue.requestApproval(KEY);
    expect(request.revision).toBe(contentRevision("内容"));
    expect(request.key).toBe(KEY);
  });

  it("draft が無ければ依頼できない", async () => {
    await expect(setup().queue.requestApproval(KEY)).rejects.toThrow("draft がありません");
  });

  it("依頼 ID を推測できない形にする", async () => {
    // 連番だと、一覧を見られなくても総当たりで承認できる。
    const { queue } = setup();
    await queue.saveDraft(KEY, "A");
    await queue.saveDraft(OTHER, "B");
    const first = await queue.requestApproval(KEY);
    const second = await queue.requestApproval(OTHER);
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.id).not.toBe(first.id);
    expect(Number.parseInt(second.id, 16) - Number.parseInt(first.id, 16)).not.toBe(1);
  });

  it("承認待ちを一覧できる", async () => {
    const { queue } = setup();
    await queue.saveDraft(KEY, "A");
    await queue.saveDraft(OTHER, "B");
    await queue.requestApproval(KEY);
    await queue.requestApproval(OTHER);
    expect(queue.listPendingApprovals().map((r) => r.key)).toEqual([KEY, OTHER]);
  });

  it("同じ鍵の古い依頼を置き換える", async () => {
    // 残すと、新しい内容を確定したあとに draft を古い内容へ戻して古い依頼を
    // 承認することで、正本を黙って巻き戻せる。
    const { queue } = setup();
    await queue.saveDraft(KEY, "A");
    const old = await queue.requestApproval(KEY);
    await queue.saveDraft(KEY, "B");
    const fresh = await queue.requestApproval(KEY);
    expect(queue.listPendingApprovals().map((r) => r.id)).toEqual([fresh.id]);
    expect(await queue.approve(old.id)).toEqual({ kind: "not-found" });
  });

  it("依頼が非ブロッキングである (別の draft を続けて編集できる)", async () => {
    const { queue, spaces } = setup();
    await queue.saveDraft(KEY, "A");
    await queue.requestApproval(KEY);
    await queue.saveDraft(OTHER, "B");
    expect(spaces.draft.get(OTHER)).toBe("B");
  });
});

describe("承認", () => {
  it("draft を正本の置き場へ確定させる", async () => {
    const { queue, spaces } = setup();
    await queue.saveDraft(KEY, "内容");
    const request = await queue.requestApproval(KEY);
    expect(await queue.approve(request.id)).toEqual({
      kind: "approved",
      revision: contentRevision("内容"),
    });
    expect(spaces.authoritative.get(KEY)).toBe("内容");
  });

  it("確定しても draft を消さない", async () => {
    // 消すと、差し戻しからの再依頼で元の内容を辿れなくなる。
    const { queue, spaces } = setup();
    await queue.saveDraft(KEY, "内容");
    await queue.approve((await queue.requestApproval(KEY)).id);
    expect(spaces.draft.get(KEY)).toBe("内容");
  });

  it("承認待ちの間に編集されたら stale として確定しない", async () => {
    // 人間が見ていない差分のまま確定させない (ADR-0017)。
    const { queue, spaces } = setup();
    await queue.saveDraft(KEY, "依頼した内容");
    const request = await queue.requestApproval(KEY);
    await queue.saveDraft(KEY, "後から書き換えた内容");
    expect(await queue.approve(request.id)).toEqual({
      kind: "stale",
      requested: contentRevision("依頼した内容"),
      current: contentRevision("後から書き換えた内容"),
    });
    expect(spaces.authoritative.size).toBe(0);
  });

  it("stale でも依頼を取り下げない", async () => {
    const { queue } = setup();
    await queue.saveDraft(KEY, "A");
    const request = await queue.requestApproval(KEY);
    await queue.saveDraft(KEY, "B");
    await queue.approve(request.id);
    expect(queue.listPendingApprovals().map((r) => r.id)).toEqual([request.id]);
  });

  it("編集して元に戻した draft は stale にならない", async () => {
    // revision は内容ハッシュであり、カウンタではない (ADR-0017)。
    const { queue } = setup();
    await queue.saveDraft(KEY, "元の内容");
    const request = await queue.requestApproval(KEY);
    await queue.saveDraft(KEY, "途中の内容");
    await queue.saveDraft(KEY, "元の内容");
    expect((await queue.approve(request.id)).kind).toBe("approved");
  });

  it("確定した依頼は一覧から消える", async () => {
    const { queue } = setup();
    await queue.saveDraft(KEY, "内容");
    await queue.approve((await queue.requestApproval(KEY)).id);
    expect(queue.listPendingApprovals()).toEqual([]);
  });

  it("同じ依頼を二度確定させない", async () => {
    const { queue } = setup();
    await queue.saveDraft(KEY, "内容");
    const request = await queue.requestApproval(KEY);
    await queue.approve(request.id);
    expect(await queue.approve(request.id)).toEqual({ kind: "not-found" });
  });

  it("同じ依頼の並行確定で正本へ二度書かない", async () => {
    // pending からの取り出しを await より前に済ませる。
    let commits = 0;
    const store = fakeStore();
    const queue = createApprovalQueue(draftStoreOf(store), {
      commit: async (key, value) => {
        commits += 1;
        await store.save("authoritative", key, value);
      },
    });
    await queue.saveDraft(KEY, "内容");
    const request = await queue.requestApproval(KEY);
    const results = await Promise.all([queue.approve(request.id), queue.approve(request.id)]);
    expect(commits).toBe(1);
    expect(results.filter((r) => r.kind === "approved")).toHaveLength(1);
  });

  it("知らない依頼 ID を確定させない", async () => {
    expect(await setup().queue.approve("00000000-0000-0000-0000-000000000000")).toEqual({
      kind: "not-found",
    });
  });

  it("依頼した鍵の draft だけを確定させる", async () => {
    const { queue, spaces } = setup();
    await queue.saveDraft(KEY, "A");
    await queue.saveDraft(OTHER, "B");
    await queue.approve((await queue.requestApproval(KEY)).id);
    expect(spaces.authoritative.get(OTHER)).toBeUndefined();
  });

  it("承認キューが無制限に伸びない", async () => {
    // 依頼は外部入力で何度でも積める。
    const { queue } = setup();
    for (let i = 0; i < 256; i += 1) {
      const key = parseStoreKey(`screens/s${String(i)}`);
      await queue.saveDraft(key, "x");
      await queue.requestApproval(key);
    }
    await queue.saveDraft(parseStoreKey("screens/overflow"), "x");
    await expect(queue.requestApproval(parseStoreKey("screens/overflow"))).rejects.toThrow(
      "多すぎます",
    );
  });
});

describe("実行履歴と正本の分離", () => {
  it("正本へ書けるのは承認だけである", () => {
    // 型で示す。DraftStore は正本へ書く手段を持たない。
    const store = fakeStore();
    const drafts = draftStoreOf(store);
    expect(Object.keys(drafts).sort()).toEqual(["loadDraft", "saveDraft", "saveHistory"]);
  });

  it("履歴は正本とも draft とも別の置き場へ入る", async () => {
    const store = fakeStore();
    await draftStoreOf(store).saveHistory(KEY, "snapshot");
    expect(store.spaces.history.get(KEY)).toBe("snapshot");
    expect(store.spaces.authoritative.size).toBe(0);
    expect(store.spaces.draft.size).toBe(0);
  });
});

describe("contentRevision", () => {
  it("同じ内容から常に同じ値を返す", () => {
    expect(contentRevision("x")).toBe(contentRevision("x"));
  });

  it("1 文字違えば値が変わる", () => {
    expect(contentRevision("abc")).not.toBe(contentRevision("abd"));
  });

  it("並べ替えただけの内容も区別する", () => {
    expect(contentRevision("ab")).not.toBe(contentRevision("ba"));
  });

  it("暗号学的ハッシュの長さで返す", () => {
    // 承認ゲートの判定に使うため、衝突を作れる短さにしない (ADR-0017)。
    expect(contentRevision("")).toMatch(/^[0-9a-f]{64}$/);
    expect(contentRevision("長い内容".repeat(100))).toMatch(/^[0-9a-f]{64}$/);
  });

  it("SHA-256 の既知の値と一致する", () => {
    expect(contentRevision("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
