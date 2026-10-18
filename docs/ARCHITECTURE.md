# Décisions d’architecture

Décisions initiales : 18 octobre 2026. Le cahier des charges conservé dans `REQUIREMENTS.md` sert de référence.

## Monolithe privé

Next.js 16 / React 19 / TypeScript, PostgreSQL 17, Drizzle ORM et migrations SQL versionnées. Le serveur valide toutes les mutations. Le client reçoit uniquement l’espace demandé après authentification. Aucun abonnement SaaS n’est nécessaire.

Les versions exactes et les empreintes des paquets sont dans `package-lock.json`. Node.js 22 ou ultérieur ; environnement validé avec Node 24.19.0. PostgreSQL embarqué utilise de vrais binaires PostgreSQL, pas une émulation SQLite. Son paquet de distribution porte un suffixe `beta` ; pour un hébergement privé durable, utiliser un serveur PostgreSQL administré et sauvegardé.

## Frontières

- `src/domain/` : types, calculs purs, statistiques et simulations. Aucun appel réseau, aucune génération de probabilités.
- `src/db/`, `migrations/` : stockage PostgreSQL ; données et audit isolés par espace `personal` / `demo`.
- `src/server/` : validation, imports CSV, transactions, écritures comptables, authentification.
- `src/app/api/` : contrôle d’accès, origine des requêtes, limite de taille, export.
- `src/components/` : interface et formulaires en français.
- `scripts/` : initialisation, base locale, migrations, démonstration, sauvegarde/restauration.

Les familles « pronostics », « cotes » et « tickets réels » utilisent des entités distinctes. Une observation de cote n’est jamais une confirmation d’exécution. Un historique importé est déclaré, même s’il annonce une date antérieure au match. Une modification conserve sa version précédente. Un segment figé définit une hypothèse prospective, sans proclamer un avantage statistique.

## Persistance et concurrence

Les tables métier contiennent des documents JSONB typés, clés primaires composées espace/identifiant, contraintes et index SQL. Les validations de relation et de domaine sont complétées dans le service. Les mutations d’un espace sont sérialisées par un verrou transactionnel PostgreSQL ; les lectures utilisent un instantané cohérent. Le journal utilise des centimes signés et des écritures de correction : un réimport ne débite pas une nouvelle fois la mise.

Le modèle à documents facilite l’audit et les exports de cette version mono-utilisateur. Avant un passage à plusieurs utilisateurs, ajouter une vraie table d’identités, des droits par portefeuille et les migrations relationnelles correspondantes ; ne pas réutiliser le simple commutateur de démonstration comme contrôle d’accès multi-utilisateur.

## Confidentialité

Mot de passe privé haché avec scrypt, sel aléatoire ; cookies HTTP-only SameSite strict, signature HMAC, expiration et révocation lors du changement de mot de passe. Contrôle Origin pour les mutations. Le serveur écoute sur l’interface locale par défaut. Les fichiers `.env*`, `.local/`, sauvegardes et traces de tests sont exclus de Git. Aucun mot de passe Winamax n’est demandé.

En hébergement privé : HTTPS obligatoire, `APP_ORIGIN` exact, chiffrement des sauvegardes, PostgreSQL inaccessible au public, supervision, mise à jour des dépendances. Les quotas de connexion en mémoire sont adaptés au monolithe mono-processus ; distribuer leur stockage avant un déploiement multi-instance.

## Connecteurs et rapports

Les intégrations automatiques sont désactivées en l’absence de droits et de couverture vérifiés. Les états de source expriment cette réalité. Pas de tâche de collecte ni de facturation fournisseur cachée. Les rapports sont déterministes et citent les enregistrements ; l’assistant rédactionnel reste facultatif et n’est pas utilisé dans cette version. Les préférences d’horaire ne constituent pas un planificateur de notifications.
