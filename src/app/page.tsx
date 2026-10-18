"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Database,
  FileBarChart2,
  FlaskConical,
  Layers3,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AppState, SegmentFilter, Workspace } from "@/domain/types";
import { bankroll, decision, pickStats, report } from "@/domain/calculations";
import { EntityForms, type FormKind } from "@/components/entity-forms";
import { SourcesView } from "@/components/sources-view";
import { SettingsView } from "@/components/settings-view";
import {
  BankrollView,
  BankrollTicketDetail,
  BankrollLedgerDetail,
} from "@/components/bankroll-view";
import { SimulationsView } from "@/components/simulations-view";
import { SavedSimulationDetail } from "@/components/simulation-detail";
import { TipstersView } from "@/components/tipsters-view";
import { RadarView } from "@/components/radar-view";
import { DecisionDetail } from "@/components/decision-detail";
import { SpecialtiesView } from "@/components/specialties-view";
import { TipsterProfile } from "@/components/tipster-detail";
import type { ProofLevel } from "@/domain/tipster-analysis";

type View =
  | "radar"
  | "tipsters"
  | "specialties"
  | "reports"
  | "simulations"
  | "bankroll"
  | "sources"
  | "settings";
type ModalState =
  | { type: "form"; kind: FormKind; initial?: Record<string, unknown> }
  | { type: "pick"; id: string }
  | { type: "tipster"; id: string; level?: ProofLevel; simulationId?: string }
  | { type: "simulation"; id: string }
  | { type: "reference"; id: string }
  | null;
const NAV: { id: View; label: string; icon: typeof Radio }[] = [
  { id: "radar", label: "Radar", icon: Radio },
  { id: "tipsters", label: "Tipsters", icon: Users },
  { id: "specialties", label: "Spécialités", icon: Layers3 },
  { id: "reports", label: "Rapports", icon: FileBarChart2 },
  { id: "simulations", label: "Simulations & stratégies", icon: FlaskConical },
  { id: "bankroll", label: "Mes paris & bankroll", icon: Wallet },
  { id: "sources", label: "Sources & imports", icon: Database },
  { id: "settings", label: "Paramètres", icon: Settings2 },
];
const VIEW_COPY: Record<
  View,
  { eyebrow: string; title: string; description: string }
> = {
  radar: {
    eyebrow: "VOTRE OBSERVATOIRE PERSONNEL",
    title: "Le radar",
    description: "Les bons dossiers commencent par des données solides.",
  },
  tipsters: {
    eyebrow: "COMPRENDRE AVANT DE SUIVRE",
    title: "Les tipsters",
    description:
      "Des profils comparables. Des performances replacées dans leur contexte.",
  },
  specialties: {
    eyebrow: "AFFINER VOTRE REGARD",
    title: "Spécialités & analyses",
    description:
      "Explorez les segments, puis confrontez vos hypothèses aux prochaines observations.",
  },
  reports: {
    eyebrow: "DES CONSTATS, AVEC LEURS SOURCES",
    title: "Les rapports",
    description:
      "Une synthèse déterministe de vos données, de leurs écarts et de leurs limites.",
  },
  simulations: {
    eyebrow: "EXPLORER SANS ENGAGER",
    title: "Simulations & stratégies",
    description:
      "Comparez les mises, formalisez vos règles et gardez une trace de vos décisions.",
  },
  bankroll: {
    eyebrow: "VOTRE RÉSULTAT RÉEL",
    title: "Mes paris & bankroll",
    description:
      "Chaque ticket, chaque mouvement. Une comptabilité au centime.",
  },
  sources: {
    eyebrow: "LA QUALITÉ COMMENCE À LA SOURCE",
    title: "Sources & imports",
    description:
      "Centralisez vos données avec une provenance explicite et des imports contrôlés.",
  },
  settings: {
    eyebrow: "UN CADRE QUI VOUS RESSEMBLE",
    title: "Les paramètres",
    description:
      "Définissez vos limites et les conventions de votre espace personnel.",
  },
};
const FORM_NAMES: Record<FormKind, string> = {
  tipster: "Ajouter un tipster",
  pick: "Enregistrer un pronostic",
  quote: "Observer une cote Winamax",
  ticket: "Enregistrer un ticket réel",
  ledger: "Ajouter un mouvement",
  strategy: "Définir une stratégie",
  simulation: "Créer une simulation",
};
const euro = (cents: number | null | undefined, signed = false) =>
  cents == null || !Number.isFinite(cents)
    ? "Non applicable"
    : `${signed && cents > 0 ? "+" : ""}${new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)}`;
