import {
  readRuntimeFile,
  removeRuntimeFile,
  writeRuntimeFile,
  type RuntimeFile,
} from "./runtime-file.js";

/**
 * 接続先ファイルの寿命をプロセスに結びつける。
 *
 * **listen の後に書く。** ポートは OS に割り当てさせるため、待受アドレスが
 * 決まらないと書けない。
 *
 * **`exit` だけでは足りない。** 既定のシグナル終了では `exit` が発火しない
 * ため、`SIGINT` と `SIGTERM` も拾う。残ると、次に起動した利用者が死んだ
 * プロセスのトークンとポートへ繋ぎに行く。
 */

export type LifecycleEvent = "exit" | "SIGINT" | "SIGTERM";

/** プロセスを直接触らず、注入できる形にする (テストで実プロセスを殺さない)。 */
export interface LifecycleHost {
  readonly pid: number;
  on(event: LifecycleEvent, listener: () => void): void;
  off(event: LifecycleEvent, listener: () => void): void;
  kill(pid: number, signal: LifecycleEvent): void;
}

export interface RuntimeLifecycle {
  /** 明示的な後始末。二度呼んでも安全である。 */
  stop(): void;
}

const SIGNALS: readonly LifecycleEvent[] = ["SIGINT", "SIGTERM"];

export function startRuntimeFile(
  stateDir: string,
  value: Omit<RuntimeFile, "pid">,
  host: LifecycleHost,
): RuntimeLifecycle {
  const unsubscribes: (() => void)[] = [];
  let stopped = false;

  function stop(): void {
    if (stopped) {
      return;
    }
    stopped = true;
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
    // **自分が書いたファイルだけを消す。** 無条件に消すと、二重起動が競り合った
    // ときに先に終了した側が、生きているサーバの接続先を消してしまう。
    if (readRuntimeFile(stateDir)?.pid === host.pid) {
      removeRuntimeFile(stateDir);
    }
  }

  function listen(event: LifecycleEvent, listener: () => void): void {
    host.on(event, listener);
    unsubscribes.push(() => host.off(event, listener));
  }

  listen("exit", stop);
  for (const signal of SIGNALS) {
    listen(signal, () => {
      stop();
      // 削除したあと既定の動作 (終了) を自分で起こす。ハンドラを付けた時点で
      // 既定が無効になるため、付けたまま何もしないと終われない。
      host.kill(host.pid, signal);
    });
  }

  // **登録してから書く。** 書き込み中にシグナルを受けると既定終了になり、
  // トークンを含む一時ファイルが残る。
  writeRuntimeFile(stateDir, { ...value, pid: host.pid });

  return { stop };
}

/** 実プロセスを相手にする既定の host。 */
export const processLifecycleHost: LifecycleHost = {
  pid: process.pid,
  on: (event, listener) => void process.on(event, listener),
  off: (event, listener) => void process.off(event, listener),
  kill: (pid, signal) => void process.kill(pid, signal),
};
