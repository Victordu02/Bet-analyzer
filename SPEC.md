# Spécification PRISME

La spécification produit complète et conservée est [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md). Ce fichier constitue son point d’entrée à la racine du dépôt.

- [Section 4 — Référentiel des tipsters et traçabilité](docs/REQUIREMENTS.md#4-référentiel-des-tipsters-et-traçabilité) : identité, sources, suivi, couverture et séparation stricte des quatre niveaux de preuve.
- [Section 5 — Classement comparable et identification des spécialités](docs/REQUIREMENTS.md#5-classement-comparable-et-identification-des-spécialités) : mise constante de 1 unité par ticket, indicateurs transparents, sept axes de segmentation et validation prospective séparée de la découverte.
- [Section 6 — Détection des paris exploitables sur Winamax](docs/REQUIREMENTS.md#6-détection-des-paris-exploitables-sur-winamax) : correspondances exactes, cotes horodatées, disponibilité, seuils attribués et conservation des dossiers manqués.
- [Section 7 — Espérance de gain et probabilités](docs/REQUIREMENTS.md#7-espérance-de-gain-et-probabilités) : calculs d’espérance, provenance des estimations, retrait de marge et sensibilité, sans probabilité inventée.
- [Section 8 — Mises, doublons et exposition](docs/REQUIREMENTS.md#8-mises-doublons-et-exposition) : comparaison des trois méthodes, arrondi inférieur au centime, plafonds communs au panier, limites de pertes et pause.
- [Section 10 — Bankroll et comptabilité](docs/REQUIREMENTS.md#10-bankroll-et-comptabilité) : journal exact, versements et corrections datés, cashouts partiels, neutralisation des flux et rapprochements audités. Parcours livré : [docs/BANKROLL.md](docs/BANKROLL.md).

**Évolution de la section 8 suivant la dernière demande utilisateur :** les nouveaux espaces utilisent un quart de Kelly et des plafonds de 1 % par pari, 2 % par événement et 5 % d’exposition. Ces défauts remplacent la restriction initiale « pour la démonstration uniquement » conservée dans le texte source. Les réglages existants restent inchangés. Le capital et les limites de pertes personnelles ne sont jamais inventés ; leur absence bloque les allocations.

Les conventions de calcul et leurs limites sont documentées dans [docs/CALCULATIONS.md](docs/CALCULATIONS.md). Les consignes de contribution sont dans [AGENTS.md](AGENTS.md), et les étapes de réalisation dans [TODO.md](TODO.md).
