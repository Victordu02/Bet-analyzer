"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { reconcileCash } from "@/domain/finance";
import type {
  AppState,
  AuditEntry,
  ReconciliationSnapshot,
} from "@/domain/types";
import { formatMoney } from "./analysis-ui";
import {
  centsInput,
  parseEuroCents,
  parisInput,
  parseParisDate,
} from "./financial-inputs";

type ReconciliationRecord = ReconciliationSnapshot & {
  uncertain?: boolean;
  issues?: string[];
};
type HistoryRow = { audit: AuditEntry; snapshot: ReconciliationRecord };

function formatDateTime(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Non renseignée";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function provisional(value: {
  hasLedgerHistory: boolean;
  uncertain?: boolean;
}): boolean {
  return !value.hasLedgerHistory || value.uncertain === true;
}

function readHistory(entry: AuditEntry): HistoryRow | null {
  if (entry.action !== "reconciliation.save") return null;
  try {
    const value = JSON.parse(entry.detail) as Partial<ReconciliationRecord>;
    if (
      value.schemaVersion !== 1 ||
      !Number.isSafeInteger(value.balanceCents) ||
      !Number.isSafeInteger(value.calculatedCashCents) ||
      !Number.isSafeInteger(value.differenceCents) ||
      !value.at ||
      !Number.isFinite(Date.parse(value.at)) ||
      typeof value.source !== "string" ||
      !Array.isArray(value.ledgerEntryIds)
    )
      return null;
    return { audit: entry, snapshot: value as ReconciliationRecord };
  } catch {
    return null;
  }
}

