# ADR-0030: E2E では Browser Port を fake に置き換え、実行系は統合テストで確かめる

## Status

承認

## Context

E2E は Playwright で Web UI を操作し、操作、表示、承認の流れを確かめる。  
E2E で agent-browser を実際に起動するかを決める必要がある。

決定に関わる事実は次のとおり。

- E2E で agent-browser を実際に起動すると、Playwright がブラウザで Web UI を操作し、Web UI が agent-browser を起動し、agent-browser がさらに対象アプリを操作する。ブラウザのスタックが 2 段に重なる。
- 実行系の挙動（冪等スキップ、前提の再検証と巻き戻し、Locator の解決、Snapshot の取得）は、統合テストが実際の agent-browser を起動して確かめる。
  - [context/testing.md](../context/testing.md#test-types-and-guarantees)

## Decision

E2E では、Browser Port を fake に置き換える。  
ブラウザを入れ子にすると、起動のコストと不安定さが乗る。  
その割に、実行系の確認は統合テストがすでに持つ。

## Considered Options

| 選択肢                                               | 強み                            | 弱み                                                                                              |
| ---------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| **採用:** E2E では Browser Port を fake に置き換える | ブラウザのスタックが 1 段で済む | 通しの実際の挙動は、MVP のテストでは確かめられない                                                |
| E2E で agent-browser を実際に起動する                | —                               | ブラウザのスタックが 2 段に重なり、起動のコストと不安定さが乗る。実行系の確認は統合テストと重なる |

## Consequences

### Positive

- ブラウザが入れ子にならず、入れ子による起動のコストと不安定さが乗らない。

### Negative

- E2E で Browser Port を fake に置き換えるため、通しの実際の挙動は MVP のテストでは確かめられない。
