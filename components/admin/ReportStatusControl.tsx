"use client";

import type { ReportStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateReportStatusAction } from "@/actions/engagement";
import { Button } from "@/components/ui/Button";

export function ReportStatusControl({ reportId, status }: { reportId: string; status: ReportStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const set = (next: ReportStatus) =>
    start(async () => {
      await updateReportStatusAction(reportId, next);
      router.refresh();
    });

  return (
    <div className="flex gap-2" aria-busy={pending}>
      {status === "OPEN" ? (
        <>
          <Button size="sm" onClick={() => set("REVIEWED")} disabled={pending}>
            Mark reviewed
          </Button>
          <Button size="sm" variant="secondary" onClick={() => set("DISMISSED")} disabled={pending}>
            Dismiss
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => set("OPEN")} disabled={pending}>
          Reopen
        </Button>
      )}
    </div>
  );
}