export function ReconciliationForm({
  state,
  mutate,
}: {
  state: AppState;
  mutate: (
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
}) {
  const id = useId();
  const [balance, setBalance] = useState(() =>
    centsInput(state.settings.reconciliationBalanceCents),
  );
  const [at, setAt] = useState(() =>
    parisInput(new Date().toISOString(), true),
  );
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const history = useMemo(
    () =>
      state.audit
        .flatMap((entry) => {
          const row = readHistory(entry);
          return row ? [row] : [];
        })
        .sort((left, right) => right.audit.at.localeCompare(left.audit.at)),
    [state.audit],
  );
  const activeReference = useMemo(() => reconcileCash(state), [state]);
  const activeSnapshot = history.find(
    (row) =>
      row.snapshot.at === state.settings.reconciledAt &&
      row.snapshot.balanceCents === state.settings.reconciliationBalanceCents,
  );
  const preview = useMemo(() => {
    if (!balance.trim() || !at) return null;
    try {
      const amountCents = parseEuroCents(balance, "Solde relevé");
      const instant = parseParisDate(at);
      if (amountCents < 0 || Date.parse(instant) > Date.now()) return null;
      return reconcileCash(state, amountCents, instant);
    } catch {
      return null;
    }
  }, [state, balance, at]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    try {
      const balanceCents = parseEuroCents(balance, "Solde relevé");
      if (balanceCents < 0)
        throw new Error("Le solde cash relevé doit être positif ou nul.");
      const instant = parseParisDate(at);
      if (Date.parse(instant) > Date.now())
        throw new Error("La date du relevé ne peut pas être future.");
      if (!source.trim())
        throw new Error("Renseignez la source ou le justificatif du relevé.");
      setBusy(true);
      await mutate("reconciliation.save", {
        balanceCents,
        at: instant,
        source: source.trim(),
        notes: notes.trim(),
      });
      setFeedback({
        error: false,
        text: "Relevé conservé avec son écart et les écritures connues lors de l’enregistrement. Aucun mouvement de cash créé.",
      });
    } catch (error) {
      setFeedback({
        error: true,
        text:
          error instanceof Error
            ? error.message
            : "Impossible d’enregistrer le relevé.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="panel panel-pad stack"
      aria-labelledby={`${id}-heading`}
    >
      <div className="section-heading">
        <div>
          <h2 id={`${id}-heading`}>Rapprochement au centime</h2>
          <p>
            Comparez le cash disponible Winamax au journal à la date exacte du
            relevé.
          </p>
        </div>
      </div>
      <p className="notice">
        Excluez les bonus non convertibles et les mises déjà engagées. Un relevé
        ne crée ni dépôt, ni remboursement, ni ajustement automatique.
      </p>

      {state.settings.reconciliationBalanceCents !== null &&
        state.settings.reconciledAt && (
          <div>
            <h3>Dernière référence par date de relevé</h3>
            <dl className="detail-list">
              <div className="detail-line">
                <dt>Relevé du compte</dt>
                <dd>{formatDateTime(activeReference.at)}</dd>
              </div>
              <div className="detail-line">
                <dt>Cash déclaré</dt>
                <dd>{formatMoney(activeReference.observedCents)}</dd>
              </div>
              <div className="detail-line">
                <dt>Cash du journal à cette date</dt>
                <dd>{formatMoney(activeReference.ledgerCashCents)}</dd>
              </div>
              <div className="detail-line">
                <dt>Écart recalculé aujourd’hui · déclaré − journal</dt>
                <dd>{formatMoney(activeReference.differenceCents, true)}</dd>
              </div>
              {activeSnapshot && (
                <div className="detail-line">
                  <dt>Écart conservé lors de l’enregistrement</dt>
                  <dd>
                    {formatMoney(activeSnapshot.snapshot.differenceCents, true)}
                  </dd>
                </div>
              )}
            </dl>
            <p
              className={`notice ${activeReference.status === "matched" && !provisional(activeReference) ? "" : "notice-warning"}`}
            >
              {activeReference.message}
            </p>
          </div>
        )}

      <form onSubmit={save} className="stack">
        <div className="form-grid">
          <label className="field">
            <span>Solde réel disponible (€)</span>
            <input
              name="reconciliationBalance"
              type="text"
              inputMode="decimal"
              value={balance}
              onChange={(event) => setBalance(event.target.value)}
              placeholder="Ex. 1 030,00"
              required
              disabled={busy}
            />
            <small>
              Montant exact à deux décimales maximum, sans arrondi masquant un
              sous-centime.
            </small>
          </label>
          <label className="field">
            <span>Date et heure du relevé (Paris)</span>
            <input
              name="reconciledAt"
              type="datetime-local"
              step="1"
              value={at}
              onChange={(event) => setAt(event.target.value)}
              required
              disabled={busy}
            />
            <small>
              Les écritures postérieures à cet instant ne participent pas à la
              comparaison.
            </small>
          </label>
          <label className="field field-full">
            <span>Source / justificatif du relevé</span>
            <input
              name="reconciliationSource"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              maxLength={1000}
              placeholder="Relevé Winamax consulté, document personnel…"
              required
              disabled={busy}
            />
          </label>
          <label className="field field-full">
            <span>Notes de rapprochement</span>
            <textarea
              name="reconciliationNotes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={20000}
              disabled={busy}
              placeholder="Mouvement manquant, correction à vérifier ou périmètre du solde…"
            />
          </label>
        </div>
        {preview && (
          <div className="comparison-grid" aria-live="polite">
            <div className="calculation-output">
              <small>Cash du journal à la date saisie</small>
              <strong>{formatMoney(preview.ledgerCashCents)}</strong>
            </div>
            <div className="calculation-output">
              <small>Écart · déclaré − journal</small>
              <strong>{formatMoney(preview.differenceCents, true)}</strong>
            </div>
            <p
              className={`notice ${preview.status === "matched" && !provisional(preview) ? "" : "notice-warning"}`}
            >
              {preview.message}
            </p>
          </div>
        )}
        <div className="form-actions">
          <button
            className="button button-primary"
            type="submit"
            disabled={busy}
          >
            {busy ? "Enregistrement…" : "Enregistrer le solde de référence"}
          </button>
        </div>
        {feedback && (
          <p
            className={`notice ${feedback.error ? "notice-error" : ""}`}
            role={feedback.error ? "alert" : "status"}
          >
            {feedback.text}
          </p>
        )}
      </form>

      <div>
        <h3>Historique des relevés conservés</h3>
        <p className="muted">
          Le cash historique est retraité avec les corrections aujourd’hui
          connues. Chaque relevé conserve séparément le résultat calculé lors de
          son enregistrement ; les anciennes captures ne sont jamais remplacées.
        </p>
        {history.length ? (
          <div
            className="table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Historique des rapprochements"
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Date du relevé / source</th>
                  <th scope="col">Solde déclaré</th>
                  <th scope="col">Journal au moment de la capture</th>
                  <th scope="col">Écart conservé</th>
                  <th scope="col">Traçabilité</th>
                </tr>
              </thead>
              <tbody>
                {(showAll ? history : history.slice(0, 8)).map(
                  ({ audit, snapshot }) => (
                    <tr key={audit.id}>
                      <td>
                        {formatDateTime(snapshot.at)}
                        <small>{snapshot.source}</small>
                        {snapshot.notes && <small>{snapshot.notes}</small>}
                      </td>
                      <td>{formatMoney(snapshot.balanceCents)}</td>
                      <td>{formatMoney(snapshot.calculatedCashCents)}</td>
                      <td>
                        {formatMoney(snapshot.differenceCents, true)}
                        {(!snapshot.hasLedgerHistory || snapshot.uncertain) && (
                          <small>Historique incomplet ou provisoire</small>
                        )}
                      </td>
                      <td>
                        <details>
                          <summary>
                            {snapshot.ledgerEntryIds.length} écritures de
                            référence
                          </summary>
                          <p className="muted">
                            Enregistré le {formatDateTime(snapshot.recordedAt)}{" "}
                            · {audit.id}
                          </p>
                          {snapshot.issues?.map((issue) => (
                            <p className="notice notice-warning" key={issue}>
                              {issue}
                            </p>
                          ))}
                          <ul className="analysis-limitations">
                            {snapshot.ledgerEntryIds.map((entryId) => (
                              <li key={entryId}>
                                <code className="reference-code">
                                  {entryId}
                                </code>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mini-empty">
            Aucun relevé audité enregistré. Un écart peut être documenté sans
            créer de mouvement financier.
          </p>
        )}
        {history.length > 8 && (
          <button
            type="button"
            className="text-link"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll
              ? "Afficher les huit derniers relevés"
              : `Afficher les ${history.length} relevés`}
          </button>
        )}
      </div>
    </section>
  );
}
