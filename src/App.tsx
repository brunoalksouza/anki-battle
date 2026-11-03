import { useCallback, useEffect, useState } from "react";
import {
  Home,
  Layers3,
  BookOpen,
  LibraryBig,
  Swords,
  UserRound,
  CloudCheck,
  CloudOff,
  RefreshCw,
  ChevronRight,
  Plus,
  X,
  WifiOff,
  AlertCircle,
  Smartphone,
  ArrowUp,
  Share,
  Check,
  Download,
} from "lucide-react";
import { AppContext } from "./context";
import Auth from "./Auth";
import Dashboard from "./Dashboard";
import Study from "./Study";
import Words, { WordEditor, DeckEditor, WordDetail } from "./Words";
import Battles from "./Battles";
import Profile from "./Profile";
import { Modal, Button, ErrorText, langName, fmt } from "./ui";
import {
  api,
  activeId,
  setActive,
  loadLocal,
  saveLocal,
  clearLocal,
  overlay,
  syncAccount,
  enqueue,
  exportFile,
  APIError,
  updateLocal,
  type Local,
} from "./offline";
import type { Snapshot, Word, ReviewAction } from "../shared/model";
type Dialog = { kind: "word" | "deck" | "detail"; id?: string } | null;
export default function App() {
  const [local, setLocal] = useState<Local | null>(null),
    [loading, setLoading] = useState(true),
    [loggedOut, setLoggedOut] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [syncing, setSyncing] = useState(false),
    [page, setPage] = useState("home"),
    [studyDeck, setStudyDeck] = useState<string | undefined>(),
    [dialog, setDialog] = useState<Dialog>(null),
    [message, setMessage] = useState(""),
    [install, setInstall] = useState(false),
    [installPrompt, setInstallPrompt] = useState<any>(null),
    [conflicts, setConflicts] = useState(false),
    [update, setUpdate] = useState<ServiceWorker | null>(null);
  const toast = useCallback((s: string) => setMessage(s), []);
  async function refresh() {
    const id = activeId();
    if (!id) return;
    const cached = await loadLocal(id);
    if (cached) setLocal(cached);
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const result = await syncAccount(id);
      if (activeId() === id) setLocal(result);
      setOnline(true);
    } catch (e) {
      if (e instanceof APIError && e.status === 401) setLoggedOut(true);
      else if (!(e instanceof APIError)) {
        setOnline(false);
        toast(
          "Sem conexão com o servidor. Suas alterações continuam neste aparelho.",
        );
      } else toast((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }
  async function login(id: string) {
    setActive(id);
    const snapshot = await api<Snapshot>("/state");
    const existing = await loadLocal(id),
      next = {
        snapshot,
        downloaded: existing?.downloaded || [],
        pending: existing?.pending || [],
        lastSync: new Date().toISOString(),
      };
    await saveLocal(next);
    setLocal(next);
    setLoggedOut(false);
    setPage("home");
    await refresh();
  }
  useEffect(() => {
    let alive = true;
    const init = async () => {
      const id = activeId();
      if (id) {
        const c = await loadLocal(id);
        if (c && alive) setLocal(c);
      }
      if (navigator.onLine) {
        try {
          const snapshot = await api<Snapshot>("/state");
          const id = snapshot.user.id;
          setActive(id);
          const c = await loadLocal(id),
            next = {
              snapshot,
              downloaded: c?.downloaded || [],
              pending: c?.pending || [],
              lastSync: new Date().toISOString(),
            };
          await saveLocal(next);
          if (alive) setLocal(next);
          await api("/access", "POST", {});
          await refresh();
        } catch (e) {
          if (e instanceof APIError && e.status === 401 && alive)
            setLoggedOut(true);
          else if (!(e instanceof APIError) && alive) setOnline(false);
        }
      }
      if (alive) setLoading(false);
    };
    void init();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const on = () => {
        setOnline(true);
        void refresh();
      },
      off = () => setOnline(false),
      changed = () => {
        const id = activeId();
        if (id)
          void loadLocal(id).then((c) => {
            if (c && activeId() === id) setLocal(c);
          });
      };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("anki-local", changed);
    const show = () => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine &&
        activeId()
      )
        void refresh();
    };
    document.addEventListener("visibilitychange", show);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("anki-local", changed);
      document.removeEventListener("visibilitychange", show);
    };
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 7000);
    return () => clearTimeout(t);
  }, [message]);
  useEffect(() => {
    const listener = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", listener);
    if ("serviceWorker" in navigator && import.meta.env.PROD)
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          if (reg.waiting) setUpdate(reg.waiting);
          reg.addEventListener("updatefound", () => {
            const w = reg.installing;
            w?.addEventListener("statechange", () => {
              if (w.state === "installed" && navigator.serviceWorker.controller)
                setUpdate(w);
            });
          });
        })
        .catch(() =>
          toast(
            "Não foi possível ativar o modo offline. Tente abrir o app novamente.",
          ),
        );
    return () => window.removeEventListener("beforeinstallprompt", listener);
  }, []);
  const s = local ? overlay(local.snapshot, local.pending) : null;
  useEffect(() => {
    const theme = s?.user.theme || "system";
    const mq = matchMedia("(prefers-color-scheme: dark)"),
      apply = () =>
        (document.documentElement.dataset.theme =
          theme === "system" ? (mq.matches ? "dark" : "light") : theme);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [s?.user.theme]);
  const close = useCallback(() => setDialog(null), []);
  async function saveWord(word: Word, edit: boolean) {
    const id = activeId()!;
    const clean = { ...word, tags: word.tags.filter(Boolean) };
    await enqueue(id, {
      id: crypto.randomUUID(),
      kind: edit ? "edit" : "create",
      word: clean,
    });
    await refresh();
    const after = await loadLocal(id);
    const pending = after?.pending.find((p) => p.word?.id === word.id);
    if (pending?.error) throw new Error(pending.error);
    const saved = after?.snapshot.words.find((w) => w.id === word.id) || clean;
    toast(
      pending
        ? "Palavra salva neste aparelho. Sincronização pendente."
        : "Palavra salva.",
    );
    if (navigator.onLine && !saved.sentence && !pending) {
      void api("/words/" + word.id + "/suggest", "POST", { another: false })
        .then(() => refresh())
        .catch(() =>
          toast(
            "Palavra salva. A frase está pendente; tente novamente nos detalhes.",
          ),
        );
    }
    return saved;
  }
  async function review(r: ReviewAction) {
    await enqueue(activeId()!, { id: r.id, kind: "review", review: r });
    const latest = await loadLocal(activeId()!);
    if (latest) setLocal(latest);
    if (navigator.onLine) void refresh();
  }
  function navigate(p: string) {
    setPage(p);
    setStudyDeck(undefined);
    window.scrollTo({ top: 0 });
  }
  function study(deck?: string) {
    setStudyDeck(deck);
    setPage("study");
    window.scrollTo({ top: 0 });
  }
  async function logout() {
    if (local?.pending.length) {
      toast(
        "Há ações pendentes. Sincronize ou resolva os conflitos antes de sair para preservar seu trabalho.",
      );
      setConflicts(true);
      return;
    }
    try {
      if (!navigator.onLine) {
        toast("Conecte-se para encerrar a sessão com segurança.");
        return;
      }
      await api("/auth/logout", "POST", {});
      if (activeId()) await clearLocal(activeId()!);
      setLocal(null);
      setLoggedOut(true);
    } catch (e) {
      toast((e as Error).message);
    }
  }
  if (loading && !s)
    return (
      <div className="app-loading">
        <span className="brand-icon">
          <Layers3 size={30} />
        </span>
        <h2>Seu próximo nível está chegando.</h2>
        <RefreshCw className="spin muted" size={20} />
      </div>
    );
  if (!s || !local || loggedOut)
    return (
      <>
        <Auth onLogin={(id) => void login(id).catch((e) => toast(e.message))} />
        {message && (
          <div className="toast" role="alert">
            {message}
          </div>
        )}
      </>
    );
  const nav = [
    { id: "home", label: "Início", icon: Home },
    { id: "study", label: "Estudar", icon: Layers3 },
    { id: "words", label: "Palavras", icon: LibraryBig },
    { id: "battles", label: "Batalhas", icon: Swords },
    { id: "profile", label: "Perfil", icon: UserRound },
  ];
  const context = {
    s,
    local,
    online,
    syncing,
    refresh,
    toast,
    saveWord,
    review,
    openWord: (id?: string) => setDialog({ kind: "word", id }),
    openDeck: (id?: string) => setDialog({ kind: "deck", id }),
    detail: (id: string) => setDialog({ kind: "detail", id }),
    study,
    navigate,
  };
  return (
    <AppContext.Provider value={context}>
      <div className="app-shell">
        <aside className="sidebar">
          <button className="brand" onClick={() => navigate("home")}>
            <span className="brand-icon">
              <Layers3 size={23} />
            </span>
            <span>
              Anki <b>Battle</b>
              <small>LEARN. REMEMBER. GROW.</small>
            </span>
          </button>
          <span className="nav-caption">SEU UNIVERSO</span>
          <nav aria-label="Navegação principal">
            {nav.map((n) => (
              <button
                key={n.id}
                className={page === n.id ? "active" : ""}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={20} />
                {n.label}
                {page === n.id && <span className="nav-active-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-tip">
              <span>✦</span>
              <p>
                O conhecimento cresce
                <br />
                um dia de cada vez.
              </p>
            </div>
            <button
              className="sidebar-user"
              onClick={() => navigate("profile")}
            >
              <span className="avatar">{s.user.avatar}</span>
              <div>
                <strong>{s.user.nickname}</strong>
                <small>Seu espaço de estudo</small>
              </div>
              <ChevronRight size={16} />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <span>Anki Battle</span>
              <ChevronRight size={13} />
              <strong>{nav.find((n) => n.id === page)?.label}</strong>
            </div>
            <div className="topbar-right">
              <button
                className={"sync-status " + (!online ? "offline" : "")}
                onClick={() =>
                  local.pending.some((p) => p.error)
                    ? setConflicts(true)
                    : void refresh()
                }
                title="Verificar sincronização"
              >
                {syncing ? (
                  <RefreshCw size={15} className="spin" />
                ) : !online ? (
                  <CloudOff size={16} />
                ) : local.pending.length ? (
                  <RefreshCw size={16} />
                ) : (
                  <CloudCheck size={16} />
                )}
                <span>
                  {syncing
                    ? "Sincronizando"
                    : !online
                      ? "Offline"
                      : local.pending.length
                        ? `${local.pending.length} pendentes`
                        : "Tudo sincronizado"}
                </span>
              </button>
              <span className="topbar-divider" />
              <span className="topbar-date">
                {new Date().toLocaleDateString("pt-BR", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
              <button
                className="avatar small"
                aria-label="Abrir perfil"
                onClick={() => navigate("profile")}
              >
                {s.user.avatar}
              </button>
            </div>
          </header>
          {!online && (
            <div className="offline-banner">
              <WifiOff size={15} />
              Sem conexão. Seu estudo continua nos baralhos baixados.
            </div>
          )}
          {local.pending.some((p) => p.error) && (
            <button
              className="conflict-banner"
              onClick={() => setConflicts(true)}
            >
              <AlertCircle size={16} />
              Há ações que precisam de atenção. Ver rascunhos preservados
              <ChevronRight size={15} />
            </button>
          )}
          {update && page !== "study" && (
            <div className="update-banner">
              Uma nova versão está pronta.
              <Button
                variant="small secondary"
                disabled={!!local.pending.length}
                onClick={() => {
                  update.postMessage({ type: "ACTIVATE" });
                  navigator.serviceWorker.addEventListener(
                    "controllerchange",
                    () => location.reload(),
                    { once: true },
                  );
                }}
              >
                Atualizar agora
              </Button>
              <button
                className="icon-button"
                onClick={() => setUpdate(null)}
                aria-label="Atualizar depois"
              >
                <X size={16} />
              </button>
            </div>
          )}
          <main id="main-content" key={page}>
            {page === "home" ? (
              <Dashboard />
            ) : page === "study" ? (
              <Study initialDeck={studyDeck} />
            ) : page === "words" ? (
              <Words />
            ) : page === "battles" ? (
              <Battles />
            ) : (
              <Profile onLogout={logout} onInstall={() => setInstall(true)} />
            )}
          </main>
          <footer className="app-footer">
            <span>Pequenos passos. Conhecimento que fica.</span>
            <span>
              ANKI BATTLE <i>✦</i>
            </span>
          </footer>
        </div>
        <nav className="bottom-nav" aria-label="Navegação móvel">
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              onClick={() => navigate(n.id)}
              aria-current={page === n.id ? "page" : undefined}
            >
              <n.icon size={22} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
      </div>
      {dialog?.kind === "word" && (
        <WordEditor
          key={dialog.id || "new"}
          wordId={dialog.id}
          onClose={close}
          onDone={(id) => setDialog({ kind: "detail", id })}
        />
      )}{" "}
      {dialog?.kind === "deck" && (
        <DeckEditor
          key={dialog.id || "new"}
          deckId={dialog.id}
          onClose={close}
        />
      )}{" "}
      {dialog?.kind === "detail" && dialog.id && (
        <WordDetail
          id={dialog.id}
          onClose={close}
          onEdit={() => setDialog({ ...dialog, kind: "word" })}
        />
      )}{" "}
      {message && (
        <div className="toast" role="status">
          {message}
          <button onClick={() => setMessage("")} aria-label="Fechar mensagem">
            <X size={16} />
          </button>
        </div>
      )}
      {install && (
        <Modal
          title="Seu estudo, sempre por perto"
          onClose={() => setInstall(false)}
        >
          <div className="install-icon">
            <Smartphone size={40} />
          </div>
          <h3>Adicione à tela inicial.</h3>
          {installPrompt ? (
            <Button
              onClick={async () => {
                await installPrompt.prompt();
                const choice = await installPrompt.userChoice;
                if (choice.outcome === "accepted")
                  toast("Instalação solicitada ao navegador.");
                setInstallPrompt(null);
              }}
            >
              Instalar Anki Battle
              <Download size={17} />
            </Button>
          ) : (
            <>
              <p>
                <strong>iPhone / iPad:</strong> abra no Safari, toque em
                Compartilhar e escolha “Adicionar à Tela de Início”.
              </p>
              <p>
                <strong>Android:</strong> abra no Chrome, toque no menu ⋮ e
                escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.
              </p>
            </>
          )}
          <p>
            Depois, em Estudar, toque em Baixar no baralho que você quer usar
            sem internet. O navegador controla o espaço disponível neste
            dispositivo.
          </p>
          <p className="footnote">
            Batalhas e buscas externas precisam de conexão. O aplicativo não
            consegue confirmar a instalação no sistema por você.
          </p>
        </Modal>
      )}
      {conflicts && (
        <Modal
          title="Seu trabalho está preservado"
          onClose={() => setConflicts(false)}
        >
          <p>{local.pending.length} ações aguardam sincronização.</p>
          {local.pending.map((p) => (
            <div className="pending-row" key={p.id}>
              <strong>{p.word?.term || "Revisão de card"}</strong>
              <p>{p.error || "Aguardando conexão."}</p>
              {p.word && p.error && (
                <>
                  <p>Seu rascunho: {p.word.meaning}</p>
                  <p>
                    Servidor:{" "}
                    {local.snapshot.words.find((w) => w.id === p.word?.id)
                      ?.meaning || "Não encontrado"}
                  </p>
                  <Button
                    variant="secondary small"
                    onClick={async () => {
                      const latest = await api<Snapshot>("/state");
                      const serverWord = latest.words.find(
                        (w) => w.id === p.word?.id,
                      );
                      if (!serverWord) {
                        toast(
                          "A palavra foi removida. Exporte o rascunho para recuperá-lo.",
                        );
                        return;
                      }
                      await updateLocal(s.user.id, (l) => ({
                        ...l,
                        pending: l.pending.map((x) =>
                          x.id === p.id
                            ? {
                                ...x,
                                id: crypto.randomUUID(),
                                error: undefined,
                                word: {
                                  ...x.word!,
                                  version: serverWord.version,
                                },
                              }
                            : x,
                        ),
                      }));
                      await refresh();
                    }}
                  >
                    Aplicar meu rascunho
                  </Button>
                </>
              )}
              {p.error && (
                <Button
                  variant="ghost small"
                  onClick={async () => {
                    await updateLocal(s.user.id, (l) => ({
                      ...l,
                      pending: l.pending.map((x) =>
                        x.id === p.id ? { ...x, error: undefined } : x,
                      ),
                    }));
                    await refresh();
                  }}
                >
                  Tentar sincronizar
                </Button>
              )}
              {p.error && (
                <Button
                  variant="ghost small"
                  onClick={async () => {
                    exportFile(
                      "anki-rascunho-" + p.id + ".json",
                      JSON.stringify(p, null, 2),
                    );
                    await updateLocal(s.user.id, (l) => ({
                      ...l,
                      pending: l.pending.filter((x) => x.id !== p.id),
                    }));
                    toast(
                      "Cópia do rascunho exportada. A versão do servidor foi mantida.",
                    );
                  }}
                >
                  Exportar rascunho e manter servidor
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              exportFile(
                "anki-battle-pendencias.json",
                JSON.stringify(local.pending, null, 2),
              )
            }
          >
            Exportar cópia das pendências
          </Button>
          <Button onClick={() => refresh()} disabled={!online || syncing}>
            Sincronizar agora
          </Button>
        </Modal>
      )}
    </AppContext.Provider>
  );
}
