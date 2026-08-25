import { createElementIdRegistry } from "@screen-contract/core-element";
import type { ElementDef, ObservedElement, SemanticLocator } from "@screen-contract/core-element";
import type { PageInput } from "@screen-contract/core-execution";
import type { RunState, StreamMode } from "./run-state.js";
import {
  startRecording,
  type RecordedObservation,
  type RecordedStep,
  type RecordingSession,
} from "../recording.js";
import { ConflictError } from "../errors.js";
import { stateKeyOf } from "./state-key.js";
import type { ElementId } from "@screen-contract/domain";
import type {
  BrowserAction,
  ExecutionEvent,
  Observation,
  StepRunner,
} from "@screen-contract/core-execution";
import { runSteps } from "@screen-contract/core-execution";
import type { Action, ExecutionStep } from "@screen-contract/core-workflow";

/**
 * run の保持。
 *
 * **操作モードと記録は `paused` の run の枠内でしか使えない** (ADR-0002 /
 * ADR-0008 / ADR-0026)。したがって「接続」で run を 1 本起こし、pause 予約を
 * 付けて走らせる。1 ステップ (entry への `open`) を終えた時点で `paused` に
 * 入り、そこから操作と記録ができる。
 *
 * **pause の意味論は変えない。** 「実行中ステップの完了後に停止する」ままである。
 */

/**
 * run の写し。**HTTP の応答そのものである。**
 *
 * **形を app が定める。** interface 層 (api / web) がそれぞれ手で写すと、ずれても
 * 型検査が鳴らない。実際に、項目が 1 つ欠けただけで画面が落ちた。
 */
export interface ViewportSnapshot {
  readonly runId: string;
  readonly status: "idle" | "paused" | "completed" | "failed";
  readonly mode: StreamMode;
  readonly recording: boolean;
  readonly events: readonly ExecutionEvent[];
  readonly entryUrl: string;
  /** 構成番号が属する画面状態。**番号は画面ごとに別である。** */
  readonly stateUrl: string;
  /** 記録した手順。承認へ回す draft の中身になる。 */
  readonly steps: readonly (RecordedStep & { readonly id: string })[];
  readonly newElements: readonly ElementDef[];
  /**
   * いま居る画面状態の構成番号。**リストの位置がそのまま番号になる** (ADR-0005)。
   *
   * 要素定義は番号を持たない。並びを変えれば番号が変わる。
   */
  readonly badges: readonly ElementId[];
  /**
   * 利用者へ出す注意書き。
   *
   * 認証状態の一部が入らなかった場合などに入る。**黙って進まない** (ADR-0022)。
   */
  readonly warnings: readonly string[];
}

/**
 * 操作の反映を待つ回数と間隔。
 *
 * 転送した直後の画面はまだ変わっていない。変わるまで見ないと、期待状態の候補が
 * 常に空になり、冪等スキップが効かなくなる。**待ち切れなければ諦める** —
 * 何も変わらないクリックは実在する。
 */
export interface SettleOptions {
  readonly attempts: number;
  readonly intervalMs: number;
}

const DEFAULT_SETTLE: SettleOptions = { attempts: 12, intervalMs: 150 };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 観測が同じか。同じなら「まだ何も変わっていない」と読む。 */
function same(a: RecordedObservation, b: RecordedObservation): boolean {
  if (a.url !== b.url || a.title !== b.title || a.visibleRefs.length !== b.visibleRefs.length) {
    return false;
  }
  const seen = new Set(a.visibleRefs);
  return b.visibleRefs.every((ref) => seen.has(ref));
}

/**
 * 記録の対象になる入力か。
 *
 * **記録するのは押下だけである。** 移動と離すまで記録すると、1 クリックが
 * 3 手順になる。スクロールとキー入力も 1 手順に数えない。
 */
function pressPointOf(input: PageInput): { readonly x: number; readonly y: number } | undefined {
  return input.kind === "pointer" && input.phase === "down"
    ? { x: input.x, y: input.y }
    : undefined;
}

