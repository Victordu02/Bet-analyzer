# Limites et prochaines dépendances

## Accès ou données nécessaires

- **Bet Analytix** : conditions applicables et autorisation d’un flux/API à vérifier. Le caractère public d’un profil et le mode STRICT ne prouvent ni une autorisation d’extraction ni un ticket exécuté.
- **The Odds API** : adaptateur v4 livré pour `winamax_fr`, identifiant confirmé dans la documentation officielle. Clé serveur absente dans l’installation vérifiée ; couverture réelle à constater avec les droits du forfait. Les marchés non reconnus, les combinés et les historiques payants ne sont pas reconstruits. Aucune souscription faite.
- **Compte Winamax** : aucune API publique ni export natif supposé. Le format CSV PRISME est générique. Tout rapprochement automatisé nécessitera un accès documenté et autorisé en lecture seule.
- **Données personnelles** : capital, limites, tickets et pronostics réels à renseigner. L’espace personnel reste vide à la livraison ; la démonstration n’y ajoute aucun enregistrement.

## Périmètre statistique

Le classement comparable couvre les simples et combinés standard gagnés/perdus/annulés à une unité par ticket ; les rapports historiques utilisant `pickStats` gardent leur périmètre de simples. Cashouts, promotions et règlements partiels sont signalés séparément. Une mise de combiné appartient au ticket ; les jambes sont conservées dans sa description, sans moteur de rapprochement sportif jambe par jambe.

L’intervalle bootstrap est descriptif, regroupé par événement et reproductible ; ce n’est pas un test confirmatoire après exploration de segments. Les variantes figées restent versionnées. Aucune significativité corrigée pour comparaisons multiples n’est revendiquée. La découverte rétrospective ne vaut pas validation future.

Le rejeu historique exclut les pronostics déclarés sans observation prospective, les versions ambiguës et les cotes indisponibles à la date de décision. Il conserve les abstentions. Le snapshot exporté d’une évaluation permet de la reproduire, mais l’application ne possède pas de prévisions probabilistes historiques immuables validées : Kelly et calibration sont alors non disponibles. Les fonctions Brier/log loss existent pour de futures prévisions correctement documentées.

Les hypothèses manuelles permettent des simulations. Aucun LLM, taux de réussite global ou retrait de marge Winamax ne crée automatiquement un avantage. Les états de remboursement/partiels ne sont pas assimilés à un pari binaire dans le moteur d’allocation. Les frais d’abonnement du portefeuille sont comptabilisés une fois via le journal ; les coûts indicatifs des fiches ne créent pas automatiquement des prélèvements.

## Extensions fonctionnelles

- Un portefeuille personnel global, affectations de tickets aux stratégies ; pas de gestion de plusieurs comptes bancaires ou utilisateurs.
- Rapports à la demande et préférences de revue ; pas d’e-mails, push ni planificateur d’envoi.
- Imports manuels et CSV ; PDF/capture avec OCR et validation humaine restent une extension facultative.
- The Odds API se collecte à la demande après configuration ; pas de collecte en arrière-plan ni de session de compte bookmaker. Les autres adaptateurs externes restent désactivés. Le fonctionnement authentifié du fournisseur reste à vérifier avec une clé réelle.
- Synthèse déterministe sourcée ; assistant rédactionnel IA facultatif non branché.
- Historique long : tous les enregistrements d’un espace sont chargés dans cette première version. Ajouter pagination côté serveur, agrégats matérialisés et politique de rétention avant de traiter un corpus massif.

Les limites sont des comportements explicites, pas des données fictives introduites dans un parcours réel.
