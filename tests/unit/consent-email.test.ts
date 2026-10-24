import { describe, expect, it } from "vitest";
import { consentEmail, consentSms } from "@/lib/email-templates";
import { kidGroupFor } from "@/lib/kids";

const yearsAgo = (years: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear() - years, d.getUTCMonth(), d.getUTCDate() - 2));
};
const details = { username: "mira", approveUrl: "https://writt.example/approve/abc", faqUrl: "https://writt.example/parents", daysLeft: 7 };

/** What lib/consent.ts sends: the email for the child's group. */
const emailFor = (birthDate: Date) => consentEmail(kidGroupFor(birthDate)!, details);

describe("parent consent email", () => {
  it.each([7, 9, 12])("a %i-year-old's parent gets the email for ages 7 to 12", (age) => {
    const email = emailFor(yearsAgo(age));
    expect(email.subject).toBe("mira wants to join Writt");
    expect(email.text).toContain("Because mira is under 13, their account will have these protections:");
    expect(email.text).toContain("You approve every book before it’s posted.");
    expect(email.text).toContain("They can’t follow or be followed by other users.");
    expect(email.text).not.toContain("between 13 and 15");
  });

  it.each([13, 14, 15])("a %i-year-old's parent gets the email for ages 13 to 15", (age) => {
    const email = emailFor(yearsAgo(age));
    expect(email.subject).toBe("mira wants to join Writt");
    expect(email.text).toContain("Because mira is between 13 and 15, their account will have these protections:");
    expect(email.text).toContain("Mature books are always blocked.");
    expect(email.text).toContain("Want stricter settings?");
    expect(email.text).not.toContain("under 13");
  });

  it("links to the approval page and the parents' page, and is signed by the creator", () => {
    for (const group of ["YOUNGER", "OLDER"] as const) {
      const email = consentEmail(group, details);
      expect(email.text).toContain(details.approveUrl);
      expect(email.text).toContain(details.faqUrl);
      expect(email.text).toContain("This link expires in 7 days.");
      expect(email.text.trim().endsWith("— The creator of Writt")).toBe(true);
      expect(email.html).toContain(`href="${details.approveUrl}"`);
    }
  });

  it("escapes the username in the HTML version", () => {
    const email = consentEmail("YOUNGER", { ...details, username: "<b>x</b>" });
    expect(email.html).not.toContain("<b>x</b>");
    expect(email.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("has a text version for each group", () => {
    const sms = { username: "mira", code: "123456", link: "https://writt.example/a/abc", faqUrl: details.faqUrl, daysLeft: 7 };
    expect(consentSms("YOUNGER", sms)).toContain("(under 13)");
    expect(consentSms("YOUNGER", sms)).toContain("strict protections");
    expect(consentSms("OLDER", sms)).toContain("(13-15)");
    expect(consentSms("OLDER", sms)).toContain("enter code 123456");
  });
});
