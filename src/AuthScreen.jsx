import { SignIn } from "@clerk/react";

export function AuthScreen() {
  return (
    <main className="auth-shell">
      <section className="auth-copy">
        <span className="brand-mark" aria-hidden="true">in</span>
        <h1>Your saved posts, finally findable.</h1>
        <p>Enter your email and we’ll send a secure sign-in link.</p>
      </section>
      <SignIn routing="hash" />
    </main>
  );
}
