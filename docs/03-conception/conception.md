# Phase 3 — Conception (UML)

Cette phase formalise la conception issue des besoins (phase 2) sous forme de diagrammes UML.
Les sources des diagrammes sont en Mermaid (rendu natif sur GitHub/GitLab).

## 1. Diagramme de cas d'utilisation

```mermaid
flowchart TB
    Employee(["Employé"])
    Manager(["Manager"])
    HRAdmin(["Admin RH"])
    SuperAdmin(["Super Admin"])

    Employee --> Manager --> HRAdmin --> SuperAdmin

    UC1(("Se connecter"))
    UC2(("Consulter son profil"))
    UC3(("Demander un congé"))
    UC4(("Consulter son solde de congés"))
    UC5(("Consulter ses fiches de paie"))
    UC6(("Interroger le règlement (RAG)"))
    UC7(("Discuter avec l'assistant IA"))
    UC8(("Voir l'équipe"))
    UC9(("Approuver / rejeter un congé"))
    UC10(("Voir l'annuaire complet"))
    UC11(("Voir les salaires"))
    UC12(("Consulter une fiche de paie de tiers"))
    UC13(("Gérer les employés"))
    UC14(("Gérer les paramètres plateforme"))

    Employee --> UC1
    Employee --> UC2
    Employee --> UC3
    Employee --> UC4
    Employee --> UC5
    Employee --> UC6
    Employee --> UC7

    Manager --> UC8
    Manager --> UC9

    HRAdmin --> UC10
    HRAdmin --> UC11
    HRAdmin --> UC12
    HRAdmin --> UC13

    SuperAdmin --> UC14

    UC7 -.include.-> UC4
    UC7 -.include.-> UC3
    UC7 -.include.-> UC6
    UC7 -.include.-> UC9
```

> Chaque cas d'utilisation déclenché via le chat (UC7) repasse par les **mêmes vérifications de
> permission** que son équivalent UI — l'assistant IA n'est qu'une nouvelle porte d'entrée vers les
> cas d'utilisation existants, jamais un chemin parallèle.

## 2. Diagramme de classes (domaine)

```mermaid
classDiagram
    class User {
        +String id
        +String email
        +String name
        +String passwordHash
        +Role role
    }
    class Employee {
        +String id
        +String title
        +String department
        +String location
        +Date startDate
        +Int salary
    }
    class LeaveBalance {
        +LeaveType type
        +Int totalDays
        +Int usedDays
    }
    class LeaveRequest {
        +LeaveType type
        +Date startDate
        +Date endDate
        +Int days
        +String reason
        +LeaveStatus status
    }
    class HandbookChunk {
        +String section
        +String content
        +halfvec embedding
    }
    class Role {
        <<enumeration>>
        EMPLOYEE
        MANAGER
        HR_ADMIN
        SUPER_ADMIN
    }
    class LeaveStatus {
        <<enumeration>>
        PENDING
        APPROVED
        REJECTED
    }

    User "1" -- "0..1" Employee : possède
    Employee "0..1" -- "0..*" Employee : manage / est managé par
    Employee "1" -- "0..*" LeaveBalance : accumule
    Employee "1" -- "0..*" LeaveRequest : soumet
    Employee "0..1" -- "0..*" LeaveRequest : approuve
    User --> Role
    LeaveRequest --> LeaveStatus
```

`HandbookChunk` est volontairement isolé : c'est le corpus du RAG, sans clé étrangère vers le
domaine RH.

## 3. Diagramme de classes (logique RBAC)

