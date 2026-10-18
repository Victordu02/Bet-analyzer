# Mission : développer mon application d’analyse des tipsters, de sélection de paris et de suivi de bankroll

Tu interviens comme développeur full stack senior, architecte logiciel et spécialiste des statistiques appliquées aux paris sportifs.

Développe une application personnelle avancée dont le cœur est l’analyse des tipsters et de leurs pronostics, afin d’identifier les paris potentiellement intéressants à suivre sur Winamax.

Le suivi de bankroll doit permettre de mesurer les résultats réels de mes décisions.

Références fonctionnelles :

- Communauté et activité : https://app.bet-analytix.com/activities
- Gestion des bankrolls : https://app.bet-analytix.com/bankrolls

Crée une identité visuelle originale et une application réellement fonctionnelle : données persistantes, imports fiables, calculs vérifiés, rapports sourcés et parcours utilisables.

## 1. Objectif produit

Mon objectif économique est d’améliorer mes décisions de pari et ma rentabilité réelle, après coûts, sous des limites de risque explicites.

L’application doit répondre à cinq questions :

1. Quels tipsters méritent d’être suivis ?
2. Sur quels sports, compétitions ou types de paris présentent-ils des performances intéressantes ?
3. Quels nouveaux pronostics correspondent à ces spécialités ?
4. Ces paris restent-ils intéressants aux cotes réellement accessibles sur Winamax ?
5. Quels résultats est-ce que j’obtiens effectivement en les suivant ?

Je veux pouvoir suivre un tipster uniquement sur certains marchés, sans reprendre automatiquement tous ses pronostics.

Distingue toujours performance passée, espérance estimée, incertitude et résultat réalisé. L’application doit pouvoir conclure « données insuffisantes », « à observer » ou « aucun pari éligible ».

Le critère de succès du développement est une application fiable et exploitable. Il ne consiste pas à afficher artificiellement une stratégie rentable.

Les prises de pari, dépôts, retraits et cashouts sur Winamax restent manuels.

## 2. Contexte et méthode de travail

Hypothèses configurables :

- usage personnel ;
- utilisateur unique au départ ;
- bookmaker principal : Winamax France ;
- suivi multisport ;
- devise EUR ;
- interface française ;
- dates affichées en Europe/Paris et stockées en UTC ;
- utilisation sur ordinateur et smartphone ;
- démarrage local, avec possibilité d’hébergement privé ultérieur.

La bankroll réelle et les limites personnelles seront renseignées par l’utilisateur.

Commence par inspecter le dépôt, les éventuels fichiers AGENTS.md et les conventions existantes. Réutilise une architecture pertinente déjà présente.

Établis un plan court, puis passe à l’implémentation. Conserve dans le projet les décisions, conventions de calcul, dépendances externes et tâches restantes.

Prends les décisions techniques courantes de manière autonome. Lorsqu’un accès externe manque, poursuis les fonctionnalités indépendantes. Demande uniquement les informations indispensables pour débloquer la dépendance concernée.

Consulte les documentations officielles des intégrations. N’invente ni endpoint, ni format d’export, ni possibilité d’accès.

## 3. Trois familles de sources indépendantes

Sépare architecturalement :

1. les tipsters et leurs pronostics ;
2. les cotes, événements et résultats sportifs ;
3. mes paris et mouvements de compte Winamax.

Une source de cotes ne constitue pas un accès à mon compte joueur.

### A. Tipsters et pronostics

Bet Analytix est une source envisagée, sous réserve d’un accès autorisé.

Le cadrage a identifié des restrictions d’extraction et d’utilisation de robots dans les CGU reliées au site. Vérifie les conditions applicables avant toute collecte :

https://www.bet-analytix.com/docs/conditions-generales-utilisation-bet-analytix.pdf

Prévois des connecteurs pour :

- API ou flux autorisés par une plateforme ;
- fichiers fournis avec les droits nécessaires ;
- flux de pronostics dont les conditions permettent le traitement ;
- imports manuels documentés.

Le caractère public d’une bankroll ne suffit pas à autoriser son extraction automatisée. L’accord d’un tipster ne lève pas nécessairement les restrictions de sa plateforme.

Si aucun accès autorisé n’est disponible, livre les imports, les analyses et les rapports, avec le connecteur désactivé et son besoin d’accès clairement documenté.