const decimal = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("fr-FR", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(value);
const pct = (value: number | null | undefined, signed = false) =>
  value == null || !Number.isFinite(value)
    ? "Non applicable"
    : `${signed && value > 0 ? "+" : ""}${decimal(value * 100, 1)} %`;
const units = (value: number, signed = true) =>
  `${signed && value > 0 ? "+" : ""}${decimal(value)} u`;
const dateTime = (value: string | null | undefined, full = false) =>
  !value || !Number.isFinite(Date.parse(value))
    ? "Non renseigné"
    : new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris",
        day: "2-digit",
        month: full ? "long" : "short",
        ...(full ? { year: "numeric" as const } : {}),
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value));
const shortDate = (value: string) =>
  !Number.isFinite(Date.parse(value))
    ? "—"
    : new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris",
        day: "2-digit",
        month: "short",
      }).format(new Date(value));
function Chart({
  points,
  unit = "u",
}: {
  points: { at: string; value: number }[];
  unit?: string;
}) {
  return points.length ? (
    <div
      className="chart"
      role="img"
      aria-label={`Courbe de performance : ${points.length} observations, dernière valeur ${decimal(points.at(-1)?.value)} ${unit}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={points}
          margin={{ top: 16, right: 16, left: -16, bottom: 2 }}
        >
          <defs>
            <linearGradient
              id={`performance-${unit.replace(/\W/g, "")}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#199b80" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#199b80" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 4"
            vertical={false}
            stroke="var(--line)"
          />
          <XAxis
            dataKey="at"
            tickFormatter={shortDate}
            minTickGap={40}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 9, fill: "var(--muted)" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 9, fill: "var(--muted)" }}
            domain={["auto", "auto"]}
          />
          <Tooltip
            labelFormatter={(value) => dateTime(String(value))}
            formatter={(value) => [
              `${decimal(Number(value))} ${unit}`,
              "Performance",
            ]}
            contentStyle={{
              background: "var(--panel)",
              color: "var(--ink)",
              border: "1px solid var(--line)",
              borderRadius: 7,
              fontSize: 11,
            }}
          />
          <ReferenceLine y={unit === "u" ? 0 : 100} stroke="var(--line)" />
          <Area
            type="linear"
            dataKey="value"
            stroke="#15967c"
            strokeWidth={2}
            fill={`url(#performance-${unit.replace(/\W/g, "")})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  ) : (
    <div className="mini-empty">
      La courbe apparaîtra après vos premières observations réglées.
    </div>
  );
}
function Dialog({
  title,
  children,
  onClose,
  theme,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  theme: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      className="modal"
      data-theme={theme}
      ref={ref}
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Fermer">
          <X />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace>("personal");
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<View>("radar");
  const [theme, setTheme] = useState("light");
  const [mobileNav, setMobileNav] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [, setFreshnessTick] = useState(0);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [demoLoading, setDemoLoading] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState("");
  const [segment, setSegment] = useState<SegmentFilter>({});
  const [analysisPeriod, setAnalysisPeriod] = useState<
    "all" | "discovery" | "validation"
  >("all");
  const [specialtyProof, setSpecialtyProof] = useState<ProofLevel>("declared");
  const [strategyId, setStrategyId] = useState("");
  const [reportPeriod, setReportPeriod] = useState("all");
  const searchRef = useRef<HTMLInputElement>(null);
  const refresh = useCallback(
    async (selected: Workspace = workspace) => {
      const response = await fetch(`/api/data?workspace=${selected}`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const json = await response.json();
      if (!response.ok)
        throw new Error(json.error ?? "Impossible de charger les données.");
      setState(json);
    },
    [workspace],
  );
  useEffect(() => {
    setLoading(true);
    setError("");
    setModal(null);
    refresh()
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [refresh]);
  useEffect(() => {
    const saved = localStorage.getItem("prisme-theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
    const handle = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    const freshness = window.setInterval(
      () => setFreshnessTick((value) => value + 1),
      30000,
    );
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNav(false);
    };
    window.addEventListener("keydown", escape);
    return () => {
      media.removeEventListener("change", update);
      clearInterval(freshness);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timeout);
  }, [toast]);
  function navigate(next: View) {
    setView(next);
    setMobileNav(false);
    setSearch("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("prisme-theme", next);
  }
  async function mutate(
    action: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace, action, payload }),
    });
    if (response.status === 401) {
      window.location.assign("/login");
      throw new Error("Votre session a expiré.");
    }
    const json = await response.json();
    if (!response.ok)
      throw new Error(json.error ?? "L’enregistrement a échoué.");
    if (
      !["import.preview", "simulation.preview", "simulation.compare"].includes(
        action,
      )
    ) {
      await refresh();
      if (action !== "odds.sync")
        setToast(
          action === "import.commit"
            ? "Import enregistré et comptabilité actualisée."
            : "Enregistrement effectué.",
        );
    }
    return json.result;
  }
  async function openDemo() {
    setDemoLoading(true);
    setError("");
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace: "demo",
          action: "demo.seed",
          payload: {},
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ?? "La démonstration n’a pas pu être chargée.",
        );
      setLoading(true);
      setState(null);
      setWorkspace("demo");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Erreur de chargement.",
      );
    } finally {
      setDemoLoading(false);
    }
  }
  function openForm(kind: FormKind, initial?: Record<string, unknown>) {
    setModal({ type: "form", kind, initial });
  }
  function openReference(id: string) {
    if (!state) return;
    const key = id.replace(
      /^(pick|ticket|tipster|quote|simulation|ledger|strategy)[:/]/,
      "",
    );
    const pick = state.picks.find((p) => p.id === key);
    if (pick) setModal({ type: "pick", id: key });
    else {
      const tipster = state.tipsters.find((t) => t.id === key);
      if (tipster) setModal({ type: "tipster", id: key });
      else setModal({ type: "reference", id: key });
    }
  }
  const balance = useMemo(() => (state ? bankroll(state) : null), [state]);
  if (loading && !state)
    return (
      <main className="loading-page">
        <div className="brand">
          <span className="brand-mark" />
          PRISME
        </div>
        <Loader2 className="spin" size={20} />
        <p>Ouverture de votre espace…</p>
      </main>
    );
  if (!state || !balance)
    return (
      <main className="loading-page">
        <div className="panel error-card">
          <Database size={30} />
          <h2>Votre espace est indisponible</h2>
          <p>{error || "Le chargement n’a pas abouti."}</p>
          <button
            className="button button-primary"
            onClick={() => {
              setLoading(true);
              setError("");
              refresh()
                .catch((cause: Error) => setError(cause.message))
                .finally(() => setLoading(false));
            }}
          >
            <RefreshCw size={14} />
            Réessayer
          </button>
        </div>
      </main>
    );

  const pending = state.picks.filter((p) => p.result === "open");
  const page = VIEW_COPY[view];
  return (
    <div className="app-shell" data-theme={theme}>
      <a href="#main" className="skip-link">
        Aller au contenu
      </a>
      <button
        className={`mobile-scrim ${mobileNav ? "visible" : ""}`}
        aria-label="Fermer le menu"
        onClick={() => setMobileNav(false)}
      />
      <aside
        id="side-navigation"
        className={`sidebar ${mobileNav ? "open" : ""}`}
        aria-label="Navigation principale"
        inert={isMobile && !mobileNav ? true : undefined}
      >
        <div className="brand">
          <span className="brand-mark" />
          PRISME
        </div>
        <div className="brand-sub">Des données aux décisions</div>
        <div className="sidebar-label">Votre espace d’analyse</div>
        <nav className="navigation">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-link ${view === id ? "active" : ""}`}
              onClick={() => navigate(id)}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon strokeWidth={1.6} />
              <span>{label}</span>
              {id === "radar" && pending.length > 0 && (
                <span className="nav-count">{pending.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <b>
              <ShieldCheck
                size={12}
                style={{ verticalAlign: "-2px", marginRight: 6 }}
              />
              Un cadre, pas une promesse.
            </b>
            Observer. Comparer. Décider.
            <br />
            Vos prises de pari restent manuelles.
          </div>
          <div className="profile">
            <div className="avatar">VP</div>
            <div>
              <div className="profile-name">Votre espace personnel</div>
              <div className="profile-meta">
                {workspace === "demo"
                  ? "Démonstration isolée"
                  : "Accès privé · EUR"}
              </div>
            </div>
            <button
              className="icon-button"
              style={{ marginLeft: "auto" }}
              title="Se déconnecter"
              aria-label="Se déconnecter"
              onClick={async () => {
                try {
                  const response = await fetch("/api/logout", {
                    method: "POST",
                  });
                  if (response.ok) window.location.assign("/login");
                  else setError("La déconnexion a échoué.");
                } catch {
                  setError("La déconnexion a échoué.");
                }
              }}
            >
              <LogOut />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-toggle"
            aria-label="Ouvrir le menu"
            aria-controls="side-navigation"
            aria-expanded={mobileNav}
            onClick={() => setMobileNav(true)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            <span>Espace personnel</span>
            <ChevronRight size={12} />
            <strong>{NAV.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="topbar-tools">
            <label className="search-box">
              <Search size={14} />
              <input
                ref={searchRef}
                aria-label="Rechercher un pronostic, tipster ou ticket"
                placeholder="Rechercher…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  if (!["radar", "tipsters", "bankroll"].includes(view))
                    setView("radar");
                }}
              />
              <kbd>⌘ K</kbd>
            </label>
            <span className="topbar-divider" />
            <span className="local-status">
              <span className="status-dot" />
              Données enregistrées
            </span>
            <button
              className="icon-button"
              aria-label={
                theme === "light"
                  ? "Activer le thème sombre"
                  : "Activer le thème clair"
              }
              title="Changer de thème"
              onClick={toggleTheme}
            >
              {theme === "light" ? <Moon /> : <Sun />}
            </button>
            <button
              className="icon-button"
              aria-label="Actualiser les données"
              title="Actualiser"
              onClick={() =>
                refresh()
                  .then(() => setToast("Données actualisées."))
                  .catch((cause: Error) => setError(cause.message))
              }
            >
              <RefreshCw />
            </button>
            <span
              className="avatar"
              style={{
                width: 30,
                height: 30,
                background: "var(--teal-soft)",
                color: "var(--teal)",
              }}
            >
              VP
            </span>
          </div>
        </header>
        <main className="main-content" id="main">
          {workspace === "demo" && (
            <div className="demo-banner">
              <span>
                <FlaskConical size={13} />
                <b>DÉMONSTRATION</b> · Données entièrement fictives, séparées de
                votre espace personnel.
              </span>
              <button
                onClick={() => {
                  setLoading(true);
                  setState(null);
                  setWorkspace("personal");
                  setSearch("");
                  setSegment({});
                  setStrategyId("");
                }}
              >
                Revenir à mes données
              </button>
            </div>
          )}
          {error && (
            <div
              className="notice notice-error"
              role="alert"
              style={{
                marginBottom: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              {error}
              <button
                className="icon-button"
                aria-label="Masquer l’erreur"
                onClick={() => setError("")}
              >
                <X />
              </button>
            </div>
          )}
          <div className="page-intro">
            <div>
              <div className="eyebrow">{page.eyebrow}</div>
              <h1>{page.title}</h1>
              <p>{page.description}</p>
            </div>
            <div className="intro-actions">
              {view === "radar" && (
                <>
                  <button
                    className="button button-secondary"
                    onClick={() => navigate("sources")}
                  >
                    <ArrowDownToLine />
                    Importer des données
                  </button>
                  <button
                    className="button button-primary"
                    onClick={() =>
                      state.tipsters.length
                        ? openForm("pick")
                        : openForm("tipster")
                    }
                  >
                    <Plus />
                    {state.tipsters.length
                      ? "Nouveau pronostic"
                      : "Ajouter un tipster"}
                  </button>
                </>
              )}
              {view === "tipsters" && (
                <button
                  className="button button-primary"
                  onClick={() => openForm("tipster")}
                >
                  <Plus />
                  Ajouter un tipster
                </button>
              )}
              {view === "simulations" && (
                <button
                  className="button button-primary"
                  onClick={() => openForm("simulation")}
                >
                  <Plus />
                  Nouvelle simulation
                </button>
              )}
              {view === "bankroll" && (
                <>
                  <button
                    className="button button-secondary"
                    onClick={() => openForm("ledger")}
                  >
                    <Plus />
                    Mouvement
                  </button>
                  <button
                    className="button button-primary"
                    onClick={() => openForm("ticket")}
                  >
                    <Plus />
                    Ticket réel
                  </button>
                </>
              )}
              {view === "reports" && (
                <a
                  className="button button-secondary"
                  href={`/api/export?workspace=${workspace}`}
                  download
                >
                  <ArrowDownToLine />
                  Exporter les données
                </a>
              )}
            </div>
          </div>

          {view === "radar" && (
            <RadarView
              key={workspace}
              state={state}
              search={search}
              demoLoading={demoLoading}
              onOpenDemo={openDemo}
              onOpenPick={(id) => setModal({ type: "pick", id })}
              onOpenTipster={(id) => setModal({ type: "tipster", id })}
              onOpenForm={openForm}
              onNavigate={navigate}
              onExploreStrategy={(id, filter) => {
                setStrategyId(id);
                setSegment(filter);
                setAnalysisPeriod("validation");
                setSpecialtyProof("observed");
                navigate("specialties");
              }}
              mutate={mutate}
              portfolioChart={<Chart points={balance.series} unit="base 100" />}
            />
          )}

          {view === "tipsters" && (
            <TipstersView
              key={workspace}
              state={state}
              search={search}
              onOpenTipster={(id, level, simulationId) =>
                setModal({ type: "tipster", id, level, simulationId })
              }
              onOpenPick={(id) => setModal({ type: "pick", id })}
              onCreateTipster={() => openForm("tipster")}
              onExploreTipster={(id, level) => {
                setSegment({ tipsterId: id });
                setStrategyId("");
                setAnalysisPeriod("all");
                setSpecialtyProof(level);
                navigate("specialties");
              }}
            />
          )}
          {view === "specialties" && (
            <SpecialtiesView
              key={workspace}
              state={state}
              initialFilter={segment}
              initialStrategyId={strategyId}
              initialProof={specialtyProof}
              initialPhase={analysisPeriod}
              onOpenPick={(id) => setModal({ type: "pick", id })}
              onOpenReference={openReference}
              onCreateStrategy={(filter) => openForm("strategy", { filter })}
              onSaveExploration={(payload) =>
                mutate("analysis.explore", payload)
              }
            />
          )}

          {view === "reports" && (
            <ReportsView
              state={state}
              period={reportPeriod}
              setPeriod={setReportPeriod}
              openReference={openReference}
            />
          )}
          {view === "simulations" && (
            <SimulationsView
              key={workspace}
              state={state}
              mutate={mutate}
              onOpenPick={(id) => setModal({ type: "pick", id })}
              onOpenSimulation={(id) => setModal({ type: "simulation", id })}
              onOpenForm={openForm}
              onOpenSettings={() => navigate("settings")}
              onExploreStrategy={(id, filter) => {
                setStrategyId(id);
                setSegment(filter);
                setAnalysisPeriod("validation");
                setSpecialtyProof("observed");
                navigate("specialties");
              }}
            />
          )}

          {view === "bankroll" && (
            <BankrollView
              key={workspace}
              state={state}
              search={search}
              mutate={mutate}
              onOpenForm={openForm}
              onOpenReference={openReference}
            />
          )}
          {view === "sources" && (
            <SourcesView
              key={workspace}
              state={state}
              mutate={mutate}
              onOpenQuote={(pickId) =>
                openForm("quote", pickId ? { pickId } : undefined)
              }
            />
          )}
          {view === "settings" && (
            <SettingsView
              key={`${workspace}-${state.audit.length}`}
              state={state}
              mutate={mutate}
            />
          )}
          <footer className="footer">
            <span>
              <ShieldCheck />
              PRISME · Un outil d’analyse personnel. Les résultats passés ne
              garantissent pas les résultats futurs.
            </span>
            <span>EUR · Europe/Paris · Accès privé</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 />
          {toast}
        </div>
      )}
      {modal && (
        <Dialog
          theme={theme}
          title={
            modal.type === "form"
              ? modal.initial?.id
                ? "Modifier les données"
                : FORM_NAMES[modal.kind]
              : modal.type === "pick"
                ? "Fiche de décision"
                : modal.type === "tipster"
                  ? "Fiche tipster"
                  : modal.type === "simulation"
                    ? "Simulation enregistrée"
                    : "Donnée source"
          }
          onClose={() => setModal(null)}
        >
          {modal.type === "form" ? (
            <EntityForms
              key={`${modal.kind}-${String(modal.initial?.id ?? "new")}`}
              kind={modal.kind}
              state={state}
              initial={modal.initial}
              onSave={async (action, payload) => {
                await mutate(action, payload);
              }}
              onClose={() => setModal(null)}
            />
          ) : modal.type === "pick" ? (
            <DecisionDetail
              key={modal.id}
              pick={state.picks.find((p) => p.id === modal.id)!}
              state={state}
              onOpenForm={openForm}
              onOpenTipster={(id) => setModal({ type: "tipster", id })}
              onOpenReference={openReference}
              mutate={mutate}
            />
          ) : modal.type === "tipster" ? (
            <TipsterProfile
              key={modal.id}
              initialProof={modal.level}
              initialSimulationId={modal.simulationId}
              tipster={state.tipsters.find((t) => t.id === modal.id)!}
              state={state}
              onEdit={() =>
                openForm("tipster", {
                  ...state.tipsters.find((tipster) => tipster.id === modal.id)!,
                })
              }
              onAddPick={() => openForm("pick", { tipsterId: modal.id })}
              onOpenPick={(id) => setModal({ type: "pick", id })}
              onOpenReference={openReference}
            />
          ) : modal.type === "simulation" ? (
            <SavedSimulationDetail
              simulation={state.simulations.find((s) => s.id === modal.id)!}
              state={state}
              onOpenPick={(id) => setModal({ type: "pick", id })}
            />
          ) : (
            <ReferenceDetail
              id={modal.id}
              state={state}
              openForm={openForm}
              openPick={(id) => setModal({ type: "pick", id })}
              openReference={openReference}
            />
          )}
        </Dialog>
      )}
    </div>
  );
}

function ReferenceDetail({
  id,
  state,
  openForm,
  openPick,
  openReference,
}: {
  id: string;
  state: AppState;
  openForm: (kind: FormKind, initial?: Record<string, unknown>) => void;
  openPick: (id: string) => void;
  openReference: (id: string) => void;
}) {
  const ticket = state.tickets.find((t) => t.id === id);
  const simulation = state.simulations.find((s) => s.id === id);
  const quote = state.quotes.find((q) => q.id === id);
  const ledger = state.ledger.find((l) => l.id === id);
  const strategy = state.strategies.find((s) => s.id === id);
  if (simulation)
    return (
      <SavedSimulationDetail
        simulation={simulation}
        state={state}
        onOpenPick={openPick}
      />
    );
  if (ticket)
    return (
      <BankrollTicketDetail
        ticket={ticket}
        state={state}
        onOpenForm={openForm}
        onOpenReference={openReference}
      />
    );
  if (quote)
    return (
      <div className="stack">
        <h2>Observation Winamax France</h2>
        <dl className="detail-list">
          <div className="detail-line">
            <dt>Cote</dt>
            <dd>{decimal(quote.odds)}</dd>
          </div>
          <div className="detail-line">
            <dt>Observée le</dt>
            <dd>{dateTime(quote.observedAt, true)}</dd>
          </div>
          <div className="detail-line">
            <dt>Enregistrée le</dt>
            <dd>{dateTime(quote.recordedAt, true)}</dd>
          </div>
          <div className="detail-line">
            <dt>Source</dt>
            <dd>{quote.source}</dd>
          </div>
          <div className="detail-line">
            <dt>Marché disponible</dt>
            <dd>{quote.available ? "Oui, lors de l’observation" : "Non"}</dd>
          </div>
          <div className="detail-line">
            <dt>Identité de marché</dt>
            <dd>{quote.matchConfirmed ? "Confirmée" : "À confirmer"}</dd>
          </div>
          <div className="detail-line">
            <dt>Clôture</dt>
            <dd>{quote.closing ? "Oui" : "Non"}</dd>
          </div>
          <div className="detail-line">
            <dt>Référence de clôture sans marge</dt>
            <dd>{pct(quote.referenceProbability)}</dd>
          </div>
        </dl>
        <p className="notice notice-warning">
          L’observation d’une cote n’est pas une preuve de pari exécuté.
        </p>
        <button
          className="button button-primary"
          onClick={() => openPick(quote.pickId)}
        >
          Ouvrir le pronostic
        </button>
      </div>
    );
  if (ledger)
    return (
      <BankrollLedgerDetail entry={ledger} onOpenReference={openReference} />
    );
  if (strategy)
    return (
      <div className="stack">
        <h2>{strategy.name}</h2>
        <p className="muted">
          Figée le {dateTime(strategy.frozenAt)} · Validation à partir du{" "}
          {dateTime(strategy.validationStart)}
        </p>
        <p>
          {Object.entries(strategy.filter)
            .map(([k, v]) => `${k} : ${v}`)
            .join(" · ")}
        </p>
        <p className="notice notice-warning">
          Hypothèse de suivi, sans affirmation d’avantage prédictif.
        </p>
      </div>
    );
  return (
    <div className="notice notice-warning">
      Référence conservée : {id}. Aucun enregistrement correspondant dans cet
      espace.
    </div>
  );
}

function ReportsView({
  state,
  period,
  setPeriod,
  openReference,
}: {
  state: AppState;
  period: string;
  setPeriod: (period: string) => void;
  openReference: (id: string) => void;
}) {
  const generated = useMemo(() => report(state), [state]);
  const dateThreshold =
    period === "daily"
      ? Date.now() - 86400000
      : period === "weekly"
        ? Date.now() - 7 * 86400000
        : period === "monthly"
          ? Date.now() - 30 * 86400000
          : 0;
  const isInPeriod = (date: string | null) =>
    !!date &&
    Date.parse(date) >= dateThreshold &&
    Date.parse(date) <= Date.now();
  const picks = state.picks.filter((p) => isInPeriod(p.publishedAt));
  const declared = pickStats(picks.filter((p) => p.evidence === "declared"));
  const observed = pickStats(picks.filter((p) => p.evidence === "observed"));
  const sims = state.simulations.filter((s) => isInPeriod(s.createdAt));
  const settled = state.tickets.filter(
    (t) => t.result !== "open" && !t.partialCashout && isInPeriod(t.settledAt),
  );
  const cashProfit = settled
    .filter((t) => t.funding === "cash")
    .reduce((sum, t) => sum + t.returnCents - t.stakeCents, 0);
  const promoProfit = settled
    .filter((t) => t.funding === "freebet")
    .reduce((sum, t) => sum + t.returnCents, 0);
  const fees = state.ledger
    .filter(
      (l) => (l.kind === "fee" || l.kind === "ticket_fee") && isInPeriod(l.at),
    )
    .reduce((sum, l) => sum - l.amountCents, 0);
  const prospective = state.picks.filter(
    (p) => p.result === "open" && isInPeriod(p.publishedAt),
  );
  const candidates = prospective.filter((p) => decision(p, state).eligible);
  const refName = (ref: string) => {
    const key = ref.replace(/^[^:]+:/, "");
    return (
      state.picks.find((p) => p.id === key)?.event ||
      state.tipsters.find((t) => t.id === key)?.name ||
      state.tickets.find((t) => t.id === key)?.event ||
      state.simulations.find((s) => s.id === key)?.name ||
      (ref.startsWith("quote:")
        ? "Observation de cote"
        : ref.startsWith("ledger:")
          ? "Mouvement financier"
          : ref)
    );
  };
  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Votre revue de période</h2>
            <p>
              Données à jour à l’ouverture · synthèse calculée à la demande,
              sans génération de faits par IA.
            </p>
          </div>
          <label className="field" style={{ minWidth: 150 }}>
            <span className="sr-only">Période du rapport</span>
            <select
              className="filter-select"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="all">Depuis l’origine</option>
              <option value="daily">Dernières 24 heures</option>
              <option value="weekly">7 derniers jours</option>
              <option value="monthly">30 derniers jours</option>
            </select>
          </label>
        </div>
        <div className="proof-strip">
          <div className="proof-item">
            <small>DÉCLARÉ · PUBLICATIONS</small>
            <strong>{units(declared.profitUnits)}</strong>
            <p>
              {declared.count} pronostics · rendement {pct(declared.yield)}
            </p>
          </div>
          <div className="proof-item">
            <small>OBSERVÉ · PUBLICATIONS</small>
            <strong>{units(observed.profitUnits)}</strong>
            <p>
              {observed.count} pronostics · rendement {pct(observed.yield)}
            </p>
          </div>
          <div className="proof-item">
            <small>SIMULÉ · CRÉATIONS</small>
            <strong>{sims.length}</strong>
            <p>Scénarios enregistrés, aucun débit réel</p>
          </div>
          <div className="proof-item">
            <small>EXÉCUTÉ · RÈGLEMENTS</small>
            <strong>{euro(cashProfit + promoProfit - fees, true)}</strong>
            <p>{settled.length} tickets clôturés · frais de période</p>
          </div>
        </div>
        <div className="panel-footer">
          <span>
            Publications pour les historiques ; créations pour les simulations ;
            règlements pour les tickets. Les périodes ne décrivent pas la même
            cohorte.
          </span>
        </div>
      </section>
      <div className="view-grid">
        <section className="panel panel-pad">
          <div className="eyebrow">SYNTHÈSE DES DOSSIERS</div>
          <h2>
            {candidates.length
              ? `${candidates.length} dossier(s) à analyser`
              : "Aucun pari éligible"}
          </h2>
          <p className="muted" style={{ marginTop: 13 }}>
            {prospective.length} pronostics encore ouverts dans la période.{" "}
            {candidates.length
              ? "Une cote récente et une identité de marché confirmée permettent une analyse ; aucune espérance individuelle n’est supposée."
              : "Les données disponibles ne permettent pas de retenir un dossier immédiatement exploitable. Une abstention reste une décision documentée."}
          </p>
          <div className="report-refs">
            {prospective.map((pick) => (
              <button
                key={pick.id}
                onClick={() => openReference(`pick:${pick.id}`)}
              >
                {pick.event}
                <ArrowUpRight size={9} style={{ marginLeft: 5 }} />
              </button>
            ))}
          </div>
        </section>
        <section className="panel panel-pad">
          <div className="eyebrow">RÉSULTAT COMPTABLE DE PÉRIODE</div>
          <h2>Les résultats, après coûts</h2>
          <div className="amount-breakdown">
            <span>Cash hors promotions</span>
            <strong>{euro(cashProfit, true)}</strong>
          </div>
          <div className="amount-breakdown">
            <span>Retours de freebets clôturés</span>
            <strong>{euro(promoProfit, true)}</strong>
          </div>
          <div className="amount-breakdown">
            <span>Frais datés de la période</span>
            <strong>{euro(fees)}</strong>
          </div>
          <p className="muted" style={{ fontSize: 10, marginTop: 12 }}>
            Cashouts partiels ouverts exclus de ce résultat de tickets clôturés.
            Coûts d’abonnement comptabilisés uniquement via le journal de frais.
          </p>
          <div className="report-refs">
            {settled.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => openReference(`ticket:${ticket.id}`)}
              >
                {ticket.event}
              </button>
            ))}
            {state.ledger
              .filter(
                (l) =>
                  (l.kind === "fee" || l.kind === "ticket_fee") &&
                  isInPeriod(l.at),
              )
              .map((l) => (
                <button
                  key={l.id}
                  onClick={() => openReference(`ledger:${l.id}`)}
                >
                  {l.description || "Frais comptabilisés"}
                </button>
              ))}
          </div>
        </section>
      </div>
      <section className="panel panel-pad">
        <div className="section-heading">
          <div>
            <div className="eyebrow">BILAN INTÉGRAL · DEPUIS L’ORIGINE</div>
            <h2>{generated.title}</h2>
            <p>{generated.summary}</p>
          </div>
          <FileBarChart2 size={23} color="var(--teal)" />
        </div>
        <p className="notice">
          Les sections ci-dessous couvrent l’ensemble du registre pour préserver
          le rapprochement financier. Les chiffres sont produits par les
          fonctions de calcul de l’application.
        </p>
        {generated.sections.map((section, index) => (
          <article className="report-section" key={index}>
            <h3>
              {String(index + 1).padStart(2, "0")} · {section.title}
            </h3>
            <p>{section.text}</p>
            {section.refs.length > 0 ? (
              <details style={{ marginTop: 12 }}>
                <summary className="text-link">
                  Consulter les {section.refs.length} données sources
                </summary>
                <div className="report-refs">
                  {section.refs.map((ref, i) => (
                    <button
                      key={`${ref}-${i}`}
                      onClick={() => openReference(ref)}
                      title={ref}
                    >
                      {refName(ref)}
                      <ArrowUpRight size={9} style={{ marginLeft: 5 }} />
                    </button>
                  ))}
                </div>
              </details>
            ) : (
              <small className="muted">
                Aucune donnée source pour cette section.
              </small>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
