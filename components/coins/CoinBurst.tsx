"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CoinIcon } from "@/components/ui/icons";

/** "+50 coins" floating up for a moment after publishing. Respects reduced motion (see globals.css). */
export function CoinBurst({ amount }: { amount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [visible, setVisible] = useState(true);
  const valid = Number.isInteger(amount) && amount > 0 && amount <= 1000;

  useEffect(() => {
    if (!valid) return;
    const timer = setTimeout(() => {
      setVisible(false);
      // Drop ?coins= so a refresh doesn't celebrate again.
      const next = new URLSearchParams(params);
      next.delete("coins");
      router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
    }, 2600);
    return () => clearTimeout(timer);
  }, [valid, params, pathname, router]);

  if (!valid || !visible) return null;
  return (
    <div role="status" className="coin-burst pointer-events-none fixed inset-x-0 top-24 z-50 flex justify-center">
      <span className="inline-flex items-center gap-2 rounded-full bg-[#f5c542] px-5 py-2.5 text-lg font-bold text-[#3b2a00] shadow-lift">
        <CoinIcon className="size-6" /> +{amount} coins
      </span>
    </div>
  );
}