```mermaid
classDiagram
    class Permission {
        <<type>>
        directory:read:self
        directory:read:team
        directory:read:all
        salary:read:all
        leave:request
        leave:read:self
        leave:read:team
        leave:approve
        payslip:read:self
        payslip:read:any
        handbook:read
        employee:manage
        admin:settings
    }
    class RbacModule {
        +ROLE_PERMISSIONS: Record~Role, Permission[]~
        +can(role, permission) bool
    }
    class HrDataLayer {
        +getEmployee(session, id)
        +listDirectory(session)
        +getLeaveBalance(session, id)
        +listLeaveRequests(session)
        +getPayslip(session, id)
    }
    class AiTool {
        +execute(input, session)
    }
    class WithPermission {
        +wrap(permission, handler)
    }

    RbacModule <.. HrDataLayer : can()
    RbacModule <.. WithPermission : can()
    WithPermission o-- AiTool : protège
    AiTool ..> HrDataLayer : appelle
```

`lib/rbac.ts` est la source unique consultée par la couche données (`lib/hr.ts`) **et** par les
outils IA (`lib/ai/tools.ts` via `withPermission`) — garantissant que le chatbot ne peut jamais lire
plus de données que l'UI ne le permettrait pour le même rôle.

## 4. Diagramme de séquence — message de chat avec appel d'outil

```mermaid
sequenceDiagram
    participant U as Utilisateur (navigateur)
    participant C as useChat (client)
    participant R as /api/chat (serveur)
    participant A as Auth.js
    participant M as Modèle (OpenRouter)
    participant T as Outils RH + RBAC
    participant DB as PostgreSQL

    U->>C: "combien de jours de congés me reste-t-il ?"
    C->>R: POST messages + modelId
    R->>A: auth() -> session.role, employeeId
    R->>M: streamText(system, messages, tools)
    M-->>R: tokens de raisonnement
    R-->>C: flux "Thinking..."
    M->>T: appel outil getLeaveBalance()
    T->>T: can(role, "leave:read:self") ?
    alt autorisé
        T->>DB: requête scoping (propre solde)
        DB-->>T: lignes
        T-->>M: résultat outil (JSON)
        R-->>C: flux tool-part -> widget généré
    else refusé
        T-->>M: { denied: true }
        R-->>C: carte "accès refusé"
    end
    M-->>R: réponse finale
    R-->>C: flux texte -> bulle de message
```

## 5. Diagramme d'états — cycle de vie d'une demande de congé

```mermaid
stateDiagram-v2
    [*] --> PENDING : leave:request (soumission)
    PENDING --> APPROVED : leave:approve (manager)
    PENDING --> REJECTED : leave:approve (manager)
    APPROVED --> [*]
    REJECTED --> [*]
```

## 6. Modèle de données (ERD)

```mermaid
erDiagram
    User ||--o| Employee : "a un profil"
    Employee ||--o{ Employee : "manage"
    Employee ||--o{ LeaveBalance : "accumule"
    Employee ||--o{ LeaveRequest : "soumet"
    Employee |o--o{ LeaveRequest : "approuve"

    User {
        string id PK
        string email UK
        Role role
        string passwordHash
    }
    Employee {
        string id PK
        string userId FK
        string managerId FK
        string title
        string department
        int salary
    }
    LeaveBalance {
        LeaveType type
        int totalDays
        int usedDays
    }
    LeaveRequest {
        LeaveType type
        date startDate
        date endDate
        LeaveStatus status
        string approverId FK
    }
    HandbookChunk {
        string id PK
        string section
        string content
        halfvec embedding "384 dim, HNSW"
    }
```

## 7. Architecture en couches

```mermaid
flowchart LR
    B["Navigateur<br/>(React + useChat)"]
    subgraph Next["Application Next.js (serveur)"]
        S["Pages SSR + /api/chat<br/>session Auth.js"]
        C["RBAC + données scopées<br/>+ outils IA"]
    end
    DB[("PostgreSQL<br/>+ pgvector")]
    AI["Fournisseurs IA<br/>(OpenRouter / Gateway)"]

    B --> S --> C
    C -->|Prisma| DB
    S -->|streamText| AI
```

Voir la suite : [Phase 4 — Planification (Jira)](../04-jira/jira.md).
