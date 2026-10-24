"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { replyToAppealAction } from "@/actions/appeals";
import { Button } from "@/components/ui/Button";
import { FormError, Textarea } from "@/components/ui/Field";

export function AppealReply({ appealId }: { appealId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await replyToAppealAction(appealId, body);
          if ("error" in result) {
            setError(result.error);
            return;
          }
          setError(null);
          setBody("");
          router.refresh();
        });
      }}
    >
      <label htmlFor="appeal-reply" className="text-sm font-semibold">
        Reply to the admin
      </label>
      <Textarea id="appeal-reply" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} />
      <FormError message={error ?? undefined} />
      <div className="flex justify-end">
        <Button type="submit" loading={pending} disabled={!body.trim()}>
          Send
        </Button>
      </div>
    </form>
  );
}
