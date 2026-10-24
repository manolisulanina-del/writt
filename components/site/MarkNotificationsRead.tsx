"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { markNotificationsReadAction } from "@/actions/notifications";

/** Marks everything read once the list has been shown, then refreshes the bell count. */
export function MarkNotificationsRead({ hasUnread }: { hasUnread: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!hasUnread) return;
    const timer = setTimeout(() => {
      void markNotificationsReadAction().then(() => router.refresh());
    }, 1500);
    return () => clearTimeout(timer);
  }, [hasUnread, router]);
  return null;
}
