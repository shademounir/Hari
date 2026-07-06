## **HARI** 

_Human Resources Artificial Intelligence_ 

## **SCRUM-096** 

Matrice RBAC Détaillée par Rôle 

|**Projet**|HARI — Human Resources Artfcial Intelligence|
|---|---|
|**Sprint**|Sprint 0 — Cadrage et architecture|
|**Responsable**|Kawtar HALIB|
|**Support**|El Mahdi EL BOUGHDADI · Chaimaa MELLOUK|
|**Date**|2026-06-23|
|**Statut**|Livrable d'architecture — prêt pour validaton équipe<br>sécurité & dev|



## **1. Objectif** 

Ce document définit la matrice RBAC (Role-Based Access Control) de la plateforme HARI. Il précise les droits d'accès de chaque rôle sur l'ensemble des fonctionnalités du MVP, identifie les accès sensibles et documente les refus attendus. 

La matrice est la référence unique pour l'implémentation du contrôle d'accès côté serveur, la configuration des outils IA et la configuration de l'interface utilisateur. 

## **2. Définition des rôles HARI** 

La plateforme HARI définit quatre rôles utilisateurs. Chaque rôle hérite des permissions du rôle inférieur et y ajoute ses propres droits (héritage cumulatif). 

|**Enum Prisma**|**Nom HARI**|**Périmètre**|**Contrainte**|
|---|---|---|---|
|`EMPLOYEE`|Collaborateur|Accès aux fonctonnalités<br>personnelles : profl, congés,<br>fches de paie, assistant IA.|Le rôle de base. Peut<br>uniquement voir ses propres<br>données.|
|`MANAGER`|Manager|Hérite de EMPLOYEE + accès<br>à son équipe directe :<br>annuaire équipe, congés<br>équipe, approbaton.|Peut approuver les congés<br>de ses reports uniquement.|
|`HR_ADMIN`|RH (Ressources Humaines)|Hérite de MANAGER + accès<br>complet annuaire, salaires,<br>geston employés,<br>documents RH.|Rôle méter principal. Gère<br>les documents RAG et les<br>atestatons.|
|`SUPER_ADMIN`|Admin|Hérite de HR_ADMIN +<br>administraton plateforme,<br>console alertes, logs,<br>paramètres.|Rôle technique/sécurité.<br>Seul à accéder à la<br>supervision IA.|



## **3. Permissions techniques — src/lib/rbac.ts** 

Les permissions sont définies dans le fichier src/lib/rbac.ts, source unique de vérité pour l'UI, les routes serveur et les outils IA. 

```
// Extrait de src/lib/rbac.ts
```

```
export const PERMISSIONS = [
  "directory:read:self",   // Voir son propre profil
  "directory:read:team",   // Voir les reports directs
  "directory:read:all",    // Voir tout l'annuaire
  "salary:read:all",       // Voir les salaires (sensible)
  "leave:request",         // Soumettre une demande de congé
  "leave:read:self",       // Voir ses propres congés
  "leave:read:team",       // Voir les congés de l'équipe
  "leave:approve",         // Approuver / rejeter des congés
  "payslip:read:self",     // Voir sa propre fiche de paie
  "payslip:read:any",      // Voir n'importe quelle fiche de paie
  "handbook:read",         // Interroger le RAG (assistant IA)
  "employee:manage",       // Créer / modifier des employés et documents
  "admin:settings",        // Paramètres plateforme + alertes admin
```

`] as const; // Héritage cumulatif des permissions : // EMPLOYEE` ⊂ `MANAGER` ⊂ `HR_ADMIN` ⊂ `SUPER_ADMIN` 

La fonction can(role, permission) retourne true si le rôle possède la permission. Elle est utilisée dans withPermission() pour les outils IA et dans les pages/composants UI. 

## **4. Matrice RBAC détaillée** 

Le tableau ci-dessous recense l'ensemble des fonctionnalités de la plateforme HARI et les droits associés à chaque rôle. Les droits sont vérifiés côté serveur à chaque requête — jamais côté client. 

