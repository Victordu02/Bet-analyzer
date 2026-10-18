"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { RESULT_LABELS, type AppState } from "../domain/types";

export type FormKind = "tipster" | "pick" | "quote" | "ticket" | "ledger" | "strategy" | "simulation";

type EntityFormsProps = {
  kind: FormKind;
  state: AppState;
  initial?: Record<string, unknown>;
  onSave: (action: string, payload: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
};

function parisDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function parisToISO(value: string): string | null {
  if (!value) return null;
  const target = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(target)) throw new Error("Une date est invalide.");
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const represented = Date.parse(`${parisDate(new Date(candidate).toISOString())}:00Z`);
    candidate += target - represented;
  }
  if (parisDate(new Date(candidate).toISOString()) !== value) {
    throw new Error("Cette heure n’existe pas à Paris lors du changement d’heure. Choisissez une autre heure.");
  }
  return new Date(candidate).toISOString();
}

function Field({ label, full = false, children, hint }: { label: string; full?: boolean; children: ReactNode; hint?: string }) {
  return <label className={`field${full ? " field-full" : ""}`}><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>;
}

function More({ title = "Informations complémentaires", children }: { title?: string; children: ReactNode }) {
  return <details className="field-full"><summary>{title}</summary><div className="form-grid" style={{ marginTop: 14 }}>{children}</div></details>;
}