### B. Cotes et résultats

Étudie notamment The Odds API et vérifie sa couverture actuelle de Winamax France, des sports, marchés et historiques utiles :

https://the-odds-api.com/sports-odds-data/bookmaker-apis.html
https://the-odds-api.com/liveapi/guides/v4/
https://the-odds-api.com/historical-odds-data/

Prévois des adaptateurs remplaçables. Documente la couverture, les quotas, la fraîcheur et les coûts.

Ne souscris aucun service payant sans accord. Le suivi et les calculatrices manuelles doivent fonctionner sans abonnement externe.

### C. Compte Winamax

Vérifie les possibilités réelles d’import ou de synchronisation : API documentée, export proposé, fichier obtenu auprès de Winamax ou autre accès autorisé.

N’assume pas l’existence d’un export CSV natif ou d’une API publique de compte joueur.

Une collecte locale assistée peut être étudiée si elle est autorisée, sans contourner l’authentification, les CAPTCHA ou les restrictions d’accès.

Toute synchronisation doit rester en lecture seule et gérer les erreurs, la pagination, l’expiration d’authentification et les changements de règlement.

Ne collecte pas mon mot de passe Winamax dans un formulaire improvisé. Les secrets ne doivent jamais être demandés dans la conversation.

## 4. Référentiel des tipsters et traçabilité

Crée une fiche par tipster comprenant :

- pseudonyme et sources ;
- bankrolls connues ;
- sports, compétitions et marchés couverts ;
- date de découverte et durée d’observation ;
- nombre de pronostics et d’événements distincts ;
- qualité, couverture et lacunes des données ;
- conditions d’accès et coût éventuel ;
- niveau de preuve disponible.

Ne déduis pas le statut de « professionnel » d’un classement ou d’une courbe de gains.

Sépare impérativement quatre niveaux :

1. **Déclaré** : historique publié ou fourni par la source.
2. **Observé avant événement** : pronostic enregistré par l’application avant son déroulement.
3. **Simulé sur Winamax** : résultat recalculé avec une cote Winamax observée après publication.
4. **Exécuté** : pari réellement accepté, confirmé par mon ticket.

Aucun passage automatique entre ces niveaux n’est autorisé.

Pour chaque pronostic, conserve :

- identifiant source et URL ;
- heure de publication annoncée ;
- première observation par l’application ;
- début de l’événement ;
- contenu initial et modifications détectées ;
- sélection, marché, ligne et règles pertinentes ;
- cote annoncée et éventuel seuil fourni par le tipster ;
- résultat et provenance du règlement.

Une date saisie dans un historique ne prouve pas une publication avant match. Un historique importé après résultat ne devient pas une observation prospective.

Le mode STRICT d’une plateforme ne doit pas être présenté comme une preuve de pari réellement exécuté.

Conserve les observations déjà collectées lorsqu’une publication disparaît, dans le respect des conditions de conservation applicables. Signale les lacunes sans en déduire automatiquement une fraude.

Si l’exhaustivité est inconnue, affiche « exhaustivité non vérifiable ».

## 5. Classement comparable et identification des spécialités

### Classement

Permets le tri par P&L déclaré, mais ajoute une performance recalculée avec une mise constante de 1 unité par ticket.

Pour un pari simple standard :

- gagné : cote − 1 unité ;
- perdu : −1 unité ;
- annulé : 0 unité.

Documente les conventions pour les combinés, règlements partiels, cashouts et promotions. Ne mélange pas les différentes catégories sans le signaler.

Affiche ensemble :

- P&L en unités ;
- rendement sur mises ;
- nombre de paris et d’événements ;
- période et durée d’observation ;
- cote moyenne ;
- drawdown ;
- concentration des gains ;
- incertitude ;
- niveau de preuve.

Présente des tris transparents. Évite un score global opaque sur 100 donnant une apparence de précision.

Montre lorsqu’un résultat dépend fortement d’un seul gros gain. Conserve les profils devenus inactifs ou perdants dans les périodes où ils étaient suivis.

### Spécialités

Analyse les performances par :

- sport ;
- compétition ;
- marché ;
- plage de cote ;
- simple ou combiné ;
- pré-match ou live ;
- délai entre publication et événement.

