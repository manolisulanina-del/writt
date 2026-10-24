import Link from "next/link";
import { prisma } from "@/lib/db";
import { ageFrom } from "@/lib/content";
import { GROUP_INFO, kidGroupForAge } from "@/lib/kids";
import { LocalDateTime } from "@/components/ui/RelativeTime";

/** Admin panel: family accounts with their children, and kids' accounts waiting for a parent. Contact details are never shown. */
export async function FamiliesTab() {
  const [links, pending] = await Promise.all([
    prisma.familyLink.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        createdAt: true,
        parent: { select: { username: true, kind: true } },
        child: { select: { username: true, birthDate: true, consent: true, paused: true, coins: true } },
      },
    }),
    prisma.user.findMany({
      where: { consent: "PENDING" },
      orderBy: { consentDeadline: "asc" },
      take: 200,
      select: { id: true, username: true, needsSetup: true, birthDate: true, consentDeadline: true, consentRequest: { select: { method: true, sentAt: true } } },
    }),
  ]);

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-3 font-display text-2xl font-semibold">Linked children ({links.length})</h2>
        {links.length === 0 ? (
          <p className="text-sm text-ink-soft">No family accounts yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs tracking-wide text-ink-soft uppercase">
                <th className="py-2 font-semibold">Child</th>
                <th className="py-2 font-semibold">Group</th>
                <th className="py-2 font-semibold">State</th>
                <th className="py-2 font-semibold">Parent</th>
                <th className="py-2 font-semibold">Linked</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => {
                const group = kidGroupForAge(ageFrom(l.child.birthDate));
                return (
                  <tr key={l.child.username} className="border-b border-line/60 last:border-0">
                    <td className="py-2">
                      <Link href={`/u/${l.child.username}`} className="font-semibold hover:text-accent">
                        @{l.child.username}
                      </Link>
                    </td>
                    <td className="py-2">{group ? `${GROUP_INFO[group].label} (${GROUP_INFO[group].ages})` : "16+"}</td>
                    <td className="py-2">{l.child.paused ? "paused" : l.child.consent.toLowerCase()}</td>
                    <td className="py-2">
                      @{l.parent.username}
                      {l.parent.kind === "FAMILY" && <span className="text-ink-soft"> (family account)</span>}
                    </td>
                    <td className="py-2 text-ink-soft">
                      <LocalDateTime iso={l.createdAt.toISOString()} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <section>
        <h2 className="mb-3 font-display text-2xl font-semibold">Waiting for a parent ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-ink-soft">Nobody is waiting.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {pending.map((u) => (
              <li key={u.id} className="flex flex-wrap justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3">
                <span className="font-semibold">{u.needsSetup ? "(still signing up)" : `@${u.username}`}</span>
                <span className="text-ink-soft">
                  {ageFrom(u.birthDate)} years old ·{" "}
                  {u.consentRequest ? `parent contacted by ${u.consentRequest.method === "EMAIL" ? "email" : "text"}` : "no parent contacted yet"}
                  {u.consentDeadline && (
                    <>
                      {" "}
                      · deleted if not approved by <LocalDateTime iso={u.consentDeadline.toISOString()} />
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-sm text-ink-soft">
        Details for one account: <code className="rounded bg-muted px-1.5 py-0.5">/family @username</code>
      </p>
    </div>
  );
}
