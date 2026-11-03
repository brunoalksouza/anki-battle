import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Layers3,
  ShieldCheck,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import { api, exportFile } from "./offline";
import { Button, Field, LanguageSelect, ErrorText } from "./ui";
export default function Auth({ onLogin }: { onLogin: (id: string) => void }) {
  const [mode, setMode] = useState<"login" | "register" | "recover">("login"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [account, setAccount] = useState("");
  const [native, setNative] = useState("en"),
    [study, setStudy] = useState("en");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError("");
    setBusy(true);
    try {
      const data = await api("/auth/" + mode, "POST", {
        email: form.get("email"),
        password: form.get("password"),
        ...(mode === "register"
          ? {
              nickname: form.get("nickname"),
              nativeLang: native,
              studyLang: study,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }
          : {}),
        ...(mode === "recover" ? { code: form.get("code") } : {}),
      });
      if (data.recoveryCodes) {
        setCodes(data.recoveryCodes);
        setAccount(data.user.id);
      } else onLogin(data.user.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <span className="brand-icon">
          <Layers3 size={24} />
        </span>
        Anki <b>Battle</b>
      </div>
      <div className="auth-layout">
        <div className="auth-story">
          <span className="eyebrow">
            <Sparkles size={14} /> A LITTLE EVERY DAY
          </span>
          <h1>
            Learning feels good.
            <br />
            <span>Remembering feels better.</span>
          </h1>
          <p>
            Your words, your pace. Turn small moments into lasting knowledge.
          </p>
          <div className="auth-art" aria-hidden="true">
            <div className="art-card back">あ</div>
            <div className="art-card middle">Aa</div>
            <div className="art-card front">
              <span>A NEW CONNECTION</span>
              <strong>remember</strong>
              <small>to keep something in your memory</small>
              <div className="art-dots">
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
          <div className="auth-features">
            <span>Spaced repetition</span>
            <span>Offline study</span>
            <span>Challenges with friends</span>
          </div>
        </div>
        <div className="auth-form-card">
          {codes.length ? (
            <>
              <span className="success-icon">
                <ShieldCheck />
              </span>
              <h2>Your space is ready.</h2>
              <p>
                Save these codes. Each can restore access once if you forget
                your password. Email recovery is not available.
              </p>
              <div className="recovery-codes">
                {codes.map((c) => (
                  <code key={c}>{c}</code>
                ))}
              </div>
              <Button
                variant="secondary full"
                onClick={() =>
                  exportFile(
                    "anki-battle-recovery.txt",
                    codes.join("\n"),
                    "text/plain",
                  )
                }
              >
                Download recovery codes
              </Button>
              <Button className="full" onClick={() => onLogin(account)}>
                Saved. Let's get started
                <ArrowRight size={18} />
              </Button>
            </>
          ) : (
            <>
              <span className="eyebrow">YOUR NEXT LEVEL STARTS HERE</span>
              <h2>
                {mode === "register"
                  ? "Build the habit."
                  : mode === "recover"
                    ? "Let's recover your account."
                    : "Welcome back."}
              </h2>
              <p>
                {mode === "register"
                  ? "One account for everything you learn."
                  : mode === "recover"
                    ? "Use a recovery code you saved when you created your account."
                    : "Sign in and pick up where you left off."}
              </p>
              <form onSubmit={submit}>
                {mode === "register" && (
                  <Field label="What should we call you?">
                    <input
                      name="nickname"
                      required
                      minLength={2}
                      maxLength={30}
                      placeholder="Your nickname"
                      autoComplete="nickname"
                    />
                  </Field>
                )}
                <Field
                  label={mode === "register" ? "Email" : "Username or email"}
                >
                  <input
                    type={mode === "register" ? "email" : "text"}
                    name="email"
                    required
                    placeholder={
                      mode === "register"
                        ? "you@example.com"
                        : "Your Finance username or email"
                    }
                    autoComplete="username"
                  />
                </Field>
                {mode === "recover" && (
                  <Field label="Recovery code">
                    <input name="code" required autoComplete="off" />
                  </Field>
                )}
                <Field
                  label={mode === "recover" ? "New password" : "Password"}
                  hint={
                    mode !== "login" ? "At least 10 characters." : undefined
                  }
                >
                  <input
                    type="password"
                    name="password"
                    required
                    minLength={mode === "login" ? 1 : 10}
                    maxLength={200}
                    placeholder="Your password"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                  />
                </Field>
                {mode === "register" && (
                  <div className="form-grid">
                    <Field label="My native language">
                      <LanguageSelect value={native} onChange={setNative} />
                    </Field>
                    <Field label="I want to study">
                      <LanguageSelect value={study} onChange={setStudy} />
                    </Field>
                  </div>
                )}
                <ErrorText error={error} />
                <Button type="submit" busy={busy} className="full">
                  {mode === "register"
                    ? "Create my account"
                    : mode === "recover"
                      ? "Reset password"
                      : "Sign in"}
                  <ArrowRight size={18} />
                </Button>
              </form>
              {mode === "login" ? (
                <>
                  <button
                    className="text-button centered"
                    onClick={() => {
                      setMode("recover");
                      setError("");
                    }}
                  >
                    Forgot password?
                  </button>
                  <div className="auth-switch">
                    New here?{" "}
                    <button
                      onClick={() => {
                        setMode("register");
                        setError("");
                      }}
                    >
                      Create account
                    </button>
                  </div>
                </>
              ) : (
                <button
                  className="text-button centered"
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                >
                  <ArrowLeft size={15} />
                  Back to sign in
                </button>
              )}
              <small className="privacy-note">
                <ShieldCheck size={14} /> Your decks are private. You choose
                what to share.
              </small>
            </>
          )}
        </div>
      </div>
      <footer className="auth-footer">
        ANKI BATTLE <span>Made for learning, one day at a time.</span>
      </footer>
    </div>
  );
}
