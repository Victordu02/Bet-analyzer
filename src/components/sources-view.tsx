"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AppState, ImportBatch } from "@/domain/types";
import { OddsConnectorPanel } from "@/components/odds-connector-panel";

type ImportKind = "picks" | "tickets";
type PreviewRow = {
  row: number;
  skipped?: boolean;
  data: Record<string, unknown> | null;
  errors: string[];
  warnings: string[];
};
type Preview = { headers: string[]; rows: PreviewRow[]; total: number };
type Column = { key: string; label: string; required?: boolean };
type Props = {
  state: AppState;
  mutate: (
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
  onOpenQuote: (pickId?: string) => void;
};

const PICK_COLUMNS: Column[] = [
  { key: "source_id", label: "Identifiant dans la source" },
  { key: "tipster", label: "Nom du tipster", required: true },
  { key: "event", label: "Événement", required: true },
  { key: "event_key", label: "Identifiant de l’événement" },
  { key: "sport", label: "Sport" },
  { key: "competition", label: "Compétition" },
  { key: "market", label: "Marché", required: true },
  { key: "selection", label: "Sélection", required: true },
  { key: "line", label: "Ligne / handicap" },
  { key: "rules", label: "Règles du marché" },
  { key: "odds", label: "Cote publiée", required: true },
  { key: "min_odds", label: "Cote minimale" },
  { key: "stake_units", label: "Mise en unités" },
  { key: "published_at", label: "Date de publication", required: true },
  { key: "starts_at", label: "Début de l’événement", required: true },
  { key: "result", label: "Résultat" },
  { key: "settled_at", label: "Date du règlement" },
  { key: "settlement_source", label: "Source du résultat" },
  { key: "source_url", label: "Lien vers la source" },
  { key: "argument", label: "Argumentaire" },
  { key: "notes", label: "Notes" },
  { key: "kind", label: "Simple / combiné" },
  { key: "timing", label: "Avant-match / direct" },
];

const TICKET_COLUMNS: Column[] = [
  { key: "source_id", label: "Identifiant du ticket dans la source" },
  { key: "pick_id", label: "Identifiant du pronostic associé" },
  { key: "event", label: "Événement", required: true },
  { key: "event_key", label: "Identifiant de l’événement" },
  { key: "market", label: "Marché", required: true },
  { key: "selection", label: "Sélection", required: true },
  { key: "line", label: "Ligne / handicap" },
  { key: "rules", label: "Règles du marché" },
  { key: "kind", label: "Simple / combiné" },
  { key: "bookmaker", label: "Bookmaker" },
  { key: "odds", label: "Cote exécutée", required: true },
  { key: "stake", label: "Mise en euros (ou en centimes ci-dessous)" },
  { key: "stake_cents", label: "Mise en centimes" },
  { key: "funding", label: "Fonds réels / freebet" },
  { key: "placed_at", label: "Date de placement", required: true },
  { key: "result", label: "Résultat" },
  { key: "return", label: "Retour total en euros" },
  { key: "return_cents", label: "Retour total en centimes" },
  { key: "fee", label: "Frais en euros" },
  { key: "fee_cents", label: "Frais en centimes" },
  { key: "settled_at", label: "Date du règlement" },
  { key: "remaining_stake", label: "Mise encore exposée en euros" },
  { key: "remaining_stake_cents", label: "Mise encore exposée en centimes" },
  { key: "partial_cashout", label: "Cashout partiel" },
  {
    key: "settlement_mode",
    label: "Versement / correction (payment / correction)",
  },
  {
    key: "correction_payment_id",
    label: "Identifiant du versement à corriger",
  },
  {
    key: "correction_payment_at",
    label: "Date corrigée du versement (facultative)",
  },
  { key: "source", label: "Source du ticket (nom du fichier par défaut)" },
  { key: "notes", label: "Notes" },
];

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "L’opération a échoué. Vérifiez le fichier puis réessayez.";
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Europe/Paris",
      }).format(date);
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function SourcesView({ state, mutate, onOpenQuote }: Props) {
  const [kind, setKind] = useState<ImportKind>("picks");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("saisie.csv");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [allowPartial, setAllowPartial] = useState(false);
  const [allowProbableDuplicates, setAllowProbableDuplicates] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [pending, setPending] = useState<"file" | "preview" | "commit" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<ImportBatch | null>(null);
  const [rowFilter, setRowFilter] = useState("all");
  const [page, setPage] = useState(0);
  const requestVersion = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestVersion.current += 1;
    setCsv("");
    setFileName("saisie.csv");
    setMapping({});
    setHeaders([]);
    setPreview(null);
    setReceipt(null);
    setError("");
    setPending(null);
    setAllowPartial(false);
    setAllowProbableDuplicates(false);
    setRightsConfirmed(false);
    setPage(0);
    if (fileInput.current) fileInput.current.value = "";
  }, [state.workspace]);

  const columns = kind === "picks" ? PICK_COLUMNS : TICKET_COLUMNS;
  const previewLabels: Record<string, string> = {
    ...Object.fromEntries(
      columns.map((column) => [
        column.key.replace(/_([a-z])/g, (_, letter: string) =>
          letter.toUpperCase(),
        ),
        column.label,
      ]),
    ),
    tipsterId: "Identifiant du tipster",
    tipsterName: "Nom du tipster",
    observedAt: "Date de collecte",
    evidence: "Niveau de preuve",
    initialContent: "Contenu initial",
    manuallyCorrected: "Correction manuelle",
    revisions: "Historique des corrections",
    strategyId: "Stratégie associée",
  };
  const invalidRows =
    preview?.rows.filter((row) => row.errors.length > 0).length ?? 0;
  const validRows =
    preview?.rows.filter((row) => row.errors.length === 0 && row.data !== null)
      .length ?? 0;
  const skippedRows = preview?.rows.filter((row) => row.skipped).length ?? 0;
  const warningRows =
    preview?.rows.filter((row) => row.warnings.length > 0).length ?? 0;
  const hasProbableDuplicates =
    preview?.rows.some((row) =>
      row.warnings.some((warning) => /doublon probable/i.test(warning)),
    ) ?? false;
  const filteredRows = useMemo(
    () =>
      (preview?.rows ?? []).filter((row) =>
        rowFilter === "errors"
          ? row.errors.length > 0
          : rowFilter === "warnings"
            ? row.warnings.length > 0
            : true,
      ),
    [preview, rowFilter],
  );
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / 25));
  const visibleRows = filteredRows.slice(page * 25, (page + 1) * 25);
  const canCommit =
    Boolean(preview) &&
    validRows > 0 &&
    rightsConfirmed &&
    (!invalidRows || allowPartial) &&
    (!hasProbableDuplicates || allowProbableDuplicates) &&
    !pending;

  function invalidatePreview(resetHeaders = false) {
    requestVersion.current += 1;
    setPreview(null);
    setReceipt(null);
    setError("");
    setAllowPartial(false);
    setAllowProbableDuplicates(false);
    setRightsConfirmed(false);
    setPage(0);
    if (resetHeaders) {
      setHeaders([]);
      setMapping({});
    }
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    invalidatePreview(true);
    setCsv("");
    setFileName(file.name);
    if (file.size > 5 * 1024 * 1024) {
      setError(
        "Ce fichier dépasse 5 Mo. Divisez-le en plusieurs fichiers CSV avant l’import.",
      );
      return;
    }
    const version = requestVersion.current;
    setPending("file");
    try {
      const text = await file.text();
      if (version !== requestVersion.current) return;
      setCsv(text);
      setFileName(file.name);
    } catch (cause) {
      if (version === requestVersion.current) setError(errorMessage(cause));
    } finally {
      if (version === requestVersion.current) setPending(null);
    }
  }

  async function verifyImport() {
    setPending("preview");
    setError("");
    setReceipt(null);
    setPreview(null);
    setAllowPartial(false);
    setAllowProbableDuplicates(false);
    setRightsConfirmed(false);
    const version = requestVersion.current;
    try {
      const result = await mutate("import.preview", {
        kind,
        csv,
        fileName: fileName.trim() || "saisie.csv",
        mapping,
      });
      if (version !== requestVersion.current) return;
      const candidate = result as Preview | null;
      if (
        !candidate ||
        !Array.isArray(candidate.headers) ||
        !Array.isArray(candidate.rows)
      ) {
        throw new Error(
          "La réponse de vérification est invalide. Réessayez l’opération.",
        );
      }
      setHeaders(candidate.headers);
      setPreview(candidate);
      setRowFilter("all");
      setPage(0);
    } catch (cause) {
      if (version === requestVersion.current) setError(errorMessage(cause));
    } finally {
      if (version === requestVersion.current) setPending(null);
    }
  }

  async function commitImport() {
    if (!canCommit) return;
    setPending("commit");
    setError("");
    const version = requestVersion.current;
    try {
      const result = await mutate("import.commit", {
        kind,
        csv,
        fileName: fileName.trim() || "saisie.csv",
        mapping,
        allowPartial,
        allowProbableDuplicates,
        rightsConfirmed,
      });
      if (version !== requestVersion.current) return;
      const batch = result as ImportBatch | null;
      if (
        !batch ||
        typeof batch.created !== "number" ||
        typeof batch.skipped !== "number"
      ) {
        throw new Error(
          "La confirmation de l’import n’a pas pu être lue. Consultez l’historique avant de réessayer.",
        );
      }
      setReceipt(batch);
      setPreview(null);
      setAllowPartial(false);
      setAllowProbableDuplicates(false);
      setRightsConfirmed(false);
    } catch (cause) {
      if (version === requestVersion.current) setError(errorMessage(cause));
    } finally {
      if (version === requestVersion.current) setPending(null);
    }
  }

  return (
    <div className="stack sources-view">
      <div className="source-grid">
        <article className="panel source-card">
          <p className="eyebrow">01 · TIPSTERS</p>
          <h3>Pronostics publiés</h3>
          <span className="badge badge-teal">Import manuel</span>
          <p className="muted">
            {state.tipsters.length} tipster
            {state.tipsters.length > 1 ? "s" : ""} · {state.picks.length}{" "}
            pronostics enregistrés
          </p>
          <p>
            Importez les archives CSV auxquelles vous avez accès, avec les dates
            et liens de publication disponibles.
          </p>
          <button
            type="button"
            className="button button-secondary"
            disabled
            title="Aucun connecteur externe autorisé n’est configuré."
          >
            Connecteur externe indisponible
          </button>
        </article>
        <article className="panel source-card">
          <p className="eyebrow">02 · COTES WINAMAX FR</p>
          <h3>Observations de marché</h3>
          <span className="badge badge-outline">Relevés explicites</span>
          <p className="muted">
            {state.quotes.length} observation
            {state.quotes.length > 1 ? "s" : ""} horodatée
            {state.quotes.length > 1 ? "s" : ""}
          </p>
          <p>
            Saisissez un relevé sourcé ou demandez une collecte The Odds API
            lorsque le serveur est configuré. Chaque correspondance reste à
            vérifier.
          </p>
          <a className="button button-secondary" href="#odds-source">
            Voir l’état du connecteur
          </a>
        </article>
        <article className="panel source-card">
          <p className="eyebrow">03 · COMPTE PERSONNEL</p>
          <h3>Tickets réellement joués</h3>
          <span className="badge badge-teal">Import manuel</span>
          <p className="muted">
            {state.tickets.length} ticket{state.tickets.length > 1 ? "s" : ""}{" "}
            enregistré{state.tickets.length > 1 ? "s" : ""}
          </p>
          <p>
            Importez votre historique réel pour suivre les mises, retours, frais
            et freebets. Aucun identifiant de connexion n’est demandé.
          </p>
          <button
            type="button"
            className="button button-secondary"
            disabled
            title="La connexion automatique au compte Winamax n’est pas intégrée."
          >
            Synchronisation indisponible
          </button>
        </article>
      </div>

      <div id="odds-source">
        <OddsConnectorPanel
          state={state}
          mutate={mutate}
          onOpenManual={onOpenQuote}
        />
      </div>

      <section className="panel import-panel" aria-labelledby="import-title">
        <div className="panel-head">
          <div>
            <p className="eyebrow">1 · PRÉPARER</p>
            <h3 id="import-title">Importer un fichier CSV</h3>
          </div>
        </div>
        <div className="form-grid">
          <label className="field" htmlFor="import-kind">
            <span>Type de données</span>
            <select
              id="import-kind"
              value={kind}
              disabled={Boolean(pending)}
              onChange={(event) => {
                setKind(event.target.value as ImportKind);
                invalidatePreview(true);
              }}
            >
              <option value="picks">Pronostics de tipsters</option>
              <option value="tickets">Tickets personnels</option>
            </select>
          </label>
          <label className="field" htmlFor="import-name">
            <span>Nom de la source / du fichier</span>
            <input
              id="import-name"
              value={fileName}
              disabled={Boolean(pending)}
              onChange={(event) => {
                setFileName(event.target.value);
                invalidatePreview();
              }}
              placeholder="historique-octobre.csv"
            />
          </label>
          <label className="field field-full" htmlFor="import-file">
            <span>Charger un fichier CSV (5 Mo maximum)</span>
            <input
              ref={fileInput}
              id="import-file"
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              disabled={Boolean(pending)}
              onChange={(event) => {
                void readFile(event.target.files?.[0]);
              }}
            />
          </label>
          <label className="field field-full" htmlFor="import-csv">
            <span>Ou coller le contenu CSV, avec sa ligne d’en-tête</span>
            <textarea
              id="import-csv"
              rows={8}
              value={csv}
              disabled={Boolean(pending)}
              placeholder={
                kind === "picks"
                  ? "tipster,event,market,selection,odds,published_at,starts_at\n…"
                  : "source_id,event,market,selection,odds,stake,placed_at,source\n…"
              }
              onChange={(event) => {
                setCsv(event.target.value);
                invalidatePreview(true);
              }}
              spellCheck={false}
            />
          </label>
        </div>
        <p className="muted">
          Dates : ISO 8601 avec fuseau ou JJ/MM/AAAA HH:mm (heure de Paris). Les
          montants sans suffixe sont en euros ; les champs « _cents » sont des
          entiers en centimes.
        </p>
        <p>
          <a href={`/examples/${kind}.csv`} download>
            Télécharger le modèle{" "}
            {kind === "picks" ? "de pronostics" : "de tickets"} — fictif, à
            importer dans Démonstration uniquement
          </a>
        </p>
        <p
          className={
            state.workspace === "personal" ? "notice notice-warning" : "muted"
          }
        >
          Les lignes des modèles sont entièrement fictives. Utilisez-les dans
          l’espace Démonstration pour tester l’import ; dans l’espace Personnel,
          remplacez-les par vos données réelles.
        </p>
        {kind === "tickets" && (
          <p className="notice">
            Renseignez la mise en euros ou en centimes. Le retour correspond au
            montant total crédité, mise comprise lorsqu’elle est remboursée.
          </p>
        )}
        {headers.length > 0 && (
          <details className="import-mapping" open={!preview}>
            <summary>
              Associer les colonnes du fichier ({headers.length} colonnes
              détectées)
            </summary>
            <p className="muted">
              Les noms standards sont reconnus automatiquement. Les champs
              marqués * sont obligatoires. Vérifiez de nouveau le fichier après
              toute modification.
            </p>
            <div className="form-grid">
              {columns.map((column) => (
                <label
                  className="field"
                  key={column.key}
                  htmlFor={`map-${column.key}`}
                >
                  <span>
                    {column.label}
                    {column.required ? " *" : ""}
                  </span>
                  <select
                    id={`map-${column.key}`}
                    disabled={Boolean(pending)}
                    value={
                      mapping[column.key] ??
                      (headers.includes(column.key) ? column.key : "")
                    }
                    onChange={(event) => {
                      setMapping((current) => ({
                        ...current,
                        [column.key]: event.target.value,
                      }));
                      invalidatePreview();
                    }}
                  >
                    <option value="">— Colonne absente / ignorer —</option>
                    {headers.map((header, index) => (
                      <option value={header} key={`${header}-${index}`}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </details>
        )}
        <div className="import-actions">
          <button
            type="button"
            className="button button-primary"
            disabled={!csv.trim() || Boolean(pending)}
            onClick={() => {
              void verifyImport();
            }}
          >
            {pending === "preview"
              ? "Vérification en cours…"
              : pending === "file"
                ? "Lecture du fichier…"
                : "Vérifier et prévisualiser"}
          </button>
          <span className="muted">
            La prévisualisation n’enregistre aucune donnée.
          </span>
        </div>
        {error && (
          <p className="notice notice-warning" role="alert">
            {error}
          </p>
        )}
        {receipt && (
          <div className="notice" role="status">
            <strong>Import traité.</strong> {receipt.created} création
            {receipt.created > 1 ? "s" : ""}, {receipt.updated} mise
            {receipt.updated > 1 ? "s" : ""} à jour, {receipt.skipped} ligne
            {receipt.skipped > 1 ? "s" : ""} ignorée
            {receipt.skipped > 1 ? "s" : ""}. Retrouvez le détail dans
            l’historique ci-dessous.
          </div>
        )}
      </section>

      {preview && (
        <section className="panel import-panel" aria-labelledby="preview-title">
          <div className="panel-head">
            <div>
              <p className="eyebrow">2 · CONTRÔLER</p>
              <h3 id="preview-title">Prévisualisation de l’import</h3>
            </div>
            <span className="badge badge-muted">{preview.total} lignes</span>
          </div>
          <p role="status">
            {validRows} ligne{validRows > 1 ? "s" : ""} valide
            {validRows > 1 ? "s" : ""} · {invalidRows} avec erreur ·{" "}
            {warningRows} avec alerte · {skippedRows} déjà traitée(s)
          </p>
          <label className="field" htmlFor="preview-filter">
            <span>Afficher les lignes</span>
            <select
              id="preview-filter"
              value={rowFilter}
              onChange={(event) => {
                setRowFilter(event.target.value);
                setPage(0);
              }}
            >
              <option value="all">Toutes les lignes</option>
              <option value="errors">Avec erreurs ({invalidRows})</option>
              <option value="warnings">Avec alertes ({warningRows})</option>
            </select>
          </label>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Ligne</th>
                  <th scope="col">Données reconnues</th>
                  <th scope="col">Contrôle</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.row}>
                    <td>{row.row}</td>
                    <td>
                      {row.data ? (
                        <>
                          <strong>{displayValue(row.data.event)}</strong>
                          <div className="muted">
                            {displayValue(row.data.selection)} · cote{" "}
                            {displayValue(row.data.odds)}
                          </div>
                          <details>
                            <summary>Voir tous les champs</summary>
                            <dl className="import-row-data">
                              {Object.entries(row.data).map(([key, value]) => (
                                <div key={key}>
                                  <dt>{previewLabels[key] ?? key}</dt>
                                  <dd>{displayValue(value)}</dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        </>
                      ) : (
                        <span className="muted">
                          {row.skipped
                            ? "Déjà importée lors d’une exécution précédente."
                            : "Ligne non importable"}
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge ${row.skipped ? "badge-muted" : row.errors.length ? "badge-amber" : "badge-teal"}`}
                      >
                        {row.skipped
                          ? "Déjà traité"
                          : row.errors.length
                            ? "À corriger"
                            : "Valide"}
                      </span>
                      {row.errors.map((message, index) => (
                        <p
                          key={`error-${index}`}
                          className="import-row-message"
                        >
                          Erreur : {message}
                        </p>
                      ))}
                      {row.warnings.map((message, index) => (
                        <p
                          key={`warning-${index}`}
                          className="import-row-message"
                        >
                          Alerte : {message}
                        </p>
                      ))}
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted">
                      Aucune ligne pour ce filtre.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {pageCount > 1 && (
            <div className="import-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={page === 0}
                onClick={() => setPage((current) => current - 1)}
              >
                Précédent
              </button>
              <span className="muted">
                Page {page + 1} sur {pageCount}
              </span>
              <button
                type="button"
                className="button button-secondary"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((current) => current + 1)}
              >
                Suivant
              </button>
            </div>
          )}
          {invalidRows > 0 && (
            <div className="notice notice-warning">
              <p>
                {invalidRows} ligne{invalidRows > 1 ? "s" : ""} comporte
                {invalidRows > 1 ? "nt" : ""} des erreurs. Corrigez le CSV ou
                choisissez explicitement un import partiel.
              </p>
              <label className="import-check">
                <input
                  type="checkbox"
                  checked={allowPartial}
                  disabled={Boolean(pending)}
                  onChange={(event) => setAllowPartial(event.target.checked)}
                />
                <span>
                  Importer uniquement les lignes valides et ignorer les lignes
                  en erreur.
                </span>
              </label>
            </div>
          )}
          {hasProbableDuplicates && (
            <div className="notice notice-warning">
              <p>
                Des lignes sans identifiant source ressemblent à des données
                déjà enregistrées. Vérifiez chaque alerte avant de continuer.
              </p>
              <label className="import-check">
                <input
                  type="checkbox"
                  checked={allowProbableDuplicates}
                  disabled={Boolean(pending)}
                  onChange={(event) =>
                    setAllowProbableDuplicates(event.target.checked)
                  }
                />
                <span>
                  J’ai vérifié les doublons probables et souhaite quand même les
                  importer.
                </span>
              </label>
            </div>
          )}
          <label className="import-check">
            <input
              type="checkbox"
              checked={rightsConfirmed}
              disabled={Boolean(pending)}
              onChange={(event) => setRightsConfirmed(event.target.checked)}
            />
            <span>
              Je confirme avoir le droit d’importer et de traiter ces données
              dans cette application.
            </span>
          </label>
          <div className="import-actions">
            <button
              type="button"
              className="button button-primary"
              disabled={!canCommit}
              onClick={() => {
                void commitImport();
              }}
            >
              {pending === "commit"
                ? "Import en cours…"
                : `Importer ${validRows} ligne${validRows > 1 ? "s" : ""} valide${validRows > 1 ? "s" : ""}`}
            </button>
            <span className="muted">
              Les contrôles sont relancés au moment de l’enregistrement.
            </span>
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="history-title">
        <div className="panel-head">
          <div>
            <p className="eyebrow">HISTORIQUE</p>
            <h3 id="history-title">Imports enregistrés</h3>
          </div>
          <span className="badge badge-muted">
            {state.imports.length} import{state.imports.length > 1 ? "s" : ""}
          </span>
        </div>
        {state.imports.length === 0 ? (
          <div className="empty-state">
            <h4>Aucun import dans cet espace</h4>
            <p className="muted">
              Chargez un CSV puis contrôlez les lignes avant de confirmer
              l’import.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Source / date</th>
                  <th scope="col">Type</th>
                  <th scope="col">Créées</th>
                  <th scope="col">Mises à jour</th>
                  <th scope="col">Ignorées</th>
                  <th scope="col">Détail</th>
                </tr>
              </thead>
              <tbody>
                {[...state.imports]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((batch) => (
                    <tr key={batch.id}>
                      <td>
                        <strong>{batch.fileName}</strong>
                        <div className="muted">{dateLabel(batch.at)}</div>
                      </td>
                      <td>
                        {batch.kind === "picks" ? "Pronostics" : "Tickets"}
                      </td>
                      <td>{batch.created}</td>
                      <td>{batch.updated}</td>
                      <td>{batch.skipped}</td>
                      <td>
                        {batch.errors.length > 0 ? (
                          <details>
                            <summary>
                              {batch.errors.length} erreur
                              {batch.errors.length > 1 ? "s" : ""}
                            </summary>
                            {batch.errors.map((issue, index) => (
                              <p key={`${issue.row}-${index}`}>
                                Ligne {issue.row} : {issue.message}
                              </p>
                            ))}
                          </details>
                        ) : (
                          <span className="badge badge-teal">Traité</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
