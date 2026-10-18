# Analyse et qualification des tipsters

Ce parcours met en œuvre les sections 4 et 5 de [la spécification](REQUIREMENTS.md). Un résultat passé reste descriptif : aucune vue ne déduit un statut professionnel, une probabilité prédictive ou un avantage démontré d’un classement.

## Classement comparable

La vue **Tipsters** permet de choisir un niveau de preuve, une période et un périmètre, puis de trier sur des indicateurs explicites. Les profils inactifs et perdants restent présents par défaut ; leur suppression rétrospective fausserait la comparaison.

Deux résultats distincts sont présentés :

- **P&L aux mises déclarées** : résultat recalculé à partir des mises en unités et des règlements fournis par la source. Ce n’est pas un P&L agrégé récupéré d’un classement officiel.
- **P&L à 1 unité par ticket** : gagné = cote − 1, perdu = −1, annulé = 0. Chaque ticket réglé standard engage une unité dans le dénominateur du rendement, annulations comprises. Un combiné utilise sa cote totale et compte pour un seul ticket ; ses jambes ne sont pas ajoutées artificiellement au nombre d’événements connus.

Les simples et combinés restent identifiables et filtrables. Les demi-règlements, cashouts et promotions ne sont pas mélangés au classement standard ; leur volume exclu reste visible. Les paris ouverts contribuent au volume de suivi, mais pas au rendement réglé. Une population vide donne un résultat non applicable.

Le classement accompagne les résultats du nombre de tickets et d’événements distincts documentés, de la période disponible, de la cote moyenne, de la dispersion, du drawdown en unités, de la part du plus gros gain dans les gains positifs et d’un intervalle descriptif de rendement. Le montant d’un gain exceptionnel ne disparaît pas : sa concentration est affichée.

Le drawdown en unités porte sur la courbe standardisée des règlements, avec un sommet initial à zéro. Les règlements simultanés sont regroupés. Un pourcentage de drawdown par valeur de part exige un capital et des flux propres au périmètre. Ces données n’étant pas stockées pour les bankrolls publiques des tipsters, ce pourcentage est explicitement indisponible par profil. La vue **Bankroll** conserve le calcul de valeur de part du portefeuille personnel, neutralisant ses dépôts et retraits ; cette courbe commune n’est pas attribuée à chaque tipster.

## Quatre populations de preuve

1. **Déclaré** : historique fourni par la source ; une date de publication saisie après coup ne constitue pas une observation avant événement.
2. **Observé avant événement** : première observation cohérente avec la publication et antérieure au début de l’événement. Une correction ambiguë ne fournit pas une preuve prospective du contenu corrigé.
3. **Simulé sur Winamax** : allocations d’une simulation conservée, avec ses cotes et sa date de décision. Les scénarios restent sélectionnables séparément ; les cotes annoncées ou de clôture ne remplacent pas une cote connue à cette date.
4. **Exécuté** : tickets réellement acceptés et rattachés à un pronostic du profil. Le résultat monétaire réel provient des retours, mises et frais du ticket, en centimes entiers. Un pronostic gagné ne transforme pas un ticket perdu en gain.

Un même pronostic peut avoir des objets liés dans plusieurs niveaux, mais leurs effectifs et résultats ne sont jamais additionnés comme s’il s’agissait de preuves indépendantes. Les tickets sans rattachement ne sont pas attribués arbitrairement à un tipster.

## Spécialités et prospective

La vue **Spécialités & analyses** combine sept axes : sport, compétition, marché, plage de cote, simple/combiné, pré-match/live et délai entre publication et début d’événement. Les bornes numériques sont inférieures incluses et supérieures exclues. Les découpages proposés sont explicites ; aucune recherche automatique d’un « meilleur » segment n’est présentée comme une validation.

Une variante explorée peut être consignée dans l’audit. Le gel d’une stratégie conserve son filtre et la frontière temporelle. Modifier les règles crée une autre hypothèse et ne réécrit pas la validation de l’ancienne.

- **Découverte** : résultats disponibles avant la fin de découverte. Un règlement ultérieur ne doit pas améliorer rétrospectivement les résultats qui auraient servi à choisir le segment.
- **Validation prospective** : nouvelles observations après le début de validation et après le gel des règles, enregistrées avant l’événement. Les contenus révisés sont reconstruits lorsqu’ils sont documentés ; une révision ambiguë reste signalée ou exclue.

Les tableaux affichent séparément les deux périodes et leurs effectifs. Un intervalle bootstrap par groupes d’événements décrit l’incertitude du rendement ; il ne corrige ni les comparaisons multiples, ni une couverture inconnue, ni tous les liens entre événements. Aucun seuil universel de paris ne suffit à établir un avantage. Les situations non concluantes portent explicitement la mention **« données insuffisantes pour conclure »**.

## Démonstration

Les scénarios fictifs illustrent un profil régulièrement gagnant, un profil dépendant d’un gros combiné, un profil inactif et un profil perdant. Leurs historiques couvrent plusieurs sports, marchés, types, délais et périodes de suivi. Les observations et cotes historiques de démonstration sont synthétiques et signalées comme telles ; elles n’attestent aucune collecte réelle.

L’enrichissement est versionné et idempotent dans l’espace `demo`. Il conserve les enregistrements déjà présents et n’ajoute aucune donnée dans l’espace personnel. Les captures et fichiers de recette restent exclus de Git.
