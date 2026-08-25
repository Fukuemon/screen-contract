import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Storage State の封筒。
 *
 * **「暗号化する」だけでは不足である。** Storage State はそのまま使える資格
 * 情報を含むため、機密性に加えて**改ざんの検知**が要る。検知しないと、書き
 * 換えられたファイルを復号して注入し、攻撃者の指定した状態でブラウザを動かす
 * ことになる (context/infrastructure.md)。
 */

/** 形式の版。方式を変えるときに既存ファイルを読めなくしないため持つ。 */
const FORMAT_VERSION = 1;
const ALGORITHM = "aes-256-gcm";
/** GCM の nonce は 96 bit が推奨。長さを変えると相互運用できなくなる。 */
const NONCE_BYTES = 12;
/** GCM のタグ長。**固定する。** Node は 4 バイトのタグも受けるため、
 * 指定しないと攻撃者が 32 bit のタグを置いて偽造の総当たりを 2^32 に落とせる。 */
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export interface SealedEnvelope {
  readonly format: number;
  readonly keyVersion: number;
  /**
   * 取り込みの世代。Baseline の識別に入る (ADR-0022)。
   *
   * **平文で持ち、AAD で守る。** 平文なので復号せずに読める (一覧のたびに
   * キーストアを開かずに済む)。AAD に含むため、書き換えると復号が失敗する。
   */
  readonly generation: number;
  /** base64。暗号化のたびに作り直す。**同じ鍵で再利用しない。** */
  readonly nonce: string;
  readonly tag: string;
  readonly ciphertext: string;
}

export class SealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SealError";
  }
}

export function generateKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

/**
 * 追加認証データ。
 *
 * 形式の版・鍵の版・`authProfile`・世代を含める。含めないと、別プロファイルの
 * ファイルを置き換えても復号が通り、取り違えを検知できない。世代を含めるのは、
 * 平文のまま巻き戻して古い Baseline へ結果を混ぜられるのを防ぐためである。
 */
function additionalData(keyVersion: number, profile: string, generation: number): Buffer {
  return Buffer.from(
    `${String(FORMAT_VERSION)}:${String(keyVersion)}:${profile}:${String(generation)}`,
    "utf8",
  );
}

export function seal(
  plaintext: string,
  key: Buffer,
  keyVersion: number,
  profile: string,
  generation: number,
): SealedEnvelope {
  if (key.length !== KEY_BYTES) {
    throw new SealError("鍵の長さが規則に合いません");
  }
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(additionalData(keyVersion, profile, generation));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    format: FORMAT_VERSION,
    keyVersion,
    generation,
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

/**
 * 復号する。
 *
 * **認証に失敗したら復号結果を使わずに中止する** (fail closed)。部分的に
 * 読めても続行しない。
 */
export function open(envelope: SealedEnvelope, key: Buffer, profile: string): string {
  if (envelope.format !== FORMAT_VERSION) {
    throw new SealError("保存形式の版が合いません");
  }
  if (key.length !== KEY_BYTES) {
    throw new SealError("鍵の長さが規則に合いません");
  }
  const nonce = Buffer.from(envelope.nonce, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  if (nonce.length !== NONCE_BYTES || tag.length !== TAG_BYTES) {
    throw new SealError("認証状態のファイルが壊れています");
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_BYTES });
    decipher.setAAD(additionalData(envelope.keyVersion, profile, envelope.generation));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // 原因を漏らさない。鍵違いと改ざんを区別できると総当たりの手掛かりになる。
    throw new SealError("認証状態を復号できません");
  }
}

/** 未検証の JSON を封筒として読む。形が違えば復号へ進まない。 */
export function parseEnvelope(raw: string): SealedEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new SealError("認証状態のファイルが壊れています");
  }
  if (typeof value !== "object" || value === null) {
    throw new SealError("認証状態のファイルが壊れています");
  }
  const { format, keyVersion, generation, nonce, tag, ciphertext } = value as Record<
    string,
    unknown
  >;
  if (
    typeof format !== "number" ||
    typeof keyVersion !== "number" ||
    !Number.isInteger(generation) ||
    typeof nonce !== "string" ||
    typeof tag !== "string" ||
    typeof ciphertext !== "string"
  ) {
    throw new SealError("認証状態のファイルが壊れています");
  }
  return { format, keyVersion, generation: generation as number, nonce, tag, ciphertext };
}
