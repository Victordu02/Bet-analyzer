# Limites et prochaines dépendances

## Accès ou données nécessaires

- **Bet Analytix** : conditions applicables et autorisation d’un flux/API à vérifier. Le caractère public d’un profil et le mode STRICT ne prouvent ni une autorisation d’extraction ni un ticket exécuté.
- **The Odds API** : couverture Winamax France actuelle, sports, marchés, historiques, quotas et tarifs à vérifier avant implémentation/activation. Aucune souscription faite.
- **Compte Winamax** : aucune API publique ni export natif supposé. Le format CSV PRISME est générique. Tout rapprochement automatisé nécessitera un accès documenté et autorisé en lecture seule.
- **Données personnelles** : capital, limites, tickets et pronostics réels à renseigner. L’espace personnel reste vide à la livraison ; la démonstration n’y ajoute aucun enregistrement.

## Périmètre statistique

Les classements standardisés principaux couvrent les simples cash gagnés/perdus/annulés, et signalent les règlements exclus. Les combinés, cashouts et résultats partiels restent enregistrables et analysables séparément. Une mise de combiné appartient au ticket ; les jambes sont conservées dans sa description, sans moteur de rapprochement sportif jambe par jambe.

L’intervalle bootstrap est descriptif, regroupé par événement et reproductible ; ce n’est pas un test confirmatoire après exploration de segments. Les variantes figées restent versionnées. Aucune significativité corrigée pour comparaisons multiples n’est revendiquée. La découverte rétrospective ne vaut pas validation future.

Le rejeu historique exclut les pronostics déclarés sans observation prospective, les versions ambiguës et les cotes indisponibles à la date de décision. Il conserve les abstentions. Le snapshot exporté d’une évaluation permet de la reproduire, mais l’application ne possède pas de prévisions probabilistes historiques immuables validées : Kelly et calibration sont alors non disponibles. Les fonctions Brier/log loss existent pour de futures prévisions correctement documentées.

Les hypothèses manuelles permettent des simulations. Aucun LLM, taux de réussite global ou retrait de marge Winamax ne crée automatiquement un avantage. Les états de remboursement/partiels ne sont pas assimilés à un pari binaire dans le moteur d’allocation. Les frais d’abonnement du portefeuille sont comptabilisés une fois via le journal ; les coûts indicatifs des fiches ne créent pas automatiquement des prélèvements.

## Extensions fonctionnelles

- Un portefeuille personnel global, affectations de tickets aux stratégies ; pas de gestion de plusieurs comptes bancaires ou utilisateurs.
- Rapports à la demande et préférences de revue ; pas d’e-mails, push ni planificateur d’envoi.
- Imports manuels et CSV ; PDF/capture avec OCR et validation humaine restent une extension facultative.
- Adaptateurs externes désactivés ; pas de collecte arrière-plan, d’expiration de session bookmaker ou de quota consommé à simuler.
- Synthèse déterministe sourcée ; assistant rédactionnel IA facultatif non branché.
- Historique long : tous les enregistrements d’un espace sont chargés dans cette première version. Ajouter pagination côté serveur, agrégats matérialisés et politique de rétention avant de traiter un corpus massif.

Les limites sont des comportements explicites, pas des données fictives introduites dans un parcours réel.
