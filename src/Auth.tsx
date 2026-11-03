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
  const [native, setNative] = useState("pt"),
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
      setError(e instanceof Error ? e.message : "Falha de conexão.");
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
            <Sparkles size={14} /> UM POUCO TODOS OS DIAS
          </span>
          <h1>
            Aprender é bom.
            <br />
            <span>Lembrar é melhor.</span>
          </h1>
          <p>
            Suas palavras, no seu ritmo. Transforme pequenos momentos em
            conhecimento que fica.
          </p>
          <div className="auth-art" aria-hidden="true">
            <div className="art-card back">あ</div>
            <div className="art-card middle">Aa</div>
            <div className="art-card front">
              <span>UMA NOVA CONEXÃO</span>
              <strong>remember</strong>
              <small>lembrar · guardar na memória</small>
              <div className="art-dots">
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
          <div className="auth-features">
            <span>Repetição espaçada</span>
            <span>Estudo offline</span>
            <span>Desafios entre amigos</span>
          </div>
        </div>
        <div className="auth-form-card">
          {codes.length ? (
            <>
              <span className="success-icon">
                <ShieldCheck />
              </span>
              <h2>Seu espaço está pronto.</h2>
              <p>
                Guarde estes códigos. Cada um recupera seu acesso uma única vez,
                se você esquecer a senha. Não enviamos recuperação por e-mail.
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
                    "anki-battle-recuperacao.txt",
                    codes.join("\n"),
                    "text/plain",
                  )
                }
              >
                Baixar códigos de recuperação
              </Button>
              <Button className="full" onClick={() => onLogin(account)}>
                Guardei. Vamos começar
                <ArrowRight size={18} />
              </Button>
            </>
          ) : (
            <>
              <span className="eyebrow">SEU PRÓXIMO NÍVEL COMEÇA AQUI</span>
              <h2>
                {mode === "register"
                  ? "Crie o hábito."
                  : mode === "recover"
                    ? "Vamos recuperar seu acesso."
                    : "Bom ter você de volta."}
              </h2>
              <p>
                {mode === "register"
                  ? "Uma conta, todos os seus aprendizados."
                  : mode === "recover"
                    ? "Use um dos códigos guardados ao criar sua conta."
                    : "Entre e continue de onde parou."}
              </p>
              <form onSubmit={submit}>
                {mode === "register" && (
                  <Field label="Como você quer ser chamado?">
                    <input
                      name="nickname"
                      required
                      minLength={2}
                      maxLength={30}
                      placeholder="Seu apelido"
                      autoComplete="nickname"
                    />
                  </Field>
                )}
                <Field
                  label={mode === "register" ? "E-mail" : "Usuário ou e-mail"}
                >
                  <input
                    type={mode === "register" ? "email" : "text"}
                    name="email"
                    required
                    placeholder={
                      mode === "register"
                        ? "voce@exemplo.com"
                        : "Seu usuário do Financeiro ou e-mail"
                    }
                    autoComplete="username"
                  />
                </Field>
                {mode === "recover" && (
                  <Field label="Código de recuperação">
                    <input name="code" required autoComplete="off" />
                  </Field>
                )}
                <Field
                  label={mode === "recover" ? "Nova senha" : "Senha"}
                  hint={
                    mode !== "login" ? "Pelo menos 10 caracteres." : undefined
                  }
                >
                  <input
                    type="password"
                    name="password"
                    required
                    minLength={mode === "login" ? 1 : 10}
                    maxLength={200}
                    placeholder="Sua senha"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                  />
                </Field>
                {mode === "register" && (
                  <div className="form-grid">
                    <Field label="Meu idioma">
                      <LanguageSelect value={native} onChange={setNative} />
                    </Field>
                    <Field label="Quero estudar">
                      <LanguageSelect value={study} onChange={setStudy} />
                    </Field>
                  </div>
                )}
                <ErrorText error={error} />
                <Button type="submit" busy={busy} className="full">
                  {mode === "register"
                    ? "Criar minha conta"
                    : mode === "recover"
                      ? "Redefinir senha"
                      : "Entrar"}
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
                    Esqueci minha senha
                  </button>
                  <div className="auth-switch">
                    Primeira vez aqui?{" "}
                    <button
                      onClick={() => {
                        setMode("register");
                        setError("");
                      }}
                    >
                      Criar conta
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
                  Voltar para entrar
                </button>
              )}
              <small className="privacy-note">
                <ShieldCheck size={14} /> Seus baralhos são privados.
                Compartilhar é uma escolha.
              </small>
            </>
          )}
        </div>
      </div>
      <footer className="auth-footer">
        ANKI BATTLE <span>Feito para aprender, um dia de cada vez.</span>
      </footer>
    </div>
  );
}
