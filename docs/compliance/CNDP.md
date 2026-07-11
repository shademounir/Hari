# Conformité CNDP — Données personnelles et Intelligence Artificielle

**Projet :** HARI  
**Sprint :** Sprint 4  
**Ticket :** SCRUM-102  
**Auteur :** Équipe HARI

---

# 1. Objectif

Ce document présente l'analyse de conformité CNDP des traitements de données personnelles réalisés par les modules d'intelligence artificielle de HARI.

L'objectif est de garantir que les fonctionnalités IA respectent les principes de la loi marocaine 09-08 relative à la protection des données à caractère personnel.

---

# 2. Modules IA concernés

Les modules analysés sont :

- Classification des requêtes utilisateur
- Prompt Guard (protection contre les prompt injections)
- Recherche documentaire (RAG)
- Audit IA
- Analytics RH
- Génération de documents RH
- Analyse prédictive
- Détection du désengagement

---

# 3. Données personnelles traitées

Les traitements IA peuvent manipuler les catégories suivantes :

## Identité

- Nom
- Prénom
- Email professionnel
- Identifiant utilisateur

## Données RH

- Poste
- Département
- Ancienneté
- Type de contrat
- Congés

## Documents RH

- Attestation de travail
- Documents administratifs

## Données sensibles

Le système ne doit jamais exploiter :

- données médicales
- données de santé
- opinions personnelles
- informations privées non nécessaires

---

# 4. Cartographie des traitements IA

## 4.1 Classification

Module :

src/lib/ai/classify.ts

Objectif :

Déterminer si une requête est normale, confidentielle ou hors périmètre.

Protection existante :

- Classification automatique
- Détection des demandes sensibles

---

## 4.2 Prompt Guard

Module :

src/lib/ai/prompt-guard.ts

Objectif :

Détecter les tentatives de Prompt Injection.

Protection existante :

- Blocage des instructions malveillantes
- Refus contrôlé

---

## 4.3 Recherche documentaire (RAG)

Module :

src/lib/rag.ts

Objectif :

Limiter la recherche documentaire aux documents accessibles selon le rôle.

Protection existante :

- Filtrage RBAC
- Contrôle des permissions

---

## 4.4 Audit

Module :

src/lib/audit.ts

Objectif :

Tracer les événements sensibles.

Protection existante :

- Aucun contenu personnel n'est enregistré.
- Les journaux utilisent uniquement des métadonnées.

---

## 4.5 Documents RH

Module :

GeneratedDocument

Objectif :

Permettre la génération et le téléchargement sécurisé des documents RH.

Protection existante :

- Workflow de validation
- Contrôle RBAC
- Historique des demandes

---

# 5. Mesures de sécurité déjà présentes

Le projet implémente déjà plusieurs protections importantes.

## RBAC

Chaque utilisateur possède un rôle :

- Employee
- Manager
- HR Admin
- Super Admin

Les permissions sont contrôlées côté serveur.

---

## Prompt Guard

Empêche les attaques de Prompt Injection.

---

## Audit

Toutes les actions sensibles sont historisées.

Les journaux ne contiennent pas les données personnelles.

---

## Classification IA

Les demandes confidentielles sont détectées avant traitement.

---

## Documents RH

Les documents ne sont accessibles qu'à leur propriétaire ou aux RH.

---

# 6. Risques identifiés

Les principaux risques sont :

- fuite d'informations personnelles
- accès non autorisé
- transfert vers un fournisseur IA externe
- stockage excessif
- mauvaise utilisation des données RH
- profilage des collaborateurs

---

# 7. Recommandations

Les recommandations sont les suivantes :

- limiter les données envoyées au modèle IA
- conserver uniquement les métadonnées nécessaires
- appliquer le principe du moindre privilège
- journaliser les événements sensibles
- renforcer la détection des données personnelles
- conserver les documents uniquement pendant la durée nécessaire

---

# 8. Conformité CNDP

Le projet applique les principes suivants :

- minimisation des données
- contrôle d'accès
- traçabilité
- limitation des traitements
- sécurité des accès
- séparation des rôles
- audit des actions sensibles

Les traitements à risque devront être revus avant une mise en production.

---

# 9. Conclusion

Le projet HARI dispose déjà de plusieurs mécanismes permettant de limiter les risques liés au traitement des données personnelles :

- RBAC
- Prompt Guard
- Audit
- Classification
- Contrôle documentaire

Des améliorations restent prévues afin de renforcer la conformité CNDP, notamment la détection automatique des données personnelles et l'amélioration continue des contrôles de sécurité.