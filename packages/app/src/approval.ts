import { randomUUID } from "node:crypto";
import { contentRevision, type Revision } from "./revision.js";
import type { AuthoritativeWriter, DraftStore, StoreKey } from "./store.js";

/**
 * 承認キュー。
 *
 * エージェントと AI 出力が書き込める範囲は draft までとし、正本への反映は
 * 人間の承認後にのみ行う (ADR-0017)。承認は draft を正本の置き場へ確定させる
 * 操作である。**正本へ書けるのはここだけである** (`AuthoritativeWriter` を
 * 受け取るのがこの use case に限られる)。
 */

export interface ApprovalRequest {
  readonly id: string;
  /** 対象の draft。UI が何を承認するのか示すために返す。 */
  readonly key: StoreKey;
  /** 依頼した時点の draft の内容ハッシュ。承認時に一致しなければ確定しない。 */
  readonly revision: Revision;
}

export type ApprovalResult =
  /** 確定した。draft の内容が正本の置き場へ書かれた。 */
  | { readonly kind: "approved"; readonly revision: Revision }
  /**
   * 承認待ちの間に draft が変わった。人間が見ていない差分のまま確定させない
   * (ADR-0017)。依頼は取り下げず、現在の内容で依頼し直させる。
   */
  | { readonly kind: "stale"; readonly requested: Revision; readonly current: Revision }
  /** 依頼が無い、または draft が消えている。 */
  | { readonly kind: "not-found" };

export interface ApprovalQueue {
  saveDraft(key: StoreKey, content: string): Promise<Revision>;
  requestApproval(key: StoreKey): Promise<ApprovalRequest>;
  approve(requestId: string): Promise<ApprovalResult>;
  listPendingApprovals(): readonly ApprovalRequest[];
}

/**
 * 承認待ちの上限。
 *
 * 依頼は外部入力で何度でも積める。上限が無いと、迂回を試みる側が保留中の
 * 一覧を膨らませ続けられる。
 */
const MAX_PENDING = 256;

export function createApprovalQueue(
  drafts: DraftStore,
  authoritative: AuthoritativeWriter,
): ApprovalQueue {
  // 承認キューは実行中の一時状態ではなく、承認待ちの一覧である。skeleton では
  // プロセス内に持つ。永続化は Baseline / 実行履歴の関心であり、ここではない。
  const pending = new Map<string, ApprovalRequest>();

  return {
    async saveDraft(key: StoreKey, content: string): Promise<Revision> {
      await drafts.saveDraft(key, content);
      return contentRevision(content);
    },

    async requestApproval(key: StoreKey): Promise<ApprovalRequest> {
      const content = await drafts.loadDraft(key);
      if (content === undefined) {
        throw new Error("承認を依頼する draft がありません");
      }
      // 同じ鍵の古い依頼を残さない。残すと、新しい内容を確定したあとに draft を
      // 古い内容へ戻して古い依頼を承認することで、正本を黙って巻き戻せる。
      for (const [id, request] of pending) {
        if (request.key === key) {
          pending.delete(id);
        }
      }
      if (pending.size >= MAX_PENDING) {
        throw new Error("承認待ちが多すぎます");
      }
      // ID を推測させない。連番だと、一覧を見られなくても総当たりで承認できる。
      const request: ApprovalRequest = {
        id: randomUUID(),
        key,
        revision: contentRevision(content),
      };
      pending.set(request.id, request);
      return request;
    },

    async approve(requestId: string): Promise<ApprovalResult> {
      const request = pending.get(requestId);
      if (request === undefined) {
        return { kind: "not-found" };
      }
      // 先に取り除く。await をまたぐ間に同じ依頼が二度承認されると、正本へ
      // 二度書いたうえで approved を二度返す。
      pending.delete(requestId);
      const content = await drafts.loadDraft(request.key);
      if (content === undefined) {
        return { kind: "not-found" };
      }
      const current = contentRevision(content);
      if (current !== request.revision) {
        // 依頼は取り下げない。現在の内容で依頼し直せるように戻す。
        pending.set(requestId, request);
        return { kind: "stale", requested: request.revision, current };
      }
      // 確定は正本の置き場へ書く操作である。draft は残す。承認後に draft を
      // 消すと、差し戻しからの再依頼で元の内容を辿れなくなる。
      await authoritative.commit(request.key, content);
      return { kind: "approved", revision: current };
    },

    listPendingApprovals(): readonly ApprovalRequest[] {
      return [...pending.values()];
    },
  };
}