|**✔**Autorisé|**✔**Autorisé|**✘**Refusé|**✘**Refusé|**◐**Partel / conditonnel|**◐**Partel / conditonnel|**—**Non applicable|**—**Non applicable|
|---|---|---|---|---|---|---|---|
|||||||||
|**Fonctonnalité /**<br>**Acton**|**Collaborateur**||**Manager**|**RH**|**Admin**||**Note / Permission**|
|**AUTHENTIFICATI**<br>**ON**||||||||
|Se connecter à la<br>plateforme|**✔**||**✔**|**✔**|**✔**||_Tous les rôles —_<br>_Auth.js_|
|Mode connexion<br>one-click démo|**✔**||**✔**|**✔**|**✔**||_Comptes de_<br>_démonstraton_<br>_uniquement_|
|Voir son profl de<br>session|**✔**||**✔**|**✔**|**✔**|||
|**DASHBOARD**||||||||
|Dashboard<br>Collaborateur (KPI<br>personnels)|**✔**||**✔**|**✔**|**✔**||_Chaque rôle voit ses_<br>_propres données_|
|Dashboard<br>Manager (KPI<br>équipe)|**✘**||**✔**|**✔**|**✔**||_Manager+_<br>_uniquement_|
|Dashboard RH<br>(actvité IA,<br>documents)|**✘**||**✘**|**✔**|**✔**||_HR_ADMIN+_<br>_uniquement_|
|Dashboard Admin<br>(alertes globales)|**✘**||**✘**|**✘**|**✔**||_SUPER_ADMIN_<br>_uniquement_|
|**ANNUAIRE**<br>**COLLABORATEUR**<br>**S**||||||||
|Consulter son<br>propre profl|**✔**||**✔**|**✔**|**✔**||_directory:read:self_|
|Consulter les<br>profls de son<br>équipe|**✘**||**✔**|**✔**|**✔**||_directory:read:team_|
|Consulter tous les<br>profls (annuaire<br>global)|**✘**||**✘**|**✔**|**✔**||_directory:read:all_|



|Modifer / créer<br>un profl employé|**✘**|**✘**|**✔**|**✔**|_employee:manage_|
|---|---|---|---|---|---|
|Voir le salaire<br>d'un<br>collaborateur|**✘**|**✘**|**✔**|**✔**|_salary:read:all_|
|**GESTION DES**<br>**CONGÉS**||||||
|Soumetre une<br>demande de<br>congé|**✔**|**✔**|**✔**|**✔**|_leave:request_|
|Consulter ses<br>propres congés|**✔**|**✔**|**✔**|**✔**|_leave:read:self_|
|Consulter les<br>congés de son<br>équipe|**✘**|**✔**|**✔**|**✔**|_leave:read:team_|
|Approuver /<br>refuser une<br>demande de<br>congé|**✘**|**✔**|**✔**|**✔**|_leave:approve —_<br>_Manager limité à_<br>_ses reports_|
|Approuver les<br>congés à l'échelle<br>entreprise|**✘**|**✘**|**✔**|**✔**|_leave:approve +_<br>_directory:read:all_|
|**FICHES DE PAIE**||||||
|Voir sa propre<br>fche de paie|**✔**|**✔**|**✔**|**✔**|_payslip:read:self_|
|Voir la fche de<br>paie d'un autre<br>employé|**✘**|**✘**|**✔**|**✔**|_payslip:read:any_|
|**ASSISTANT IA**<br>**(CHAT)**||||||
|Interroger<br>l'assistant IA<br>(handbook)|**✔**|**✔**|**✔**|**✔**|_handbook:read_|
|Obtenir une<br>réponse sourcée<br>(RAG)|**✔**|**✔**|**✔**|**✔**|_Filtré par rôle côté_<br>_serveur_|
|Demander des<br>infos sur son<br>équipe via IA|**✘**|**✔**|**✔**|**✔**|_directory:read:team_<br>_requis_|
|Demander les<br>salaires via IA|**✘**|**✘**|**✔**|**✔**|_salary:read:all_<br>_requis — refus_<br>_contrôlé sinon_|
|Queston sensible<br>→ refus contrôlé|**✔**|**✔**|**✔**|**✔**|_Réponse IA de refus_<br>_+ AiEvent créé_|
|**DOCUMENTS RH**<br>**VALIDÉS (Sprint**<br>**2)**||||||
|Consulter les<br>documents<br>validés (lecture)|**✔**|**✔**|**✔**|**✔**|_Accès en lecture_<br>_seule_|



|Créer un<br>document RH<br>(brouillon)|**✘**|**✘**|**✔**|**✔**|_employee:manage_<br>_requis_|
|---|---|---|---|---|---|
|Valider un<br>document RH|**✘**|**✘**|**✔**|**✔**|_employee:manage_<br>_requis_|
|Archiver un<br>document RH|**✘**|**✘**|**✔**|**✔**|_employee:manage_<br>_requis_|
|Ingérer dans le<br>RAG (embedding)|**✘**|**✘**|**✔**|**✔**|_Déclenché à la_<br>_validaton_|
|**GÉNÉRATION**<br>**DOCUMENTAIRE**<br>**(Sprint 4)**||||||
|Demander une<br>atestaton de<br>travail|**✔**|**✔**|**✔**|**✔**|_Collaborateur inite_<br>_la demande_|
|Valider et générer<br>le PDF (RH)|**✘**|**✘**|**✔**|**✔**|_employee:manage_<br>_requis_|
|Télécharger son<br>propre document<br>PDF|**✔**|**✔**|**✔**|**✔**|_RBAC sur l'identté_<br>_du demandeur_|
|Télécharger le<br>document d'un<br>autre employé|**✘**|**✘**|**✔**|**✔**|_RH uniquement_|
|Voir l'historique<br>de ses documents|**✔**|**✔**|**✔**|**✔**||
|**ALERTES ET**<br>**SUPERVISION IA**<br>**(Sprint 3)**||||||
|Voir les alertes IA<br>(console admin)|**✘**|**✘**|**✘**|**✔**|_admin:setngs_<br>_requis —_<br>_SUPER_ADMIN_<br>_uniquement_|
|Changer le statut<br>d'une alerte|**✘**|**✘**|**✘**|**✔**|_admin:setngs_<br>_requis_|
|Consulter les<br>AuditLog|**✘**|**✘**|**✘**|**✔**|_admin:setngs_<br>_requis_|
|**ADMINISTRATIO**<br>**N PLATEFORME**||||||
|Accéder aux<br>paramètres<br>plateforme|**✘**|**✘**|**✘**|**✔**|_admin:setngs_|
|Modifer les rôles<br>utlisateurs|**✘**|**✘**|**✘**|**✔**|_admin:setngs —_<br>_journalisé dans_<br>_AuditLog_|
|Accéder aux logs<br>complets|**✘**|**✘**|**✘**|**✔**|_admin:setngs_|



## **5. Accès sensibles et refus attendus** 

Les fonctionnalités suivantes sont considérées comme sensibles et font l'objet d'une attention particulière dans l'implémentation et les tests : 

|**Fonctonnalité sensible**|**Permission requise**|**Rôles refusés**|**Rôles autorisés**|**Justfcaton**|
|---|---|---|---|---|
|Consultaton des<br>salaires|`salary:read:all`|Collaborateur,<br>Manager|HR_ADMIN,<br>SUPER_ADMIN|Données fnancières<br>personnelles — risque<br>RGPD et confdentalité<br>RH élevé.|
|Fiches de paie terces|`payslip:read:any`|Collaborateur,<br>Manager|HR_ADMIN,<br>SUPER_ADMIN|Informaton salariale<br>protégée.|
|Console alertes IA|`admin:settings`|Collaborateur,<br>Manager, RH|SUPER_ADMIN|Accès aux événements<br>de sécurité — réservé à<br>l'admin technique.|
|Modifcaton de rôle|`admin:settings`|Collaborateur,<br>Manager, RH|SUPER_ADMIN|Tout changement de<br>rôle est journalisé dans<br>AuditLog<br>(ROLE_CHANGED).|
|Queston salaire via IA|`salary:read:all`<br>`(tool)`|Collaborateur,<br>Manager|HR_ADMIN,<br>SUPER_ADMIN|Refus contrôlé +<br>AiEvent CRITICAL +<br>Alert — scénario de<br>démo Sprint 3.|
|Annuaire global|`directory:read:a`<br>`ll`|Collaborateur|Manager (équipe), RH,<br>Admin|Portée limitée au<br>périmètre du rôle.|
|Génératon /<br>téléchargement PDF<br>ters|`employee:manage`|Collaborateur,<br>Manager|HR_ADMIN,<br>SUPER_ADMIN|Vérifcaton RBAC sur<br>l'identté du<br>demandeur avant tout<br>téléchargement.|



## **6. Scénario de démonstration RBAC** 

Le parcours suivant doit être démontrable à la fin du Sprint 1 : 

## **Étape 1 : Se connecter en Collaborateur (EMPLOYEE)** 

Accès : dashboard personnel, annuaire (soi-même), congés, assistant IA. 

## **Étape 2 : Tenter d'accéder à l'annuaire global ou aux alertes** 

Résultat attendu : accès refusé côté serveur — page 403 ou redirection. 

## **Étape 3 : Se connecter en Manager (MANAGER)** 

Accès supplémentaire : annuaire équipe, congés équipe, approbation des congés. 

## **Étape 4 : Approuver un congé d'un rapport direct** 

Vérifier que le manager ne peut pas approuver le congé d'un employé hors équipe. 

## **Étape 5 : Se connecter en RH (HR_ADMIN)** 

Accès supplémentaire : annuaire global, salaires, gestion employés, documents RH. 

## **Étape 6 : Poser une question salaire via l'assistant IA (en Collaborateur)** 

Résultat attendu : refus contrôlé de l'assistant + AiEvent CRITICAL + Alert (Sprint 3). 

## **Étape 7 : Se connecter en Admin (SUPER_ADMIN)** 

Accès supplémentaire : console alertes, paramètres, logs complets. 

## **7. Règles d'implémentation** 

Ces règles s'appliquent à tous les développeurs du projet HARI : 

**Source unique de vérité :** La matrice RBAC est implémentée dans src/lib/rbac.ts. Tout ajout de permission passe par ce fichier. 

**Vérification côté serveur obligatoire :** Chaque route API et chaque outil IA vérifie le rôle depuis la session Auth.js. Jamais depuis le payload client. 

**withPermission() pour les outils IA :** Tous les outils dans src/lib/ai/tools.ts utilisent withPermission(caller, permission, fn). Sur refus : { denied: true } — jamais une exception qui révèle des données. 

**can() pour l'UI :** Les composants UI (sidebar, pages) utilisent can(role, permission) pour afficher ou masquer les éléments — mais cette protection ne remplace pas la vérification serveur. 

**Journalisation des refus :** Tout refus RBAC côté serveur doit créer un AiEvent (QUERY_DENIED) ou un AuditLog (ACCESS_DENIED). Voir SCRUM-029. 

**Tests obligatoires :** Chaque permission sensible doit avoir un test d'intégration vérifiant le refus inter-rôles. Voir src/tests/rbac.test.ts. 

## **8. Critères d'acceptation** 

- ☐  Tous les rôles sont listés (EMPLOYEE, MANAGER, HR_ADMIN, SUPER_ADMIN). 

- ☐  Les droits sont définis par fonctionnalité pour chaque rôle. 

- ☐  Les accès sensibles sont identifiés (salaires, alertes, admin). 

- ☐  Les refus attendus sont documentés et associés à une permission. 

- ☐  La matrice est validée par l'équipe sécurité (Kawtar HALIB, El Mahdi EL BOUGHDADI). 

- ☐  La matrice est validée par l'équipe dev (Chaimaa MELLOUK). 

- ☐  La matrice est alignée avec le code src/lib/rbac.ts existant. 

- ☐  Le scénario de démonstration RBAC est défini. 

- ☐  Les règles d'implémentation sont documentées. 

- ☐  Ce document est partagé dans Confluence. 

- ☐  Les tickets Sprint 1 peuvent être lancés sur la base de cette matrice. 

## **9. Dépendances** 

|**Dépendance**|**Directon**|**Ticket**|**Commentaire**|
|---|---|---|---|
|Périmètre MVP|Entrante|**SCRUM-025**|Défnit ce qui est in/out du<br>MVP|
|Scénario de démo|Entrante|**SCRUM-031**|Précise les parcours à<br>démontrer|
|Architecture sécurité|Sortante|**SCRUM-103**|Utlise la matrice RBAC|



|Threat model IA/RAG|Sortante|**SCRUM-030**|S'appuie sur les refus RBAC|
|---|---|---|---|
|Architecture logs|Sortante|**SCRUM-029**|Journalise les refus défnis<br>ici|
|ERD MVP|Parallèle|**SCRUM-099**|Les rôles doivent<br>correspondre à l'enum<br>Prisma|
|Validaton RBAC MVP|Sortante|**SCRUM-026**|Valide ce document côté PO|
|Implémentaton Sprint 1|Sortante|**Sprint 1**|Branding RBAC,<br>renforcement, tests|



_Livrable SCRUM-096 — Kawtar HALIB avec El Mahdi EL BOUGHDADI et Chaimaa MELLOUK | Sprint 0 — Projet HARI | 2026-06-23_ 

