import { SidebarItem, SidebarSection } from "../../shared/sidebar/sidebar.js";

/**
 * 実行してよい対象の一覧。
 *
 * 列挙は ADR-0017 の安全装置である。ここは選ぶだけで、増やすのはヘッダの
 * 明示操作に限る。
 */
export interface TargetListProps {
  readonly origins: readonly string[];
  /** いま指している origin。URL 欄から導く。 */
  readonly current: string | undefined;
  readonly onSelect: (origin: string) => void;
}

export function TargetList(props: TargetListProps) {
  return (
    <SidebarSection title="対象">
      {props.origins.length === 0 ? (
        <p className="px-3 text-xs text-muted">まだ登録がありません。</p>
      ) : (
        props.origins.map((origin) => (
          <SidebarItem
            key={origin}
            selected={props.current === origin}
            onClick={() => props.onSelect(origin)}
          >
            <span className="truncate font-mono">{origin.replace(/^https?:\/\//, "")}</span>
          </SidebarItem>
        ))
      )}
    </SidebarSection>
  );
}
