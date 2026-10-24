import "server-only";

// Outgoing text messages. Today this only writes to the server log. To send
// real texts, write a class that implements SmsSender (e.g. with Twilio's API)
// and return it from sender().

export interface SmsSender {
  send(to: string, body: string): Promise<void>;
}

/** Stand-in: the text goes to the server log instead of a phone. */
class LogSms implements SmsSender {
  async send(to: string, body: string) {
    console.info(`\n[sms, not sent: no SMS provider set up]\nTo: ${to}\n${body}\n`);
  }
}

function sender(): SmsSender {
  return new LogSms();
}

/**
 * Whether texts really reach phones. False until a real provider (e.g. Twilio)
 * is plugged in above; until then the parent step only offers email.
 */
export function smsAvailable(): boolean {
  return false;
}

/** Sends a text. Failures are logged and reported as false, never thrown. */
export async function sendSms(to: string, body: string): Promise<boolean> {
  try {
    await sender().send(to, body);
    return true;
  } catch (error) {
    console.error("sendSms failed", error);
    return false;
  }
}
