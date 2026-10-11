# ADR-0009: adapter/ai の認証は API キーと OAuth の両対応とする

## Status

ADR-0019 に置換

置換の理由と出典は ADR-0019 にある。  
ADR-0019: [AI 候補生成をエージェント主導とし adapter/ai を MVP 実装対象外とする](0019-agent-led-ai-suggestions.md)

## Context

adapter/ai が外部の AI サービスへ問い合わせるための、認証の方式を決める必要がある。  
選択肢は、API キーだけ、サブスクリプションの OAuth 連携だけ、両対応の 3 つ。

- 想定する利用者には、個人の開発者（すでに Claude Pro などの AI サブスクリプションを持つ）と、チームでの利用（API キーを組織で発行して管理する）の両方がいる。
- 主な CLI エージェント（Claude Code、Codex など）は、サブスクリプションの OAuth 連携を標準の導入の手順にしており、個人の利用者の主な動線はサブスクリプションの側にある。

## Decision

- API キーと OAuth（サブスクリプション連携）の両方に対応する。
- 認証の方式の差は、adapter/ai の中の credential を解決する層に閉じ込め、AI Port と DSL Fix Port の契約と core には出さない。
- credential は、DSL、ログ、Snapshot、生成した成果物へ平文で残さない。
  - 置き場と扱いは [context/operations.md の Secrets](../context/operations.md#secrets) に従う。

## Considered Options

| 選択肢                                      | 強み                                                                         | 弱み                                                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **採用:** API キーと OAuth の両方に対応する | 個人（サブスクリプション）とチーム（API キー）のどちらの導入の手順も塞がない | 認証の 2 系統の実装と検証のコストがかかる。OAuth は provider ごとに仕様と利用規約が違い、provider ごとの確認が要る      |
| API キーだけ                                | 実装が最も単純                                                               | サブスクリプションを持つ利用者に、API の従量課金の二重のコストを強いる。個人の利用の導入の障壁が、主な動線の上にある    |
| OAuth だけ                                  | —                                                                            | チームでの利用と CI での実行で、共有の credential（API キー）を使う運用ができない。将来の CI での差分の検知と両立しない |

CI での差分の検知は、[PRD の Lower-Priority Goals](../PRD.md#lower-priority-goals) にある。

## Consequences

### Positive

- 個人（サブスクリプション）とチーム（API キー）の、どちらの導入の手順も塞がない。
- 認証の差を adapter の中に閉じたため、core と app は認証の方式を知らない。

### Negative

- 認証の 2 系統の実装と検証のコストがかかる。
  - OAuth は provider ごとに仕様と利用規約が違い、対応する provider ごとの確認が要る。
