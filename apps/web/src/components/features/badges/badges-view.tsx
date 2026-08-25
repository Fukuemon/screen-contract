import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { ElementDefView } from "../../../gateways/workflow-server.js";
import { Button } from "../../ui/button.js";
import { EmptyState } from "../../ui/panel.js";

export interface BadgesViewProps {
  /** 構成番号順の要素 ID。リストの位置がそのまま番号になる (ADR-0005)。 */
  readonly badges: readonly ElementDefView["id"][];
  readonly elements: readonly ElementDefView[];
  /** 番号が属する画面状態。**番号は画面ごとに別である** (ADR-0005)。 */
  readonly stateUrl: string;
  /** いま選択している要素。番号を付ける対象になる。 */
  readonly picked: { readonly role: string; readonly name: string } | undefined;
  readonly onAdd: (locator: { readonly role: string; readonly name: string }) => void;
  readonly onRemove: (id: ElementDefView["id"]) => void;
  readonly onMove: (id: ElementDefView["id"], to: number) => void;
}

/**
 * 構成番号。
 *
 * 番号は状態内で 1..N の連番で、欠番を作らない。並べ替えれば番号が変わる
 * (ADR-0005)。
 */
export function BadgesView(props: BadgesViewProps) {
  const byId = new Map(props.elements.map((element) => [element.id, element]));

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-2 px-3 py-2.5">
        <p className="text-xs leading-relaxed text-muted">
          選択モードで要素を選び、番号を付けます。並べ替えると番号が変わります。
        </p>
        {/* どの画面の番号かを出す。出さないと、移動したのに前の画面の番号を
            見ていることに気付けない。 */}
        {props.stateUrl !== "" && (
          <p className="truncate font-mono text-[11px] text-muted" title={props.stateUrl}>
            {props.stateUrl}
          </p>
        )}
        <Button
          disabled={props.picked === undefined}
          onClick={() => {
            if (props.picked !== undefined) {
              props.onAdd(props.picked);
            }
          }}
        >
          <Plus className="size-3.5" aria-hidden />
          {props.picked === undefined
            ? "要素を選んでください"
            : `${props.picked.name} に番号を付ける`}
        </Button>
      </div>

      {props.badges.length === 0 ? (
        <EmptyState>この画面にはまだ番号を付けていません。</EmptyState>
      ) : (
        <ol className="min-h-0 flex-1 overflow-auto">
          {props.badges.map((id, index) => {
            const element = byId.get(id);
            return (
              <li key={id} className="flex items-center gap-1.5 px-3 py-1.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[11px] font-bold text-on-accent">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">
                  {element?.name ?? id}
                  {element !== undefined && (
                    <span className="ml-1.5 font-mono text-muted">{element.type}</span>
                  )}
                </span>
                <Button
                  tone="ghost"
                  size="icon"
                  aria-label={`${String(index + 1)} 番を上へ`}
                  disabled={index === 0}
                  onClick={() => props.onMove(id, index - 1)}
                >
                  <ChevronUp className="size-3.5" aria-hidden />
                </Button>
                <Button
                  tone="ghost"
                  size="icon"
                  aria-label={`${String(index + 1)} 番を下へ`}
                  disabled={index === props.badges.length - 1}
                  onClick={() => props.onMove(id, index + 1)}
                >
                  <ChevronDown className="size-3.5" aria-hidden />
                </Button>
                <Button
                  tone="ghost"
                  size="icon"
                  aria-label={`${String(index + 1)} 番を外す`}
                  onClick={() => props.onRemove(id)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
