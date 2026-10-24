// Shared by the client strength meter and server-side validation.

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too weak" | "Weak" | "Okay" | "Strong" | "Very strong";
  problems: string[];
};

const COMMON = [
  "password",
  "123456",
  "qwerty",
  "letmein",
  "welcome",
  "iloveyou",
  "admin",
  "abc123",
  "monkey",
  "dragon",
];

export const MIN_PASSWORD_LENGTH = 8;

export function checkPasswordStrength(
  password: string,
  context: string[] = [],
): PasswordStrength {
  const problems: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes < 3) {
    problems.push("Mix at least three of: lowercase, uppercase, numbers, symbols.");
  }

  const lower = password.toLowerCase();
  if (COMMON.some((word) => lower.includes(word))) {
    problems.push("Avoid common words like “password” or “123456”.");
  }
  for (const item of context) {
    const part = item.toLowerCase().split("@")[0];
    if (part.length >= 3 && lower.includes(part)) {
      problems.push("Don’t include your username or email.");
      break;
    }
  }
  if (/(.)\1{3,}/.test(password)) {
    problems.push("Avoid repeating the same character.");
  }

  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score++;
  if (password.length >= 12) score++;
  if (classes >= 3) score++;
  if (classes === 4 || password.length >= 16) score++;
  if (problems.length > 0) score = Math.min(score, 1);

  const labels = ["Too weak", "Weak", "Okay", "Strong", "Very strong"] as const;
  return { score: score as PasswordStrength["score"], label: labels[score], problems };
}