export interface RunSessionOptions {
  readonly entryUrl: string;
  /**
   * 対象ページで action を実行する。
   *
   * **観測は含めない。** 何を観測するかはここが決める — 要素 ID との対応を
   * 持っているのはこちらである。
   */
  readonly perform: (action: BrowserAction) => Promise<void>;
  /**
   * 記録の材料。
   *
   * **転送より前に box 付き要素一覧を取る。** 操作後の状態で解決すると、
   * ページが自律的に変化していたときに「解決できない」ではなく間違った要素へ
   * 解決する (ADR-0026)。
   */
  readonly observe?: (() => Promise<readonly ObservedElement[]>) | undefined;
  /**
   * 期待状態の候補づくりに使う観測。**box を伴わない。**
   *
   * box の取得は対象ページへ枠と番号を描き込む実行基盤がある (agent-browser
   * 0.34.0 で実測)。反映を待つ間に繰り返し呼ぶため、描き込むものを使うと
   * 映像が枠だらけになり、操作の邪魔にもなる。
   */
  readonly observeVisible?: (() => Promise<readonly SemanticLocator[]>) | undefined;
  readonly currentUrl?: (() => Promise<string>) | undefined;
  /** 利用者へ出す注意書きの取得元。 */
  readonly warnings?: (() => readonly string[]) | undefined;
  /** 操作の反映を待つ条件。テストでは 0 回にして実時間へ依存させない。 */
  readonly settle?: SettleOptions | undefined;
}

export interface RunSession {
  /**
   * いま見ている画面状態を伝える。
   *
   * **構成番号は画面状態ごとに別に持つ** (ADR-0005 の「画面仕様書は状態単位」)。
   * 1 本の列にすると、別の画面へ移ったあとも前の画面の番号が残り、居ない要素へ
   * 番号を振ったままになる。
   */
  enterState(url: string): void;
  /**
   * run を未開始へ戻す。
   *
   * セッションを捨てたのに `paused` のままにすると、Stream Proxy が存在しない
   * セッションへ入力を中継し続け、画面も「一時停止中」を表示し続ける。
   */
  reset(): ViewportSnapshot;
  /**
   * 記録した手順をすべて捨てる。
   *
   * 記録は追記しかしないため、やり直す手段が無いと server を再起動するほか
   * なくなる。要素の定義と構成番号は残す — 採番はやり直しの対象ではない。
   */
  clearSteps(): ViewportSnapshot;
  /** 選択した要素へ番号を付ける。既に付いていれば何もしない。 */
  addBadge(locator: SemanticLocator): ViewportSnapshot;
  removeBadge(id: ElementId): ViewportSnapshot;
  /** 並べ替える。番号は 1..N の連番を保ち、欠番を作らない (ADR-0005)。 */
  moveBadge(id: ElementId, to: number): ViewportSnapshot;
  /**
   * 対象ページへの入力を処理する。
   *
   * **記録と転送の順序をここが持つ。** 解決 → 転送 → 検証の順であり、外に出すと
   * 「操作後の状態で解決する」経路が呼び出し側の書き方次第で生まれる。そのとき
   * は「解決できない」ではなく**間違った要素へ解決する**ため静かに壊れる
   * (ADR-0026)。
   *
   * 記録しないときも転送はする。記録の有無で操作が効いたり効かなかったりしない。
   *
   * @param input - 中継してよいと判定済みの入力
   * @param forward - 対象ページへ届ける手段
   */
  handleInput(input: PageInput, forward: () => void): Promise<void>;
  /** run を起こす。1 ステップ実行して `paused` に入る。 */
  start(): Promise<ViewportSnapshot>;
  /**
   * 記録した手順を最初から実行する。
   *
   * **記録と同じ経路を通す。** 別の経路にすると、記録できたのに再現できない
   * 差が生まれても気付けない。座標のまま残った手順は再現できないため、そこで
   * 止めて理由を返す (ADR-0026)。
   */
  replay(): Promise<ViewportSnapshot>;
  resume(): Promise<ViewportSnapshot>;
  setMode(mode: StreamMode): ViewportSnapshot;
  setRecording(recording: boolean): ViewportSnapshot;
  snapshot(): ViewportSnapshot;
  /** Stream Proxy の中継条件に使う。**client から渡させない。** */
  relayState(): RunState | undefined;
}