export function EntityForms({ kind, state, initial = {}, onSave, onClose }: EntityFormsProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(String(initial.result ?? "open"));
  const [linkedPickId, setLinkedPickId] = useState(String(initial.pickId ?? ""));
  const [method, setMethod] = useState(String(initial.method ?? "fixed"));
  const [selectedPicks, setSelectedPicks] = useState<string[]>(() => {
    if (!Array.isArray(initial.pickIds)) return [];
    return initial.pickIds.filter((id): id is string => typeof id === "string" && state.picks.some((pick) => pick.id === id));
  });
  const [quoteAvailable, setQuoteAvailable] = useState(initial.available !== false);
  const now = new Date().toISOString();
  const linkedPick = state.picks.find((pick) => pick.id === linkedPickId);
  const value = (name: string, fallback: unknown = "") => String(initial[name] ?? fallback ?? "");
  const ticketValue = (name: "event" | "market" | "selection" | "eventKey" | "line" | "rules" | "kind") => (
    String(linkedPick && linkedPickId !== String(initial.pickId ?? "") ? linkedPick[name] : initial[name] ?? linkedPick?.[name] ?? "")
  );
  const money = (name: string, fallback = 0) => Number(initial[name] ?? fallback) / 100;
  const filter = (initial.filter ?? {}) as Record<string, unknown>;
  const input = (name: string, label: string, options: { required?: boolean; type?: string; fallback?: unknown; min?: number; max?: number; step?: string; full?: boolean; hint?: string } = {}) => (
    <Field key={name} label={label} full={options.full} hint={options.hint}><input name={name} type={options.type ?? "text"} defaultValue={value(name, options.fallback)} required={options.required} min={options.min} max={options.max} step={options.step} /></Field>
  );
  const date = (name: string, label: string, required = false, fallback: unknown = "") => (
    <Field key={name} label={label}><input name={name} type="datetime-local" defaultValue={parisDate(initial[name] ?? fallback)} required={required} /></Field>
  );
  const textarea = (name: string, label: string, fallback = "") => <Field key={name} label={label} full><textarea name={name} defaultValue={value(name, fallback)} rows={3} /></Field>;
  const checkbox = (name: string, label: string, fallback = false) => <label className="field field-full" key={name}><span><input name={name} type="checkbox" defaultChecked={Boolean(initial[name] ?? fallback)} /> {label}</span></label>;
  const tipsters = (name: string, required = false, fallback = "") => <Field label="Tipster"><select name={name} defaultValue={value(name, fallback)} required={required}><option value="">{required ? "Choisir un tipster" : "Tous les tipsters"}</option>{state.tipsters.map((tipster) => <option key={tipster.id} value={tipster.id}>{tipster.name}</option>)}</select></Field>;
  const strategies = (required = false) => <Field label="Stratégie associée"><select name="strategyId" defaultValue={value("strategyId")} required={required}><option value="">Sans stratégie enregistrée</option>{state.strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}</select></Field>;
  const pickSelect = (required = true) => <Field label="Pronostic associé" full><select name="pickId" value={linkedPickId} onChange={(event) => setLinkedPickId(event.target.value)} required={required}><option value="">{required ? "Choisir un pronostic" : "Ticket indépendant"}</option>{state.picks.map((pick) => <option key={pick.id} value={pick.id}>{pick.event} · {pick.selection} · {state.tipsters.find((tipster) => tipster.id === pick.tipsterId)?.name ?? "Tipster"}</option>)}</select></Field>;
  const resultSelect = <Field label="Résultat"><select name="result" value={result} onChange={(event) => setResult(event.target.value)}>{Object.entries(RESULT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>;
  const kindSelect = <Field label="Type de pari"><select name="kind" defaultValue={value("kind", "single")}><option value="single">Simple</option><option value="accumulator">Combiné</option></select></Field>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const number = (name: string, fallback = 0) => text(name) === "" ? fallback : Number(text(name));
    const optionalNumber = (name: string) => text(name) === "" ? null : number(name);
    const cents = (name: string) => Math.round(number(name) * 100);
    const iso = (name: string) => parisToISO(text(name));
    const strings = (...names: string[]) => Object.fromEntries(names.map((name) => [name, text(name)]));
    const base: Record<string, unknown> = initial.id ? { id: initial.id } : {};
    let payload: Record<string, unknown>;
    try {
      switch (kind) {
        case "tipster":
          payload = { ...base, ...strings("name", "source", "sourceUrl", "notes", "accessNotes", "completeness"), discoveredAt: iso("discoveredAt"), active: data.has("active"), monthlyCostCents: cents("monthlyCost"), bankrolls: text("bankrolls").split(",").map((item) => item.trim()).filter(Boolean) };
          break;
        case "pick":
          payload = { ...base, ...strings("tipsterId", "sourceId", "sourceUrl", "event", "eventKey", "sport", "competition", "market", "selection", "line", "rules", "kind", "timing", "argument", "notes", "result", "settlementSource"), publishedAt: iso("publishedAt"), startsAt: iso("startsAt"), settledAt: iso("settledAt"), odds: number("odds"), minOdds: optionalNumber("minOdds"), stakeUnits: number("stakeUnits", 1) };
          break;
        case "quote":
          payload = { ...base, ...strings("pickId", "source", "sourceUrl", "notes"), bookmaker: "Winamax FR", observedAt: iso("observedAt"), odds: data.has("available") ? optionalNumber("odds") : null, available: data.has("available"), matchConfirmed: data.has("matchConfirmed"), closing: data.has("closing"), referenceProbability: text("referenceProbability") === "" ? null : number("referenceProbability") / 100 };
          break;
        case "ticket": {
          const hasPartialCashout = data.has("partialCashout");
          const remaining = text("remainingStake") === "" ? null : cents("remainingStake");
          payload = { ...base, ...strings("sourceId", "bookmaker", "event", "eventKey", "selection", "market", "line", "rules", "kind", "funding", "result", "source", "notes"), pickId: text("pickId") || null, strategyId: text("strategyId") || null, odds: number("odds"), stakeCents: cents("stake"), returnCents: cents("return"), feeCents: cents("fee"), remainingStakeCents: remaining, partialCashout: hasPartialCashout, placedAt: iso("placedAt"), settledAt: iso("settledAt") };
          break;
        }
        case "ledger": {
          const ledgerKind = text("ledgerKind");
          const enteredAmount = cents("amount");
          const amountCents = ["withdrawal", "fee"].includes(ledgerKind) ? -Math.abs(enteredAmount) : ["initial", "deposit"].includes(ledgerKind) ? Math.abs(enteredAmount) : enteredAmount;
          if (amountCents === 0 && ledgerKind !== "initial") throw new Error("Le montant du mouvement doit être différent de zéro.");
          payload = { kind: ledgerKind, amountCents, description: text("description"), at: iso("at") };
          break;
        }
        case "strategy": {
          const strategyFilter: Record<string, unknown> = {};
          for (const name of ["tipsterId", "sport", "competition", "market", "kind", "timing"]) if (text(name)) strategyFilter[name] = text(name);
          for (const name of ["oddsMin", "oddsMax", "delayMinMinutes", "delayMaxMinutes"]) if (text(name)) strategyFilter[name] = number(name);
          const discoveryEnd = iso("discoveryEnd");
          const validationStart = iso("validationStart");
          if (!discoveryEnd || !validationStart || discoveryEnd >= validationStart) throw new Error("La validation doit commencer après la fin de la période de découverte.");
          if (typeof strategyFilter.oddsMin === "number" && typeof strategyFilter.oddsMax === "number" && strategyFilter.oddsMin > strategyFilter.oddsMax) throw new Error("La cote minimale doit être inférieure ou égale à la cote maximale.");
          if (typeof strategyFilter.delayMinMinutes === "number" && typeof strategyFilter.delayMaxMinutes === "number" && strategyFilter.delayMinMinutes > strategyFilter.delayMaxMinutes) throw new Error("Le délai minimal doit être inférieur ou égal au délai maximal.");
          payload = { ...base, name: text("name"), filter: strategyFilter, discoveryEnd, validationStart, active: data.has("active"), notes: text("notes") };
          break;
        }
        case "simulation": {
          if (!selectedPicks.length) throw new Error("Sélectionnez au moins un pronostic à simuler.");
          const candidates = selectedPicks.map((pickId) => {
            const raw = text(`probability:${pickId}`);
            const probability = raw === "" ? null : Number(raw) / 100;
            if (probability !== null && (!Number.isFinite(probability) || probability <= 0 || probability >= 1)) throw new Error("Une probabilité doit être strictement comprise entre 0 et 100 %.");
            return { pickId, probability, probabilitySource: probability === null ? null : "manual" };
          });
          payload = { name: text("name"), strategyId: text("strategyId") || null, method: text("method"), candidates, assumptions: text("assumptions") };
          break;
        }
      }
      setSaving(true);
      await onSave(kind === "ledger" ? "ledger.add" : `${kind}.save`, payload);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "L’enregistrement a échoué. Vérifiez les champs puis réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={submit}>
    <div className="form-grid">
      {kind !== "simulation" && <p className="muted field-full">Les dates et heures sont exprimées dans le fuseau Europe/Paris. Les montants sont en euros.</p>}

      {kind === "tipster" && <>
        {input("name", "Nom du tipster", { required: true })}
        {input("source", "Source / canal", { required: true, hint: "Ex. canal Telegram public, site ou export fourni." })}
        {input("sourceUrl", "Lien vers la source", { type: "url" })}
        {date("discoveredAt", "Découvert le", true, now)}
        <Field label="Coût mensuel (€)"><input name="monthlyCost" type="number" min="0" step="0.01" defaultValue={money("monthlyCostCents")} required /></Field>
        <Field label="Couverture des données"><select name="completeness" defaultValue={value("completeness", "unknown")}><option value="unknown">Historique potentiellement incomplet</option><option value="provided_complete">Historique déclaré complet par la source</option></select></Field>
        {checkbox("active", "Suivre ce tipster", true)}
        {textarea("notes", "Notes et contexte")}
        <More>
          {textarea("accessNotes", "Conditions d’accès / restrictions", "")}
          {input("bankrolls", "Bankrolls déclarées", { fallback: Array.isArray(initial.bankrolls) ? initial.bankrolls.join(", ") : "", full: true, hint: "Libellés séparés par des virgules. Aucune connexion de compte n’est effectuée." })}
        </More>
      </>}

      {kind === "pick" && <>
        {!state.tipsters.length && <p className="notice field-full">Ajoutez d’abord un tipster pour rattacher ce pronostic à une source.</p>}
        {tipsters("tipsterId", true)}
        {input("sourceId", "Identifiant du message ou de la ligne source", { required: true, hint: "Identifiant stable pour retrouver le pronostic et éviter les doublons." })}
        {input("event", "Événement", { required: true, full: true })}
        {input("sport", "Sport", { required: true, fallback: "Football" })}
        {input("competition", "Compétition")}
        {input("market", "Marché", { required: true, hint: "Ex. Résultat 1N2, total buts." })}
        {input("selection", "Sélection", { required: true })}
        {input("odds", "Cote publiée", { type: "number", min: 1.001, step: "any", required: true })}
        {input("stakeUnits", "Mise conseillée (unités)", { type: "number", min: 0, step: "any", required: true, fallback: 1 })}
        {date("publishedAt", "Publication du pronostic", true, now)}
        {date("startsAt", "Début de l’événement", true)}
        <p className="muted field-full">L’heure d’observation et la qualité de la preuve sont enregistrées automatiquement. Un pronostic saisi après l’événement reste déclaré. L’archive initiale est conservée et toute correction de la sélection, de la cote ou du calendrier est tracée.</p>
        {kindSelect}
        <Field label="Moment du pari"><select name="timing" defaultValue={value("timing", "prematch")}><option value="prematch">Avant-match</option><option value="live">En direct</option></select></Field>
        {resultSelect}
        {result !== "open" && <>{date("settledAt", "Date du résultat", true, now)}{input("settlementSource", "Source du résultat", { required: true })}</>}
        <More title="Identité précise, preuve et contexte">
          {input("sourceUrl", "Lien vers le pronostic", { type: "url", full: true })}
          {input("eventKey", "Identifiant partagé de l’événement", { hint: "Utilisez la même clé pour tous les paris portant sur ce match." })}
          {input("line", "Ligne / handicap", { hint: "Ex. 2.5, −1.0. À renseigner pour un total ou handicap." })}
          {input("rules", "Règles de règlement", { hint: "Ex. temps réglementaire, prolongations incluses." })}
          {input("minOdds", "Cote minimale acceptée", { type: "number", min: 1.001, step: "any" })}
          {initial.initialContent ? <Field label="Archive initiale (conservée sans modification)" full><textarea value={String(initial.initialContent)} rows={4} readOnly /></Field> : null}
          {textarea("argument", "Contenu et argumentation de la source")}
          {textarea("notes", initial.id ? "Notes / motif de la correction" : "Notes")}
        </More>
      </>}

      {kind === "quote" && <>
        <p className="notice field-full">Relevez une cote effectivement affichée sur Winamax France. Confirmez le match, la sélection, la ligne et les règles avant de la déclarer exploitable.</p>
        {pickSelect()}
        {date("observedAt", "Cote observée le", true, now)}
        <label className="field"><span><input name="available" type="checkbox" checked={quoteAvailable} onChange={(event) => setQuoteAvailable(event.target.checked)} /> Marché disponible sur Winamax</span></label>
        {input("odds", "Cote Winamax observée", { type: "number", min: 1.001, step: "any", required: quoteAvailable })}
        {input("source", "Preuve / méthode de collecte", { required: true, hint: "Ex. capture datée ou relevé manuel personnel." })}
        {input("sourceUrl", "Lien de la preuve", { type: "url", full: true })}
        <label className="field field-full"><span><input name="matchConfirmed" type="checkbox" defaultChecked={Boolean(initial.matchConfirmed)} required={quoteAvailable} /> Je confirme l’identité exacte du marché, de la sélection, de la ligne et des règles</span></label>
        {checkbox("closing", "Cote de clôture observée avant le début de l’événement")}
        <More>
          <Field label="Probabilité de référence hors marge (%)" hint="Facultative. Indispensable pour une comparaison de CLV en probabilité ; ne pas confondre avec 1 / cote."><input name="referenceProbability" type="number" min="0.001" max="99.999" step="any" defaultValue={initial.referenceProbability == null ? "" : Number(initial.referenceProbability) * 100} /></Field>
          {textarea("notes", "Notes sur le relevé")}
        </More>
      </>}

      {kind === "ticket" && <>
        <p className="notice field-full">Enregistrez uniquement un ticket réellement exécuté. Le rendement de votre portefeuille est calculé à partir de ces tickets.</p>
        {pickSelect(false)}
        {input("sourceId", "Référence unique du ticket réel", { required: true })}
        {input("bookmaker", "Bookmaker", { required: true, fallback: "Winamax FR" })}
        {input("source", "Source du ticket", { required: true, hint: "Ex. relevé de compte Winamax, capture du ticket ou saisie manuelle vérifiée." })}
        {strategies()}
        <Field label="Événement" full><input key={`event:${linkedPickId}`} name="event" defaultValue={ticketValue("event")} required /></Field>
        <Field label="Marché"><input key={`market:${linkedPickId}`} name="market" defaultValue={ticketValue("market")} required /></Field>
        <Field label="Sélection"><input key={`selection:${linkedPickId}`} name="selection" defaultValue={ticketValue("selection")} required /></Field>
        {input("odds", "Cote réellement prise", { type: "number", min: 1.001, step: "any", required: true })}
        <Field label="Mise exécutée (€)"><input name="stake" type="number" min="0.01" step="0.01" defaultValue={initial.stakeCents == null ? "" : money("stakeCents")} required /></Field>
        <Field label="Financement"><select name="funding" defaultValue={value("funding", "cash")}><option value="cash">Argent réel</option><option value="freebet">Freebet</option></select></Field>
        <Field label="Type de pari"><select key={`kind:${linkedPickId}`} name="kind" defaultValue={ticketValue("kind") || "single"}><option value="single">Simple</option><option value="accumulator">Combiné</option></select></Field>
        {date("placedAt", "Ticket placé le", true, now)}
        {resultSelect}
        {result !== "open" && date("settledAt", "Ticket réglé le", true, now)}
        <Field label="Retour total encaissé (€)" hint="Somme réellement créditée, mise incluse lorsqu’elle est rendue. Saisir 0 pour un ticket perdu ou encore sans retour."><input name="return" type="number" min="0" step="0.01" defaultValue={money("returnCents")} required /></Field>
        <Field label="Frais du ticket (€)"><input name="fee" type="number" min="0" step="0.01" defaultValue={money("feeCents")} required /></Field>
        <More title="Cashout partiel et identité du marché">
          {checkbox("partialCashout", "Ce ticket a fait l’objet d’un cashout partiel")}
          <Field label="Mise restant exposée (€)" hint="Laisser vide si le coût restant est inconnu : exposition incertaine et nouvelles allocations bloquées. Inclure les encaissements déjà reçus dans le retour total."><input name="remainingStake" type="number" min="0" step="0.01" defaultValue={initial.remainingStakeCents == null ? "" : money("remainingStakeCents")} /></Field>
          <Field label="Identifiant partagé de l’événement"><input key={`eventKey:${linkedPickId}`} name="eventKey" defaultValue={ticketValue("eventKey")} /></Field>
          <Field label="Ligne / handicap"><input key={`line:${linkedPickId}`} name="line" defaultValue={ticketValue("line")} /></Field>
          <Field label="Règles de règlement" full><input key={`rules:${linkedPickId}`} name="rules" defaultValue={ticketValue("rules")} /></Field>
          {textarea("notes", initial.id ? "Notes / motif de la correction" : "Notes")}
        </More>
      </>}

      {kind === "ledger" && <>
        <p className="notice field-full">Les mises et retours des tickets sont comptabilisés automatiquement. Utilisez ces mouvements pour les apports, retraits, frais et autres activités du compte.</p>
        <Field label="Type de mouvement"><select name="ledgerKind" defaultValue={state.ledger.length ? "deposit" : "initial"}><option value="initial">Solde initial</option><option value="deposit">Dépôt</option><option value="withdrawal">Retrait</option><option value="adjustment">Ajustement signé</option><option value="poker">Poker — résultat net signé</option><option value="fee">Frais externes</option><option value="promotion">Promotion réellement créditée</option></select></Field>
        {input("amount", "Montant (€)", { type: "number", step: "0.01", required: true, hint: "Dépôts et retraits : montant positif, sens appliqué automatiquement. Ajustement et poker : montant positif ou négatif." })}
        {date("at", "Date du mouvement", true, now)}
        {input("description", "Description / justificatif", { required: true, full: true })}
      </>}

      {kind === "strategy" && <>
        <p className="notice field-full">Figez vos critères avant d’observer les résultats de validation. Une stratégie découverte sur l’historique doit être vérifiée sur une période ultérieure.</p>
        {input("name", "Nom de la stratégie", { required: true, full: true })}
        {date("discoveryEnd", "Fin de la période de découverte", true, new Date(Date.now() - 86_400_000).toISOString())}
        {date("validationStart", "Début de la validation hors échantillon", true, now)}
        {tipsters("tipsterId", false, String(filter.tipsterId ?? ""))}
        {([['sport', 'Sport'], ['competition', 'Compétition'], ['market', 'Marché']] as const).map(([name, label]) => <Field key={name} label={label}><input name={name} defaultValue={String(filter[name] ?? "")} placeholder="Tous" /></Field>)}
        <Field label="Type de pari"><select name="kind" defaultValue={String(filter.kind ?? "")}><option value="">Tous</option><option value="single">Simple</option><option value="accumulator">Combiné</option></select></Field>
        <Field label="Moment du pari"><select name="timing" defaultValue={String(filter.timing ?? "")}><option value="">Tous</option><option value="prematch">Avant-match</option><option value="live">En direct</option></select></Field>
        {([['oddsMin', 'Cote minimale'], ['oddsMax', 'Cote maximale'], ['delayMinMinutes', 'Délai minimal après publication (min)'], ['delayMaxMinutes', 'Délai maximal après publication (min)']] as const).map(([name, label]) => <Field key={name} label={label}><input name={name} type="number" min={name.startsWith("odds") ? "1.001" : "0"} step="any" defaultValue={filter[name] == null ? "" : String(filter[name])} /></Field>)}
        {checkbox("active", "Stratégie active", true)}
        {textarea("notes", "Hypothèse et conditions de validation")}
      </>}

      {kind === "simulation" && <>
        <p className="notice field-full">Cette simulation n’exécute aucun pari. Les mises sont calculées à partir du capital disponible, des limites définies et des cotes Winamax admissibles.</p>
        {input("name", "Nom de la simulation", { required: true, fallback: `Simulation du ${new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}` })}
        {strategies()}
        <Field label="Méthode de mise"><select name="method" value={method} onChange={(event) => setMethod(event.target.value)}><option value="fixed">Mise fixe</option><option value="percent">Pourcentage du capital</option><option value="kelly">Kelly fractionné</option></select></Field>
        <p className="muted">{method === "fixed" ? `Mise cible : ${(state.settings.fixedStakeCents / 100).toFixed(2)} €.` : method === "percent" ? `Mise cible : ${(state.settings.stakePercent * 100).toFixed(2)} % du capital.` : `Fraction Kelly : ${(state.settings.kellyFraction * 100).toFixed(0)} %. Une hypothèse de probabilité est nécessaire pour Kelly.`} Ces paramètres et les plafonds se règlent dans les réglages.</p>
        <fieldset className="field-full" style={{ border: "1px solid var(--border, #dce3ee)", borderRadius: 10, padding: 14 }}>
          <legend>Pronostics candidats</legend>
          {!state.picks.some((pick) => pick.result === "open") && <p className="muted">Ajoutez un pronostic ouvert puis relevez sa cote Winamax pour construire une simulation.</p>}
          {state.picks.filter((pick) => pick.result === "open").map((pick) => <div key={pick.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--border, #dce3ee)" }}>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" checked={selectedPicks.includes(pick.id)} onChange={(event) => setSelectedPicks((current) => event.target.checked ? [...current, pick.id] : current.filter((id) => id !== pick.id))} /><span><strong>{pick.event}</strong><br /><span className="muted">{pick.market} · {pick.selection} {pick.line} · {state.tipsters.find((tipster) => tipster.id === pick.tipsterId)?.name ?? "Tipster"}</span></span></label>
            {selectedPicks.includes(pick.id) && <div style={{ marginTop: 10 }}><Field label="Votre hypothèse de probabilité (%)" hint="Saisie manuelle, non validée. Une probabilité n’est pas estimée à partir du seul historique du tipster."><input name={`probability:${pick.id}`} type="number" min="0.001" max="99.999" step="any" placeholder={method === "kelly" ? "Nécessaire pour allouer avec Kelly" : "Facultatif pour calculer l’espérance"} /></Field></div>}
          </div>)}
        </fieldset>
        {textarea("assumptions", "Hypothèses de simulation et origine des probabilités")}
      </>}
    </div>
    {error && <p className="notice" role="alert" style={{ color: "var(--danger, #a12029)", marginTop: 16 }}>{error}</p>}
    <div className="form-actions"><button className="button" type="button" onClick={onClose} disabled={saving}>Annuler</button><button className="button button-primary" type="submit" disabled={saving || (kind === "pick" && !state.tipsters.length) || (kind === "quote" && !state.picks.length)}>{saving ? "Enregistrement…" : kind === "simulation" ? "Calculer et enregistrer" : initial.id ? "Enregistrer les modifications" : "Enregistrer"}</button></div>
  </form>;
}
