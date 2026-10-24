"use client";

import { useEffect } from "react";
import { recordViewAction } from "@/actions/fanfic";

const recorded = new Set<string>();

/** Reports a view once per story per browser session; the server also dedupes per user. */
export function ViewTracker({ fanficId }: { fanficId: string }) {
  useEffect(() => {
    if (recorded.has(fanficId)) return;
    recorded.add(fanficId);
    void recordViewAction(fanficId).catch(() => recorded.delete(fanficId));
  }, [fanficId]);
  return null;
}
