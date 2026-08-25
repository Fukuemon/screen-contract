/**
 * run のモードと、Stream Proxy が中継条件に使う状態。
 *
 * **app 側で定める。** 正本は run を保持している側であり、interface 層 (Stream
 * Proxy) はそれを読むだけである。逆向きに定めると、app が interface へ依存する
 * ことになる (context/architecture.md)。
 */

export type StreamMode = "view" | "operate";

/**
 * server が保持している run の状態。
 *
 * **client から渡させない。** 渡させると、client が `paused: true` を自称する
 * だけで中継条件が全通し、ADR-0008 が塞いだはずの迂回がそのまま再現する。
 */
export interface RunState {
  readonly runId: string;
  readonly paused: boolean;
  readonly mode: StreamMode;
}