/** run の識別子。skeleton は 1 本しか動かさないため固定する。 */
const RUN_ID = "current";

export function createRunSession(options: RunSessionOptions): RunSession {
  let status: ViewportSnapshot["status"] = "idle";
  let mode: StreamMode = "view";
  let recording = false;
  let events: readonly ExecutionEvent[] = [];
  let session: RecordingSession | undefined;
  /** 手順は追記のみで並べ替えない。連番をそのまま識別子にする。 */
  let steps: readonly (RecordedStep & { id: string })[] = [];
  let newElements: readonly ElementDef[] = [];
  /** 画面状態ごとの構成番号。鍵は origin + pathname。 */
  const badgesByState = new Map<string, readonly ElementId[]>();
  let stateKey = stateKeyOf(options.entryUrl);
  /** 記録を止めた時点までの手順。再開しても消さない。 */
  let confirmed: readonly (RecordedStep & { id: string })[] = [];
  /**
   * 転送の順番待ち。
   *
   * **順序を守るのは転送までである。**
   *
   * 押下は観測を挟んでから転送するのに対し、離すは即座に転送するため、並べないと
   * 離すが押下を追い越す。対象ページはクリックとして解釈できず、1 回目が効かない。
   *
   * 一方、**反映待ちまで並べてはいけない。** 押下の反映は離すが届くまで起きない
   * ため、待ちの中に離すを閉じ込めると永久に変化せず、期待状態が必ず空になる。
   */
  let forwarded: Promise<void> = Promise.resolve();
  /**
   * 直前に確定した状態の box 付き要素。
   *
   * **クリックの手前で取り直さない。** 取得は要素数に比例し、実測で 518 要素
   * 892ms かかる。転送がそのぶん遅れると、押下と離すの間隔が開いてクリックとして
   * 成立しなくなる。ADR-0026 が求めるのは「操作前の状態で解決する」ことであり、
   * 直前に確定した状態はそれを満たす。
   */
  let resolvable: readonly ObservedElement[] = [];

  function badges(): readonly ElementId[] {
    return badgesByState.get(stateKey) ?? [];
  }

  function snapshot(): ViewportSnapshot {
    return {
      runId: RUN_ID,
      status,
      mode,
      recording,
      events,
      entryUrl: options.entryUrl,
      stateUrl: stateKey,
      steps,
      newElements,
      badges: badges(),
      warnings: options.warnings?.() ?? [],
    };
  }

  /**
   * 要素 ID の台帳。
   *
   * **名称を識別子にしない** (ADR-0012)。Locator は探し方であって同一性では
   * ないため、対応は台帳が持つ。
   */
  const elementIds = createElementIdRegistry();
  const nextId = (locator: SemanticLocator): ElementId => elementIds.idFor(locator);

  /** 期待状態が指していて、まだ定義の無い要素。 */
  function definitionsFor(
    recorded: readonly RecordedStep[],
    known: readonly ElementDef[],
  ): readonly ElementDef[] {
    const have = new Set(known.map((element) => element.id));
    const added: ElementDef[] = [];
    for (const step of recorded) {
      for (const expectation of step.expect) {
        if (expectation.kind !== "element" || have.has(expectation.ref)) {
          continue;
        }
        const locator = elementIds.locatorOf(expectation.ref);
        if (locator === undefined) {
          continue;
        }
        have.add(expectation.ref);
        added.push({ id: expectation.ref, name: locator.name, type: locator.role, locator });
      }
    }
    return added;
  }

  /** entry へ到達する 1 ステップ。ここから記録した steps が積み上がる。 */
  function entrySteps(): readonly ExecutionStep[] {
    return [
      {
        action: { kind: "open", url: options.entryUrl },
        expect: [{ kind: "url", path: new URL(options.entryUrl).pathname }],
        origin: { document: "workflow", documentId: "entry", index: 0 },
      },
    ];
  }

  /**
   * 実行の相手。
   *
   * **観測をここで組み立てる。** 期待状態は要素 ID を指すため、可視な Locator を
   * ID へ写す台帳が要る。viewport 側は台帳を持たない。
   */
  function stepRunner(): StepRunner {
    return {
      observe: async (): Promise<Observation> => {
        const [url, locators] = await Promise.all([
          options.currentUrl?.() ?? Promise.resolve(options.entryUrl),
          options.observeVisible?.() ?? Promise.resolve([]),
        ]);
        const visibleIds = new Set(locators.map((locator) => nextId(locator)));
        // **知っている要素は「見えない」まで観測する。** 載せないと
        // `unevaluatable` になり、`visible: false` の期待状態が永久に満たされ
        // ない。冪等スキップが効かず、再現のたびに同じ操作をやり直す。
        const elements = new Map(
          elementIds.entries().map(({ id }) => [id, visibleIds.has(id)] as const),
        );
        return {
          url: new URL(url).pathname,
          title: "",
          elements,
          counts: new Map(),
        };
      },
      perform: async (step: ExecutionStep): Promise<void> => {
        await options.perform(actionOf(step.action));
      },
    };
  }

  /**
   * DSL の action を実行基盤の action へ写す。
   *
   * **`ref` を Locator へ解決する。** 記録に残すのは要素 ID だが、実際に探す
   * のは Locator である (ADR-0026)。
   */
  function actionOf(action: Action): BrowserAction {
    if (action.kind === "open") {
      return { kind: "open", url: action.url };
    }
    if (action.kind === "click") {
      const locator = elementIds.locatorOf(action.ref as ElementId);
      if (locator === undefined) {
        throw new ConflictError("記録した要素の探し方が分かりません");
      }
      return { kind: "click", locator };
    }
    // 座標のまま残った手順は再現できない。ADR-0026 は記録を止めないと定めるが、
    // 再現できないことは黙らせない。
    throw new ConflictError(`再現できない手順です: ${action.kind}`);
  }

  async function run(pause: boolean): Promise<ViewportSnapshot> {
    const outcome = await runSteps({
      steps: entrySteps(),
      irVersion: "entry",
      runner: stepRunner(),
      // 予約は各ステップの完了直後に見られる (ADR-0002)。
      shouldPause: () => pause,
    });
    events = outcome.events;
    status = outcome.status;
    if (status !== "paused") {
      // 停止していない run で操作モードに留まらせない。
      mode = "view";
      recording = false;
    }
    return snapshot();
  }

  /**
   * 入力を 1 つ処理する。
   *
   * **解決 → 転送 → 検証の順を内側で守る** (ADR-0026)。外へ出すと「操作後の
   * 状態で解決する」経路が呼び出し側の書き方次第で生まれ、静かに壊れる。
   */
  async function handle(input: PageInput, forward: () => void): Promise<void> {
    const point = pressPointOf(input);
    // 記録していないときも転送する。記録の有無で操作が効いたり効かなくなったり
    // しない。押下以外 (移動・離す・ホイール) は 1 手順に数えない — 数えると
    // 1 クリックが 3 手順になる。
    if (point === undefined || !recording || session === undefined) {
      forward();
      return;
    }
    const observe = options.observe;
    if (observe === undefined) {
      forward();
      return;
    }
    const visible =
      options.observeVisible ??
      (async (): Promise<readonly SemanticLocator[]> =>
        (await observe()).map((element) => ({ role: element.role, name: element.name })));
    const currentUrl = options.currentUrl;
    const settle = options.settle ?? DEFAULT_SETTLE;

    /**
     * 観測を 1 回取る。
     *
     * **呼ぶたびに取り直す。** 同じ値を返すと `expectationCandidates` が
     * 「変化した項目」を 1 つも見つけられず、記録した手順が必ず期待状態を
     * 持たなくなる。期待状態が無いと冪等スキップが効かない。
     */
    const observeOnce = async (): Promise<RecordedObservation> => {
      const [url, locators] = await Promise.all([
        currentUrl?.() ?? Promise.resolve(options.entryUrl),
        // **box を取らない。** 取ると対象ページへ描き込まれ、映像が枠だらけに
        // なるうえ、反映待ちの間に繰り返し描かれる。
        visible(),
      ]);
      return {
        // title は取得経路が無い。空文字で埋めると比較が一度も発火しない
        // まま実装済みに見えるため、持たせない。
        url: new URL(url).pathname,
        visibleRefs: locators.map((locator) => nextId(locator)),
      };
    };

    let before: RecordedObservation | undefined;
    /**
     * 前後の観測。
     *
     * 転送した直後の画面はまだ変わっていない。**変わるまで見る。** 見ないと、
     * 期待状態の候補が常に空になる。待ち切れなければ諦める — 何も変わらない
     * クリックは実在する。
     */
    const observeStep = async (): Promise<RecordedObservation> => {
      if (before === undefined) {
        before = await observeOnce();
        return before;
      }
      let after = await observeOnce();
      for (let attempt = 0; attempt < settle.attempts && same(before, after); attempt += 1) {
        await delay(settle.intervalMs);
        after = await observeOnce();
      }
      return after;
    };

    await session.click(
      // **クリックの手前で取り直さない。** 取得は要素数に比例し、実測で
      // 518 要素 892ms かかる。転送がそのぶん遅れると、押下と離すの間隔が
      // 開いてクリックとして成立しない。
      { elements: resolvable, x: point.x, y: point.y, nextId },
      // **転送を session の内側で行う。** 外へ出すと、操作前の状態で「後」を
      // 観測する経路が生まれ、期待状態が静かに空になる (ADR-0026)。
      () => {
        forward();
        return Promise.resolve();
      },
      observeStep,
    );
    // 操作でページが移ることがある。移った先の画面状態へ番号の帳簿を切り替える。
    if (currentUrl !== undefined) {
      stateKey = stateKeyOf(await currentUrl());
    }
    // 落ち着いた状態の box を次のクリックの解決に使う。**転送の手前ではなく
    // ここで取る** — 手前で取ると、その待ち時間だけ操作が遅れる。
    resolvable = await observe();
    const draft = session.finish();
    // 記録を止めて再開しても前の手順を消さない。session は開始時点からの
    // 手順しか持たないため、確定済みの分へ追記する。
    steps = [
      ...confirmed,
      ...draft.steps.map((step, index) => ({
        ...step,
        id: `step-${String(confirmed.length + index)}`,
      })),
    ];
    newElements = [
      ...newElements.filter(
        (element) => !draft.newElements.some((added) => added.id === element.id),
      ),
      ...draft.newElements,
    ];
    // **期待状態が指す要素にも定義を用意する。** 用意しないと、ID だけがあって
    // 探し方の無い参照が残り、成果物の生成と再実行で解決できない。
    newElements = [...newElements, ...definitionsFor(steps, newElements)];
  }

  return {
    enterState(url: string): void {
      stateKey = stateKeyOf(url);
    },

    reset(): ViewportSnapshot {
      status = "idle";
      mode = "view";
      recording = false;
      confirmed = steps;
      session = undefined;
      events = [];
      return snapshot();
    },

    clearSteps(): ViewportSnapshot {
      steps = [];
      confirmed = [];
      // 記録中なら session も捨てる。残すと、次の 1 手で捨てたはずの手順が
      // まとめて戻ってくる。
      session = recording ? startRecording(RUN_ID, [...newElements]) : undefined;
      return snapshot();
    },

    addBadge(locator: SemanticLocator): ViewportSnapshot {
      const id = nextId(locator);
      if (!newElements.some((element) => element.id === id)) {
        newElements = [...newElements, { id, name: locator.name, type: locator.role, locator }];
      }
      if (!badges().includes(id)) {
        badgesByState.set(stateKey, [...badges(), id]);
      }
      return snapshot();
    },

    removeBadge(id: ElementId): ViewportSnapshot {
      badgesByState.set(
        stateKey,
        badges().filter((badge) => badge !== id),
      );
      return snapshot();
    },

    moveBadge(id: ElementId, to: number): ViewportSnapshot {
      const current = badges();
      const from = current.indexOf(id);
      if (from < 0 || to < 0 || to >= current.length) {
        return snapshot();
      }
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, id);
      badgesByState.set(stateKey, next);
      return snapshot();
    },

    handleInput(input: PageInput, forward: () => void): Promise<void> {
      let release = (): void => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const done = forwarded
        .then(() =>
          handle(input, () => {
            forward();
            // ここで次の入力を通す。反映待ちは鎖の外で続ける。
            release();
          }),
        )
        // 転送へ辿り着けなくても鎖を止めない。止めると以後の操作が届かない。
        .finally(release);
      forwarded = gate;
      return done;
    },

    start: () => run(true),
    resume: () => run(false),

    async replay(): Promise<ViewportSnapshot> {
      if (steps.length === 0) {
        throw new ConflictError("再現する手順がありません");
      }
      // entry から始める。**途中の状態から始めない** — 記録は entry への到達を
      // 前提に積まれている。
      const executable: ExecutionStep[] = [
        ...entrySteps(),
        ...steps.map((step, index) => ({
          action: step.action,
          expect: step.expect,
          // 記録した手順は workflow 文書として扱う。DSL へ確定するのは承認の
          // あとであり、ここでは出所だけを残す。
          origin: { document: "workflow" as const, documentId: RUN_ID, index },
        })),
      ];
      const outcome = await runSteps({
        steps: executable,
        irVersion: `recording-${String(steps.length)}`,
        runner: stepRunner(),
        // 再現は最後まで走らせる。途中で止めると、どこまで再現できたか読めない。
        shouldPause: () => false,
      });
      events = outcome.events;
      status = outcome.status;
      if (status !== "paused") {
        mode = "view";
        recording = false;
      }
      return snapshot();
    },

    setMode(next: StreamMode): ViewportSnapshot {
      // 判定の正本は core にある。ここは保持だけを行う。
      mode = status === "paused" ? next : "view";
      if (mode !== "operate") {
        recording = false;
      }
      return snapshot();
    },

    setRecording(next: ViewportSnapshot["recording"]): ViewportSnapshot {
      recording = status === "paused" && mode === "operate" ? next : false;
      if (recording && session === undefined) {
        // 記録した steps の遷移元は run の到達状態から決まる (ADR-0026)。
        session = startRecording(RUN_ID, [...newElements]);
        // 最初のクリックを解決する材料を先に取る。取らないと 1 手目だけが
        // 座標のまま残る。
        void options
          .observe?.()
          .then((elements) => {
            resolvable = elements;
          })
          // 取れなくても記録は始める。1 手目が座標のまま残るだけで、警告付きで
          // 記録は続く (ADR-0026)。
          .catch(() => undefined);
      }
      if (!recording) {
        confirmed = steps;
        session = undefined;
      }
      return snapshot();
    },

    snapshot,

    relayState(): RunState | undefined {
      return status === "idle" ? undefined : { runId: RUN_ID, paused: status === "paused", mode };
    },
  };
}
