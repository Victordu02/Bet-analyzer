"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { AppState } from "../domain/types";

type SettingsViewProps = {
  state: AppState;
  mutate: (action: string, payload: Record<string, unknown>) => Promise<unknown>;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>;
}

function parisDate(value: string): string {
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function parisToISO(value: string): string {
  const target = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(target)) throw new Error("La date du relevé est invalide.");
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) candidate += target - Date.parse(`${parisDate(new Date(candidate).toISOString())}:00Z`);
  if (parisDate(new Date(candidate).toISOString()) !== value) throw new Error("Cette heure n’existe pas à Paris lors du changement d’heure.");
  return new Date(candidate).toISOString();
}

export function SettingsView({ state, mutate }: SettingsViewProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ section: string; error: boolean; text: string } | null>(null);
  const settings = state.settings;
  const euroValue = (value: number | null) => value === null ? "" : value / 100;
  const percentValue = (value: number | null) => value === null ? "" : value * 100;

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = (name: string) => Math.round(Number(data.get(name)) * 100);
    const optionalAmount = (name: string) => String(data.get(name) ?? "").trim() === "" ? null : amount(name);
    const fraction = (name: string) => Number(data.get(name)) / 100;
    const optionalFraction = (name: string) => String(data.get(name) ?? "").trim() === "" ? null : fraction(name);
    setBusy("settings");
    setMessage(null);
    try {
      await mutate("settings.save", {
        currency: "EUR", timezone: "Europe/Paris", fixedStakeCents: amount("fixedStake"), stakePercent: fraction("stakePercent"), kellyFraction: fraction("kellyFraction"),
        maxBetPercent: optionalFraction("maxBetPercent"), maxEventPercent: optionalFraction("maxEventPercent"), maxExposurePercent: optionalFraction("maxExposurePercent"),
        dailyLossLimitCents: optionalAmount("dailyLossLimit"), monthlyLossLimitCents: optionalAmount("monthlyLossLimit"), paused: data.has("paused"),
        quoteMaxAgeMinutes: Number(data.get("quoteMaxAgeMinutes")), reportFrequency: String(data.get("reportFrequency")), reportHour: String(data.get("reportHour")),
      });
      setMessage({ section: "settings", error: false, text: "Réglages enregistrés pour cet espace." });
    } catch (cause) {
      setMessage({ section: "settings", error: true, text: cause instanceof Error ? cause.message : "Impossible d’enregistrer les réglages." });
    } finally {
      setBusy(null);
    }
  }

  async function reconcile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy("reconcile");
    setMessage(null);
    try {
      const balance = String(data.get("reconciliationBalance") ?? "").trim();
      const reconciledAt = balance ? parisToISO(String(data.get("reconciledAt"))) : null;
      if (reconciledAt && reconciledAt > new Date().toISOString()) throw new Error("La date du relevé ne peut pas être dans le futur.");
      await mutate("settings.save", { reconciliationBalanceCents: balance ? Math.round(Number(balance) * 100) : null, reconciledAt });
      setMessage({ section: "reconcile", error: false, text: balance ? "Solde de référence enregistré. L’écart est visible dans le portefeuille." : "Solde de référence effacé." });
    } catch (cause) {
      setMessage({ section: "reconcile", error: true, text: cause instanceof Error ? cause.message : "Impossible d’enregistrer le rapprochement." });
    } finally {
      setBusy(null);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage(null);
    if (data.get("newPassword") !== data.get("confirmPassword")) {
      setMessage({ section: "password", error: true, text: "La confirmation du nouveau mot de passe ne correspond pas." });
      return;
    }
    setBusy("password");
    try {
      const response = await fetch("/api/password", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Le changement du mot de passe a échoué.");
      form.reset();
      setMessage({ section: "password", error: false, text: "Mot de passe modifié. Les autres sessions devront se reconnecter." });
    } catch (cause) {
      setMessage({ section: "password", error: true, text: cause instanceof Error ? cause.message : "Impossible de modifier le mot de passe." });
    } finally {
      setBusy(null);
    }
  }

  const feedback = (section: string) => message?.section === section && <p className="notice" role={message.error ? "alert" : "status"} style={message.error ? { color: "var(--danger, #a12029)" } : undefined}>{message.text}</p>;
  const percentInput = (name: "maxBetPercent" | "maxEventPercent" | "maxExposurePercent", label: string, hint: string) => <Field label={label} hint={hint}><input name={name} type="number" min="0" max="100" step="any" defaultValue={percentValue(settings[name])} placeholder="Non défini" /></Field>;

  return <div>
    <form key={`settings:${state.workspace}`} onSubmit={saveSettings}>
      <section className="panel settings-section">
        <h2>Mises et limites</h2>
        <p className="muted">Réglages de l’espace {state.workspace === "demo" ? "démonstration" : "personnel"}. Devise : EUR. Fuseau horaire : Europe/Paris.</p>
        <div className="form-grid">
          <Field label="Mise fixe (€)"><input name="fixedStake" type="number" min="0" step="0.01" defaultValue={euroValue(settings.fixedStakeCents)} required /></Field>
          <Field label="Mise proportionnelle (%)" hint="Part du capital disponible à allouer à un pari."><input name="stakePercent" type="number" min="0" max="100" step="any" defaultValue={percentValue(settings.stakePercent)} required /></Field>
          <Field label="Fraction de Kelly (%)" hint="25 % correspond à un quart de Kelly. Une probabilité de gain explicite est nécessaire."><input name="kellyFraction" type="number" min="0" max="100" step="any" defaultValue={percentValue(settings.kellyFraction)} required /></Field>
          <Field label="Validité maximale d’une cote (min)" hint="Une cote plus ancienne sera écartée des nouvelles allocations."><input name="quoteMaxAgeMinutes" type="number" min="1" max="1440" step="1" defaultValue={settings.quoteMaxAgeMinutes} required /></Field>
          {percentInput("maxBetPercent", "Plafond par pari (%)", "Mise maximale d’un pari en part du capital.")}
          {percentInput("maxEventPercent", "Plafond par événement (%)", "Exposition cumulée sur le même événement, tous tipsters confondus.")}
          {percentInput("maxExposurePercent", "Plafond d’exposition totale (%)", "Exposition cumulée de tous les tickets encore ouverts.")}
          <div className="field"><span className="muted">Les trois plafonds et les deux limites de pertes doivent être positifs pour autoriser une allocation. Un champ vide conserve une limite non configurée et bloque les nouvelles propositions ; 0 % interdit toute exposition.</span></div>
          <Field label="Limite de pertes quotidiennes (€)" hint="Une valeur positive est requise pour allouer une mise. Vide ou zéro : nouvelles allocations bloquées."><input name="dailyLossLimit" type="number" min="0" step="0.01" defaultValue={euroValue(settings.dailyLossLimitCents)} placeholder="Non définie" /></Field>
          <Field label="Limite de pertes mensuelles (€)" hint="Une valeur positive est requise pour allouer une mise. Vide ou zéro : nouvelles allocations bloquées."><input name="monthlyLossLimit" type="number" min="0" step="0.01" defaultValue={euroValue(settings.monthlyLossLimitCents)} placeholder="Non définie" /></Field>
          <label className="field"><span><input name="paused" type="checkbox" defaultChecked={settings.paused} /> Mettre les nouvelles allocations en pause</span><small className="muted">Les tickets déjà exécutés restent suivis.</small></label>
        </div>
      </section>

      <section className="panel settings-section">
        <h2>Rapports</h2>
        <p className="muted">Ces préférences définissent votre rythme de revue. Les rapports sont générés manuellement depuis l’application ; aucun envoi automatique n’est planifié.</p>
        <div className="form-grid">
          <Field label="Fréquence de revue"><select name="reportFrequency" defaultValue={settings.reportFrequency}><option value="daily">Quotidienne</option><option value="weekly">Hebdomadaire</option><option value="monthly">Mensuelle</option></select></Field>
          <Field label="Heure de revue (Paris)"><input name="reportHour" type="time" defaultValue={settings.reportHour} required /></Field>
        </div>
        {feedback("settings")}
        <div className="form-actions"><button className="button button-primary" type="submit" disabled={busy !== null}>{busy === "settings" ? "Enregistrement…" : "Enregistrer les réglages"}</button></div>
      </section>
    </form>

    <section className="panel settings-section">
      <h2>Rapprochement du compte</h2>
      <p className="muted">Saisissez le solde en argent réel affiché par le bookmaker pour le comparer au solde reconstitué. Ce relevé ne crée aucun mouvement comptable.</p>
      {settings.reconciledAt && <p className="muted">Dernier relevé enregistré le {new Date(settings.reconciledAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}.</p>}
      <form key={`reconcile:${state.workspace}`} onSubmit={reconcile}>
        <div className="form-grid">
          <Field label="Solde réel disponible (€)" hint="Exclure les bonus non convertibles et mises déjà engagées. Laisser vide pour effacer la référence."><input name="reconciliationBalance" type="number" min="0" step="0.01" defaultValue={euroValue(settings.reconciliationBalanceCents)} /></Field>
          <Field label="Date et heure du relevé (Paris)"><input name="reconciledAt" type="datetime-local" defaultValue={parisDate(new Date().toISOString())} required /></Field>
        </div>
        {feedback("reconcile")}
        <div className="form-actions"><button className="button" type="submit" disabled={busy !== null}>{busy === "reconcile" ? "Enregistrement…" : "Enregistrer le solde de référence"}</button></div>
      </form>
    </section>

    <section className="panel settings-section">
      <h2>Accès personnel</h2>
      <p className="muted">Le mot de passe protège l’accès à l’application et s’applique aux deux espaces.</p>
      <form onSubmit={changePassword}>
        <div className="form-grid">
          <Field label="Mot de passe actuel"><input name="currentPassword" type="password" autoComplete="current-password" required /></Field>
          <Field label="Nouveau mot de passe" hint="Au moins 12 caractères."><input name="newPassword" type="password" autoComplete="new-password" minLength={12} required /></Field>
          <Field label="Confirmer le nouveau mot de passe"><input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required /></Field>
        </div>
        {feedback("password")}
        <div className="form-actions"><button className="button" type="submit" disabled={busy !== null}>{busy === "password" ? "Modification…" : "Modifier le mot de passe"}</button></div>
      </form>
    </section>

    <section className="panel settings-section">
      <h2>Export complet</h2>
      <p className="muted">Téléchargez les données de l’espace {state.workspace === "demo" ? "démonstration" : "personnel"} : sources, pronostics, relevés de cotes, tickets, mouvements, stratégies, simulations, réglages et journal d’audit.</p>
      <a className="button" href={`/api/export?workspace=${state.workspace}`} download>Exporter les données en JSON</a>
    </section>
  </div>;
}
