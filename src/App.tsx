import { useCallback, useEffect, useState } from "react";
import {
  Home,
  Layers3,
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
import BrandMark from "./BrandMark";
import Dashboard from "./Dashboard";
import Study from "./Study";
import Words, { WordEditor, DeckEditor, WordDetail } from "./Words";
import Battles from "./Battles";
import Profile from "./Profile";
import { Avatar, Modal, Button, ErrorText, langName, fmt } from "./ui";
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
          "Cannot reach the server. Your changes are saved on this device.",
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
          toast("Could not enable offline mode. Try reopening the app."),
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
      pending ? "Word saved on this device. Waiting to sync." : "Word saved.",
    );
    if (navigator.onLine && !saved.sentence && !pending) {
      void api("/words/" + word.id + "/suggest", "POST", { another: false })
        .then(() => refresh())
        .catch(() =>
          toast(
            "Word saved. The example is pending; try again in word details.",
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
        "You have pending changes. Sync or resolve conflicts before signing out to keep your work safe.",
      );
      setConflicts(true);
      return;
    }
    try {
      if (!navigator.onLine) {
        toast("Connect to the internet to sign out securely.");
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
          <BrandMark size={34} />
        </span>
        <h2>Your study space is loading.</h2>
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
    { id: "home", label: "Home", icon: Home },
    { id: "study", label: "Cards", icon: Layers3 },
    { id: "words", label: "Words", icon: LibraryBig },
    { id: "battles", label: "Compete", icon: Swords },
    { id: "profile", label: "Profile", icon: UserRound },
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
              <BrandMark size={39} />
            </span>
            <span>
              Study <b>Grove</b>
              <small>LEARN. REMEMBER. GROW.</small>
            </span>
          </button>
          <span className="nav-caption">YOUR SPACE</span>
          <nav aria-label="Main navigation">
            {nav.map((n) => (
              <button
                key={n.id}
                className={page === n.id ? "active" : ""}
                onClick={() => navigate(n.id)}
                aria-current={page === n.id ? "page" : undefined}
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
                Knowledge grows
                <br />
                one day at a time.
              </p>
            </div>
            <button
              className="sidebar-user"
              onClick={() => navigate("profile")}
            >
              <Avatar
                userId={s.user.id}
                photoId={s.user.avatarPhotoId}
                emoji={s.user.avatar}
              />
              <div>
                <strong>{s.user.nickname}</strong>
                <small>Your study space</small>
              </div>
              <ChevronRight size={16} />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <span>Study Grove</span>
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
                title="Check sync status"
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
                    ? "Syncing"
                    : !online
                      ? "Offline"
                      : local.pending.length
                        ? `${local.pending.length} pending`
                        : "All synced"}
                </span>
              </button>
              <span className="topbar-divider" />
              <span className="topbar-date">
                {new Date().toLocaleDateString("en-US", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
              <button
                className="avatar small"
                aria-label="Open profile"
                onClick={() => navigate("profile")}
              >
                <Avatar
                  userId={s.user.id}
                  photoId={s.user.avatarPhotoId}
                  emoji={s.user.avatar}
                  className="avatar-content"
                />
              </button>
            </div>
          </header>
          {!online && (
            <div className="offline-banner">
              <WifiOff size={15} />
              Offline. Keep studying your downloaded decks.
            </div>
          )}
          {local.pending.some((p) => p.error) && (
            <button
              className="conflict-banner"
              onClick={() => setConflicts(true)}
            >
              <AlertCircle size={16} />
              Some changes need attention. View saved drafts
              <ChevronRight size={15} />
            </button>
          )}
          {update && page !== "study" && (
            <div className="update-banner">
              An update is ready.
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
                Update now
              </Button>
              <button
                className="icon-button"
                onClick={() => setUpdate(null)}
                aria-label="Update later"
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
            <span>Small steps. Lasting knowledge.</span>
            <span>
              STUDY GROVE <i>✦</i>
            </span>
          </footer>
        </div>
        <nav className="bottom-nav" aria-label="Mobile navigation">
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
          <button onClick={() => setMessage("")} aria-label="Dismiss message">
            <X size={16} />
          </button>
        </div>
      )}
      {install && (
        <Modal
          title="Take your learning with you"
          onClose={() => setInstall(false)}
        >
          <div className="install-icon">
            <Smartphone size={40} />
          </div>
          <h3>Add to your home screen.</h3>
          {installPrompt ? (
            <Button
              onClick={async () => {
                await installPrompt.prompt();
                const choice = await installPrompt.userChoice;
                if (choice.outcome === "accepted")
                  toast("Installation requested in your browser.");
                setInstallPrompt(null);
              }}
            >
              Install Study Grove
              <Download size={17} />
            </Button>
          ) : (
            <>
              <p>
                <strong>iPhone / iPad:</strong> open in Safari, tap Share, then
                choose “Add to Home Screen”.
              </p>
              <p>
                <strong>Android:</strong> open in Chrome, tap the ⋮ menu, then
                choose “Install app” or “Add to Home screen”.
              </p>
            </>
          )}
          <p>
            Then open Study and tap Download on a deck to use it offline.
            Available storage is managed by your browser.
          </p>
          <p className="footnote">
            Battles and online searches need an internet connection. Complete
            installation in your browser.
          </p>
        </Modal>
      )}
      {conflicts && (
        <Modal title="Your work is saved" onClose={() => setConflicts(false)}>
          <p>{local.pending.length} changes are waiting to sync.</p>
          {local.pending.map((p) => (
            <div className="pending-row" key={p.id}>
              <strong>{p.word?.term || "Card review"}</strong>
              <p>{p.error || "Waiting for a connection."}</p>
              {p.word && p.error && (
                <>
                  <p>Your draft: {p.word.meaning}</p>
                  <p>
                    Server:{" "}
                    {local.snapshot.words.find((w) => w.id === p.word?.id)
                      ?.meaning || "Not found"}
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
                          "This word was removed. Export your draft to recover it.",
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
                    Apply my draft
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
                  Retry sync
                </Button>
              )}
              {p.error && (
                <Button
                  variant="ghost small"
                  onClick={async () => {
                    exportFile(
                      "anki-draft-" + p.id + ".json",
                      JSON.stringify(p, null, 2),
                    );
                    await updateLocal(s.user.id, (l) => ({
                      ...l,
                      pending: l.pending.filter((x) => x.id !== p.id),
                    }));
                    toast("Draft exported. The server version was kept.");
                  }}
                >
                  Export draft and keep server version
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              exportFile(
                "study-grove-pending.json",
                JSON.stringify(local.pending, null, 2),
              )
            }
          >
            Export pending changes
          </Button>
          <Button onClick={() => refresh()} disabled={!online || syncing}>
            Sync now
          </Button>
        </Modal>
      )}
    </AppContext.Provider>
  );
}
