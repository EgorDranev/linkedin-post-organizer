import { SignIn } from "@clerk/react";

// Skins Clerk's prebuilt widget to match the app's design tokens and hides
// its own header, since the page already shows a headline above the card.
const clerkAppearance = {
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", boxShadow: "var(--shadow-lg)" },
    card: {
      width: "100%",
      border: "1px solid var(--line)",
      borderRadius: "var(--r-lg)",
      boxShadow: "none",
    },
    header: { display: "none" },
    footer: { background: "transparent", boxShadow: "none" },
  },
  variables: {
    colorPrimary: "#0a66c2",
    colorText: "#1a1d21",
    colorTextSecondary: "#767f8b",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: "#1a1d21",
    colorDanger: "#d6453d",
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: "0.9375rem",
    borderRadius: "8px",
  },
};

export function AuthScreen() {
  return (
    <main className="auth-shell">
      <div className="auth-inner">
        <section className="auth-copy">
          <span className="brand-mark auth-brand-mark" aria-hidden="true">in</span>
          <h1>Your saved posts, finally findable.</h1>
          <p>Enter your email and we’ll send a secure sign-in link.</p>
        </section>
        <SignIn routing="hash" appearance={clerkAppearance} />
      </div>
    </main>
  );
}