Pour chaque segment, affiche son volume, sa période, son rendement, sa dispersion et la concentration des gains.

Définis les découpages à l’avance et conserve la liste des variantes explorées. Si une significativité statistique est revendiquée, applique une méthode documentée tenant compte des comparaisons multiples.

Une spécialité découverte dans le passé est une hypothèse à confirmer sur les pronostics futurs. Sépare période de découverte et période de validation.

N’impose pas un nombre universel de paris censé prouver un avantage. Autorise « données insuffisantes pour conclure ».

## 6. Détection des paris exploitables sur Winamax

Pour chaque nouveau pronostic correspondant à un tipster et à un segment suivis :

1. identifier exactement événement, marché, sélection, ligne et règles ;
2. vérifier sa disponibilité sur Winamax ;
3. obtenir une cote récente via une source autorisée ou une saisie manuelle ;
4. mesurer le délai depuis la publication ;
5. comparer cote annoncée, cote actuelle et éventuelle cote minimale ;
6. vérifier l’exposition cumulée avec mes autres paris ;
7. produire une fiche de décision.

Les correspondances ambiguës entre événements ou marchés doivent être soumises à validation.

Conserve :

- cote annoncée ;
- première cote Winamax observée ;
- horodatage et délai ;
- variations ultérieures ;
- indisponibilités ;
- cote réellement exécutée lorsqu’elle est connue.

Une cote observée ne prouve pas qu’elle restera disponible ou que le montant souhaité sera accepté.

Les paris manqués ou indisponibles doivent apparaître dans l’analyse de reproductibilité. Ne les supprime pas pour améliorer artificiellement le bilan.

Prévois des statuts explicites : « à analyser », « en observation », « expiré », « marché indisponible », « cote insuffisante selon le seuil défini » ou « données insuffisantes ».

## 7. Espérance de gain et probabilités

Pour un pari simple cash, gagné ou perdu, sans remboursement ni frais :

- s = mise ;
- o = cote décimale ;
- p = probabilité estimée de gain.

Implémente :

- probabilité d’équilibre : 1 / o ;
- rendement espéré : p × o − 1 ;
- espérance en euros : s × (p × o − 1).

Pour les paris comportant remboursements, résultats partiels ou frais, utilise les probabilités et résultats nets de chaque état possible.

Chaque probabilité doit avoir une provenance :

- hypothèse manuelle ;
- référence de marché explicitée ;
- modèle statistique documenté et évalué.

Une hypothèse manuelle permet une simulation ; elle ne démontre pas un avantage.

Le taux de réussite global d’un tipster ne doit pas être transformé en probabilité de gain de chacun de ses paris.

Sans estimation exploitable, affiche « espérance inconnue ». Aucun LLM ne doit inventer une probabilité ou un pourcentage de confiance.

Pour retirer la marge d’un marché complet, tu peux utiliser :

p_i = (1 / o_i) / somme(1 / o_j).

Cette normalisation est une convention d’estimation de marché. Retirer la marge des seules cotes Winamax ne suffit pas à identifier un avantage contre Winamax.

Affiche la sensibilité de l’espérance aux variations de probabilité et de cote.

Ne crée pas une cote minimale « rentable » sans méthode défendable. Si le seuil provient du tipster, attribue-le clairement à celui-ci.

## 8. Mises, doublons et exposition

Compare les méthodes suivantes :

- mise fixe ;
- pourcentage fixe du capital ;
- Kelly fractionné.

Pour le cas binaire standard :

f_Kelly = max(0, (p × o − 1) / (o − 1)).

La fraction de Kelly est configurable. Elle ne constitue pas une garantie de profit ou un optimum universel.

La mise simulée doit respecter simultanément :

- fraction calculée ;
- cash disponible ;
- plafond par pari ;
- plafond par événement ;
- plafond global d’exposition ;
- limites personnelles.

Pour la démonstration uniquement, utilise :

- quart de Kelly ;
- plafond de 1 % du capital par pari ;
- 2 % par événement ;
- 5 % d’exposition ouverte totale.

Les paramètres réels doivent être configurables. Définis précisément le capital utilisé et arrondis les mises vers le bas au centime.

Regroupe les pronostics identiques en conservant toutes leurs sources. Plusieurs tipsters publiant le même pari ne constituent pas automatiquement des confirmations indépendantes.

