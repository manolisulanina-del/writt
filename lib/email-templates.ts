// Email and text messages Writt sends to parents. Pure: each returns the
// message for lib/email.ts or lib/sms.ts to send. Signed "— The creator of Writt".

import type { KidGroup } from "@/lib/kids";

export type Message = { subject: string; text: string; html: string };

const SIGN_OFF = "— The creator of Writt";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** A block of the email: a paragraph, a bold heading line, a bullet list, or the button. */
type Part = { p: string } | { strong: string } | { list: string[] } | { button: string; href: string };

function render(subject: string, parts: Part[]): Message {
  const text = parts
    .map((part) =>
      "p" in part ? part.p : "strong" in part ? part.strong : "list" in part ? part.list.map((l) => `- ${l}`).join("\n") : `${part.button}: ${part.href}`,
    )
    .join("\n\n");
  // Bold markers (**x**) become <strong> in HTML and plain text in the text version.
  const inline = (s: string) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const html = parts
    .map((part) =>
      "p" in part
        ? `<p style="margin:0 0 16px">${inline(part.p)}</p>`
        : "strong" in part
          ? `<p style="margin:0 0 8px"><strong>${inline(part.strong)}</strong></p>`
          : "list" in part
            ? `<ul style="margin:0 0 16px;padding-left:20px">${part.list.map((l) => `<li style="margin:0 0 4px">${inline(l)}</li>`).join("")}</ul>`
            : `<p style="margin:0 0 20px"><a href="${escapeHtml(part.href)}" style="display:inline-block;background:#d2452a;color:#fffaf5;padding:12px 20px;border-radius:10px;font-weight:600;text-decoration:none">${escapeHtml(part.button)}</a></p>`,
    )
    .join("\n");
  return {
    subject,
    text: text.replace(/\*\*(.+?)\*\*/g, "$1"),
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.55;color:#1d1a16;max-width:560px">${html}</div>`,
  };
}

export type ConsentDetails = { username: string; approveUrl: string; faqUrl: string; daysLeft: number };

/** The parent consent email: different protections for ages 7 to 12 and 13 to 15. */
export function consentEmail(group: KidGroup, d: ConsentDetails): Message {
  const intro: Part[] = [
    { p: "Hello!" },
    { p: `Your child, **${d.username}**, has asked for permission to open up an account for Writt!` },
    { p: "Writt is a fanfiction website where you can write stories of your own fantasies and post them on the internet!" },
    { button: "Review and approve", href: d.approveUrl },
  ];
  const middle: Part[] =
    group === "YOUNGER"
      ? [
          { strong: `Because ${d.username} is under 13, their account will have these protections:` },
          {
            list: [
              "They will only see books rated for everyone.",
              "Comments are turned off.",
              "You approve every book before it’s posted.",
              "Their profile only shows their username, picture and books.",
              "They can’t follow or be followed by other users.",
              "Nobody can message them. They can only message the creator of Writt.",
            ],
          },
          { p: "You’ll get a free family account where you can see what they write and change any of these settings, pause the account, or delete it at any time." },
        ]
      : [
          { strong: `Because ${d.username} is between 13 and 15, their account will have these protections:` },
          {
            list: [
              "They will see books rated for everyone and for teens. Mature books are always blocked.",
              "Nobody can message them. They can only message the creator of Writt.",
            ],
          },
          { p: "They’ll be able to comment on books, post their own books, and follow other writers." },
          {
            p: "**Want stricter settings?** In your free family account, you can turn on extra protections at any time: turn off comments, approve every book before it’s posted, hide their profile details, or switch to the full set of protections for ages 7 to 12 in one click.",
          },
        ];
  const end: Part[] = [
    { p: `**If you don’t approve,** or don’t respond within ${days(d.daysLeft)}, the account and everything in it will be deleted.` },
    { p: `If you have any questions, check this link: ${d.faqUrl}` },
    { p: `This link expires in ${days(d.daysLeft)}. If you didn’t expect this email, you can ignore it. No account will be created.` },
    { p: SIGN_OFF },
  ];
  return render(`${d.username} wants to join Writt`, [...intro, ...middle, ...end]);
}

export type ConsentSmsDetails = { username: string; code: string; link: string; faqUrl: string; daysLeft: number };

export function consentSms(group: KidGroup, d: ConsentSmsDetails): string {
  return group === "YOUNGER"
    ? `Writt: Your child ${d.username} (under 13) asked to open a Writt account (a fanfiction website). Their account will have strict protections. To approve, enter code ${d.code} or visit ${d.link}. Questions: ${d.faqUrl}. Expires in ${days(d.daysLeft)}.`
    : `Writt: Your child ${d.username} (13-15) asked to open a Writt account (a fanfiction website). You can add extra protections anytime. To approve, enter code ${d.code} or visit ${d.link}. Questions: ${d.faqUrl}. Expires in ${days(d.daysLeft)}.`;
}

/** One-time sign-in link for a family account. */
export function familyLoginEmail(url: string): Message {
  return render("Your Writt family sign-in link", [
    { p: "Hello!" },
    { p: "Here’s your link to sign in to your Writt family account. It works once and expires in 30 minutes." },
    { button: "Sign in to Writt", href: url },
    { p: "If you didn’t ask for this, you can ignore this email." },
    { p: SIGN_OFF },
  ]);
}

/** A notice for a parent: a book reported or removed, an admin action, a birthday. */
export function parentNoticeEmail(n: { title: string; body: string; link: string }): Message {
  return render(n.title, [{ p: "Hello!" }, { p: n.body }, { button: "Open your family dashboard", href: n.link }, { p: SIGN_OFF }]);
}

/** A link to choose a new password. */
export function passwordResetEmail(url: string): Message {
  return render("Reset your Writt password", [
    { p: "Hello!" },
    { p: "Someone (hopefully you) asked to reset the password for your Writt account. Use the button below to choose a new one. It works once and expires in 1 hour." },
    { button: "Choose a new password", href: url },
    { p: "If you didn’t ask for this, you can ignore this email. Your password won’t change." },
    { p: SIGN_OFF },
  ]);
}
