import { timingSafeEqual } from "node:crypto";

/**
 * ローカル HTTP の認可。
 *
 * bind は 127.0.0.1 のみで、リクエストにはローカルトークンを要求する
 * (context/infrastructure.md)。トークンの生成は合成ルート、照合はここに置く
 * (`apps/` は packages から参照できない)。
 */

/**
 * トークンを定数時間で照合する。
 *
 * **通常の文字列比較を使わない。** 先頭からの一致長で処理時間が変わるため、
 * 1 バイトずつ総当たりで復元できる。
 */
export function tokensMatch(expected: string, actual: string): boolean {
  // **空同士を一致させない。** `timingSafeEqual` は長さ 0 で真を返すため、
  // 期待値が未確定のまま空文字で組まれると、空を名乗る接続が通る。安全を
  // ミドルウェアの登録順に依存させない。
  if (expected.length === 0 || actual.length === 0) {
    return false;
  }
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");
  // timingSafeEqual は長さが違うと投げる。長さの一致を先に定数時間の外で
  // 見ることになるが、**長さは秘密ではない** (トークンは固定長で生成する)。
  // 長さを隠すために片方を詰めると、比較対象が本物でなくなる。
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export interface OriginPolicy {
  /** 自分の待受ポート。ここ以外の Origin と Host は受け付けない。 */
  readonly port: number;
}

/**
 * 受け付けるホスト名。
 *
 * bind するのは 127.0.0.1 だけだが、利用者が `localhost:<port>` で開くことは
 * ある。**`localhost` は特別名で、DNS rebinding の対象にならない** (RFC 6761)。
 * Origin だけ許して Host で拒むと、localhost で開いた画面が一切動かない。
 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * Origin と Host を検査する。
 *
 * ブラウザからの CSRF を塞ぐ。トークンだけでは、別 origin のページが
 * ローカル server へ投げるリクエストを止められない。
 */
export function isAllowedOrigin(value: string | undefined, policy: OriginPolicy): boolean {
  if (value === undefined) {
    // Origin を送らないのはブラウザ以外の経路である。トークンで守る。
    return true;
  }
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      LOOPBACK_HOSTS.has(url.hostname) &&
      // **任意のポートを許可しない。** 同じマシンで動く別のローカル Web アプリ
      // からの cross-origin 要求が通ってしまう。
      url.port === String(policy.port)
    );
  } catch {
    return false;
  }
}

/**
 * Host は必ず送られる。自分の待受ポートと一致しなければ受けない。
 *
 * DNS rebinding の主防御は Host 検査である。ポートを固定するため、rebind された
 * 名前で来ても一致しない。
 */
export function isAllowedHost(value: string | undefined, policy: OriginPolicy): boolean {
  if (value === undefined) {
    return false;
  }
  const separator = value.lastIndexOf(":");
  return (
    separator > 0 &&
    LOOPBACK_HOSTS.has(value.slice(0, separator)) &&
    value.slice(separator + 1) === String(policy.port)
  );
}

export type AuthRejection = "missing-token" | "bad-token" | "bad-origin" | "bad-host";

export interface AuthInput {
  readonly token: string | undefined;
  readonly origin: string | undefined;
  readonly host: string | undefined;
}

export interface AuthPolicy extends OriginPolicy {
  readonly token: string;
  /**
   * 起動チケット。
   *
   * **トークンとは別物である。** トークンは全 endpoint の認可に使い、これは
   * 「トークン入りの画面を配る相手か」だけを見る。起動ごとに作り直し、URL の
   * query で 1 度だけ受け取って cookie へ移す (context/infrastructure.md)。
   *
   * これが無いと、`GET /` が同一マシンの任意プロセスへトークンを配る。
   */
  readonly bootKey: string;
}

/** 通れば undefined、通らなければ理由を返す。理由に受け取った値を含めない。 */
export function rejectRequest(input: AuthInput, policy: AuthPolicy): AuthRejection | undefined {
  if (!isAllowedHost(input.host, policy)) {
    return "bad-host";
  }
  if (!isAllowedOrigin(input.origin, policy)) {
    return "bad-origin";
  }
  if (input.token === undefined || input.token.length === 0) {
    return "missing-token";
  }
  if (!tokensMatch(policy.token, input.token)) {
    return "bad-token";
  }
  return undefined;
}