Tiens compte des paris corrélés et des allocations déjà retenues dans le panier de simulation. Plusieurs suggestions simultanées ne doivent pas réutiliser chacune tout le budget disponible.

Une simulation ne crée aucun mouvement réel.

Prévois des limites de pertes et une pause des suggestions. Aucun mécanisme de martingale ou d’augmentation automatique pour récupérer des pertes.

## 9. Rôle de l’IA et rapports

Sépare :

1. collecte et extraction ;
2. normalisation et calculs déterministes ;
3. synthèse rédigée par l’IA.

L’IA doit distinguer :

- les arguments explicitement publiés par le tipster ;
- les constats issus des statistiques ;
- les interprétations ;
- les informations manquantes.

Si le tipster publie seulement une sélection, indique que son raisonnement n’est pas fourni. N’invente pas une explication présentée comme la sienne.

Toute information contextuelle ajoutée, comme une absence de joueur, doit être sourcée et datée.

Les chiffres des rapports doivent provenir des fonctions de calcul de l’application.

### Fiche détaillée par pari

Inclure :

- événement et horaire de Paris ;
- marché et sélection exacts ;
- sources et horodatages ;
- cote annoncée et cote Winamax récente ;
- raison de la sélection du profil et du segment ;
- historique pertinent, effectifs et niveau de preuve ;
- arguments disponibles ;
- risques, limites et données manquantes ;
- espérance et simulation de mise si calculables ;
- conditions rendant le pari inexploitable.

### Synthèse quotidienne

Présente une sélection courte de dossiers pertinents, les nouveaux signaux et les changements importants.

Autorise une synthèse ne contenant aucun pari éligible.

Les horaires, fréquences et notifications sont configurables selon les sources, leur fraîcheur et les quotas.

### Bilan hebdomadaire ou mensuel

Compare :

- performances déclarées ;
- performances observées ;
- simulation Winamax ;
- mes paris réellement exécutés ;
- coûts ;
- résultat net.

Explique les écarts : baisse des cotes, délais, paris manqués, marchés retenus, différences de mise ou données incomplètes.

Chaque conclusion doit renvoyer aux données qui la soutiennent.

## 10. Bankroll et comptabilité

Construis un journal financier traçable avec des montants exacts en centimes entiers ou Decimal.

Sépare :

- capital initial ;
- dépôts et retraits ;
- cash disponible ;
- mises cash ouvertes ;
- retours bruts ;
- résultats nets ;
- promotions et freebets ;
- frais ;
- ajustements justifiés.

Pour un pari cash clôturé :

Résultat net = retours cash cumulés − mise cash − frais associés.

Un retour gagnant comprend généralement la restitution de la mise. Ne la soustrais pas deux fois.

Une mise transfère du disponible vers une position ouverte : elle ne constitue pas immédiatement une perte.

Les dépôts et retraits ne modifient jamais le bénéfice des paris.

Identifie séparément les éventuels mouvements liés au poker ou à d’autres activités pour rapprocher le solde Winamax.

Distingue mes bankrolls des bankrolls publiques des tipsters. Les affectations à des stratégies ne doivent pas multiplier artificiellement mon capital.

Pour chaque ticket réel, conserve identifiants, dates, bookmaker, événement, sélection, cote acceptée, mise, financement, statut, règlements, cashouts, stratégie, provenance et modifications.

La mise appartient au ticket, pas à chacune des sélections d’un combiné.

Gère les annulations, remboursements et révisions de règlement sans doubles mouvements.

Pour les cashouts partiels, utilise les données disponibles sur la portion cédée et la position restante. N’invente pas une répartition du coût lorsque l’information manque.

## 11. Imports et rapprochement

Implémente dès la première version :

- saisie manuelle ;
- import CSV générique documenté ;
- correspondance des colonnes ;
- prise en charge des dates et nombres français ;
- prévisualisation ;
- erreurs par ligne ;
- historique des imports ;
- rapprochement avec le solde renseigné par l’utilisateur ;
- export complet des données.

Fournis des fichiers d’exemple explicitement fictifs et séparés des données personnelles.

Les imports doivent être idempotents :

- même fichier réimporté : aucun doublon ;
- ticket ouvert puis réimporté réglé : mise à jour du ticket et effet financier unique.

