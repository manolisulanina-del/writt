import { LocalDateTime } from "@/components/ui/RelativeTime";
import type { CreationBlock } from "@/lib/moderation";

/** Tells an author when they can create books again after a removal for reports. */
export function CreationBlockedNotice({ block, compact }: { block: CreationBlock; compact?: boolean }) {
  return (
    <div role="status" className="rounded-2xl border border-danger/30 bg-danger/10 px-5 py-4 text-danger">
      <p className="font-semibold">
        You can create new books again on <LocalDateTime iso={block.until.toISOString()} />.
      </p>
      {!compact && (
        <p className="mt-1 text-sm">
          {block.reason ?? "One of your books was removed after too many reports."} Until then you can still read, comment
          and edit your existing books.
        </p>
      )}
    </div>
  );
}
