import { useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "../../ui/badge.js";
import { Button } from "../../ui/button.js";
import { EmptyState } from "../../ui/panel.js";
import { cn } from "../../../lib/cn.js";

export interface ConsoleMessage {
  /** 取得順で決まる識別子。並べ替えないため順番がそのまま同一性になる。 */
  readonly id: string;
  readonly level: string;
  readonly text: string;
}

const LEVEL_TONE: Readonly<Record<string, "danger" | "warn" | "info" | "muted">> = {
  error: "danger",
  warn: "warn",
  warning: "warn",
  info: "info",
};

const FILTERS = [
  { id: "all", label: "すべて" },
  { id: "error", label: "エラー" },
  { id: "warn", label: "警告" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

function matches(message: ConsoleMessage, filter: FilterId): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "error") {
    return message.level === "error";
  }
  return message.level === "warn" || message.level === "warning";
}

export interface LogPanelProps {
  readonly messages: readonly ConsoleMessage[];
  readonly onRefresh: () => void;
  readonly onClear: () => void;
}

/** 対象ページのコンソール出力。原因を切り分けるために出す。 */
export function LogPanel(props: LogPanelProps) {
  const [filter, setFilter] = useState<FilterId>("all");
  const shown = props.messages.filter((message) => matches(message, filter));

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 px-3 py-2">
        {FILTERS.map((item) => (
          <Button key={item.id} pressed={filter === item.id} onClick={() => setFilter(item.id)}>
            {item.label}
          </Button>
        ))}
        <Button tone="ghost" size="icon" aria-label="読み直す" onClick={props.onRefresh}>
          <RefreshCw className="size-3.5" aria-hidden />
        </Button>
        <Button tone="ghost" size="icon" aria-label="消す" onClick={props.onClear}>
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>

      {shown.length === 0 ? (
        <EmptyState>コンソール出力はありません。</EmptyState>
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto font-mono text-xs">
          {shown.map((message) => (
            <li key={message.id} className="flex gap-2 border-b border-line/20 px-3 py-1.5">
              <Badge tone={LEVEL_TONE[message.level] ?? "muted"}>{message.level}</Badge>
              <span
                className={cn(
                  "min-w-0 flex-1 break-all",
                  message.level === "error" && "text-danger",
                )}
              >
                {message.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
