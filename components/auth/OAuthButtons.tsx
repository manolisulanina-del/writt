import { oauthSignInAction } from "@/actions/auth";
import { oauthProviders, type OAuthProviderId } from "@/lib/config";
import { buttonClass } from "@/components/ui/Button";

const LABELS: Record<OAuthProviderId, string> = {
  google: "Google",
  facebook: "Facebook",
  apple: "Apple",
  instagram: "Instagram",
};

function ProviderIcon({ id }: { id: OAuthProviderId }) {
  const common = { className: "size-5", "aria-hidden": true, viewBox: "0 0 24 24" } as const;
  switch (id) {
    case "google":
      return (
        <svg {...common}>
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.2 3.5-8.8Z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...common}>
          <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4h-3V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12Z" />
        </svg>
      );
    case "apple":
      return (
        <svg {...common} fill="currentColor">
          <path d="M16.4 12.7c0-2.6 2.1-3.8 2.2-3.9a4.8 4.8 0 0 0-3.8-2c-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9a5 5 0 0 0-4.2 2.6c-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.6 1.2-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.3 3-2.5.9-1.4 1.3-2.7 1.3-2.8 0 0-2.6-1-2.6-4ZM13.9 5.1c.7-.8 1.1-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4Z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common} fill="none" stroke="#E1306C" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="#E1306C" />
        </svg>
      );
  }
}

/** One button per configured provider. Providers without keys are hidden. */
export function OAuthButtons({ callbackUrl }: { callbackUrl?: string }) {
  const enabled = (Object.keys(oauthProviders) as OAuthProviderId[]).filter((id) => oauthProviders[id]);
  if (enabled.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {enabled.map((id) => (
          <form key={id} action={oauthSignInAction}>
            <input type="hidden" name="provider" value={id} />
            {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
            <button type="submit" className={buttonClass("secondary", "lg", "w-full")}>
              <ProviderIcon id={id} />
              {LABELS[id]}
            </button>
          </form>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs font-semibold tracking-widest text-ink-soft uppercase">
        <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