Privilégie les identifiants source. En leur absence, signale les doublons probables sans supprimer silencieusement deux paris réellement distincts.

Préserve les corrections manuelles et documente les règles de résolution des conflits.

Un import de PDF ou de captures peut compléter le dispositif, avec validation humaine avant enregistrement.

L’état d’une connexion doit refléter la réalité : non configurée, import manuel, synchronisée à une date précise ou en erreur.

## 12. Évaluation des stratégies et CLV

Calcule et documente :

- résultat cash hors promotions ;
- résultat promotionnel ;
- rendement sur mises cash réglées ;
- taux de réussite ;
- volumes ;
- exposition ;
- drawdown ;
- durée de récupération.

Définis le traitement des annulations dans chaque indicateur. Un dénominateur nul produit « non applicable ».

Distingue les analyses par date de prise des vues comptables par date de règlement.

La performance et le drawdown doivent neutraliser les dépôts et retraits, par exemple avec une valeur de part. Si les positions ouvertes sont suivies au coût, explique cette convention.

### Closing Line Value

Distingue :

- CLV brute = cote prise / cote de clôture − 1 ;
- valeur face à une référence de clôture sans marge = cote prise × probabilité de référence à la clôture − 1.

Les marchés doivent être strictement comparables. Définis et horodate la clôture.

La CLV est un indicateur de comparaison au marché, pas une preuve de rentabilité future.

### Validation chronologique

Pour les stratégies et modèles :

- figer les règles avant leur période de test ;
- conserver les prévisions, candidats, abstentions et décisions ;
- séparer entraînement, validation et test ;
- réserver un test final hors échantillon ;
- empêcher toute utilisation d’informations indisponibles à la date de décision ;
- ne pas utiliser la clôture comme information disponible pour un pari antérieur ;
- comparer à une référence simple ;
- tenir compte des événements communs et des dépendances ;
- afficher effectifs, couverture et incertitude.

Lorsque des probabilités sont produites, évalue leur calibration et des métriques adaptées comme le Brier score ou la log loss, en complément du rendement et du risque.

Implémente des simulations reproductibles de suivi et de méthodes de mise. Précise les hypothèses de délais, cotes, corrélations et disponibilité.

Sans données adéquates, livre les outils d’évaluation avec un statut explicite. Ne prétends pas disposer d’un modèle prédictif validé.

Les coûts d’abonnement et de données sont déduits une seule fois du portefeuille concerné.

## 13. Interface attendue

Crée une interface sobre, soignée et accessible, adaptée au mobile, avec thèmes clair et sombre.

Navigation principale :

- Radar et nouveaux pronostics ;
- Tipsters ;
- Spécialités et analyses ;
- Rapports ;
- Simulations et stratégies ;
- Mes paris et bankroll ;
- Sources et imports ;
- Paramètres.

Le tableau de bord d’accueil doit mettre en avant :

- dossiers récents à analyser ;
- fraîcheur des cotes ;
- profils et segments suivis ;
- état des données ;
- exposition personnelle ;
- résultat réel.

Prévois des tableaux filtrables, des graphiques interactifs et des explications accessibles des indicateurs.

Gère les états vides, chargements, erreurs et données indisponibles. Les données de démonstration sont clairement identifiées et isolées.

## 14. Architecture, confidentialité et exploitation

En l’absence de dépôt existant, privilégie un monolithe maintenable :

- Next.js et TypeScript ;
- PostgreSQL ;
- ORM avec migrations ;
- Tailwind CSS et composants accessibles ;
- bibliothèque de graphiques ;
- tests unitaires et tests de parcours ciblés.

Vérifie les versions et compatibilités actuelles dans les documentations officielles.

Sépare logique financière, statistiques, connecteurs et interface. Utilise des transactions pour les imports et mouvements comptables.

Les tâches de collecte doivent gérer quotas, erreurs, reprises et fraîcheur. Ajoute des traitements en arrière-plan lorsque leur nécessité est établie.

Prévois :

- authentification et contrôle d’accès côté serveur ;
- validation des entrées ;
- secrets côté serveur, hors dépôt et journaux ;
- sauvegarde et restauration ;
- export intégral ;
- suivi des erreurs et de la consommation des fournisseurs.

