import "server-only";

// Outgoing email. Sends through Resend when RESEND_API_KEY is set; otherwise
// writes the message to the server log, so everything works before a key is added.

export type Email = { to: string; subject: string; text: string; html: string };

export interface EmailSender {
  send(email: Email): Promise<void>;
}

/** Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
class ResendSender implements EmailSender {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send(email: Email) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
    });
    if (!res.ok) throw new Error(`Resend refused the email (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
}

/** Stand-in until a key is set: the email goes to the server log instead. */
class LogSender implements EmailSender {
  async send(email: Email) {
    console.info(`\n[email, not sent: set RESEND_API_KEY to send]\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n`);
  }
}

function sender(): EmailSender {
  const key = process.env.RESEND_API_KEY?.trim();
  return key ? new ResendSender(key, process.env.EMAIL_FROM?.trim() || "Writt <onboarding@resend.dev>") : new LogSender();
}

/** Sends an email. Failures are logged and reported as false, never thrown, so a page action still completes. */
export async function sendEmail(email: Email): Promise<boolean> {
  try {
    await sender().send(email);
    return true;
  } catch (error) {
    console.error("sendEmail failed", error);
    return false;
  }
}