Le fonctionnement local ne doit pas dépendre d’un abonnement SaaS.

L’assistant rédactionnel est facultatif : les données et calculs doivent rester accessibles sans lui.

## 15. Ordre de réalisation

Réalise les fonctionnalités dans cet ordre :

1. inspecter le projet et vérifier les accès aux sources ;
2. créer le modèle métier, les imports et la base persistante ;
3. livrer les fiches tipsters, la traçabilité et le classement standardisé ;
4. ajouter les analyses de spécialités et le suivi prospectif ;
5. rapprocher les pronostics des cotes Winamax accessibles ;
6. produire les fiches de décision et rapports ;
7. compléter la simulation de suivi, les mises et la bankroll réelle ;
8. finaliser validation, mobile, sauvegarde et documentation.

Chaque étape doit apporter un parcours utilisable.

Un connecteur externe bloqué ne doit pas arrêter les autres modules. N’utilise jamais un connecteur simulé dans un parcours présenté comme réel.

## 16. Tests et critères de recette

Écris et exécute des tests ciblés sur les risques financiers, statistiques et de traçabilité.

### Calculs financiers

Vérifie notamment :

- pari cash de 20 € à 2,50 gagné : retour brut 50 €, résultat +30 € ;
- pari cash de 20 € clôturé par un cashout de 12 € : résultat −8 € ;
- freebet de 10 € à 3,00 sans restitution de mise : aucun débit cash de 10 €, retour gagnant de 20 €, résultat promotionnel séparé ;
- dépôt ou retrait : aucun changement du bénéfice des paris ;
- réimport identique : aucun doublon ni variation du solde ;
- ticket ouvert puis réglé : un seul ticket et un seul effet financier.

### Espérance et mises

Avec une mise de 10 €, une cote de 2,00 et une probabilité hypothétique de 55 % :

- espérance +1 € ;
- rendement espéré 10 %.

Avec un capital de 1 000 € :

- Kelly complet 10 % ;
- quart de Kelly 25 € ;
- plafond par pari de 1 % donnant 10 € maximum avant les autres contraintes.

Sans probabilité exploitable : aucune espérance inventée ni calcul Kelly présenté comme une recommandation.

### Comparabilité et temporalité

Vérifie que :

- multiplier les mises déclarées ne change pas la performance recalculée à 1 unité ;
- un pronostic découvert après l’événement reste dans l’historique déclaré ;
- une spécialité sélectionnée rétrospectivement n’est pas présentée comme validée prospectivement ;
- les pronostics identiques ne multiplient pas l’exposition ;
- une cote ancienne n’est pas présentée comme actuelle ;
- une cote observée ne devient pas une cote exécutée ;
- les données fictives restent isolées ;
- chaque conclusion de rapport renvoie à ses données.

### Drawdown

Une perte de 100 € sur 1 000 €, suivie d’un dépôt de 900 €, ne doit pas effacer le drawdown de 10 % dans la performance neutralisée des flux.

### Parcours complet

Vérifie depuis une base vide :

import de pronostics → fiche tipster → classement → analyse d’un segment → rapprochement avec une cote → fiche de décision → simulation → enregistrement manuel d’un ticket réel → règlement → rapprochement au centime → rapport → export.

Teste aussi les données manquantes, doublons, annulations, corrections et erreurs d’accès.

## 17. Livrables et définition de terminé

Livre :

- le code fonctionnel ;
- les migrations ;
- un jeu de démonstration isolé ;
- les modèles d’import documentés ;
- les commandes d’installation et de démarrage ;
- un fichier d’environnement d’exemple sans secrets ;
- les conventions de calcul ;
- la documentation des connecteurs et droits d’accès nécessaires ;
- les procédures de sauvegarde et de restauration ;
- les vérifications réellement exécutées et leurs résultats ;
- les limites et dépendances restantes.

Tous les boutons du périmètre livré doivent fonctionner. Les chiffres affichés doivent provenir des données et des fonctions de calcul.

Termine par un compte rendu distinguant :

- ce qui fonctionne ;
- ce qui a été vérifié ;
- ce qui nécessite encore un accès ou des données ;
- les commandes pour lancer l’application.

Commence maintenant par inspecter le projet, présenter tes hypothèses et ton plan court, puis passe à l’implémentation.