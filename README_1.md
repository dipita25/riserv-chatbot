# Riserv — Chatbot WhatsApp de réservation

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture générale](#architecture-générale)
3. [Stack technique](#stack-technique)
4. [Flux utilisateurs](#flux-utilisateurs)
   - [Flux client](#flux-client)
   - [Flux prestataire](#flux-prestataire)
   - [Flux onboarding prestataire](#flux-onboarding-prestataire)
5. [Fonctionnalités prestataire](#fonctionnalités-prestataire)
   - [Agenda](#agenda)
   - [Gestion des rendez-vous](#gestion-des-rendez-vous)
   - [Gestion des disponibilités](#gestion-des-disponibilités)
   - [Gestion des services](#gestion-des-services)
   - [Aide guidée et support](#aide-guidée-et-support)
6. [Fonctionnalités client](#fonctionnalités-client)
   - [Notes vocales](#notes-vocales)
7. [Support multilingue](#support-multilingue)
8. [Plans et abonnements](#plans-et-abonnements)
9. [Système de notifications et rappels](#système-de-notifications-et-rappels)
10. [Identification des utilisateurs](#identification-des-utilisateurs)
11. [Provider WhatsApp](#provider-whatsapp)
12. [Variables d'environnement](#variables-denvironnement)
13. [Roadmap](#roadmap)

---

## Vue d'ensemble

**Riserv** est un SaaS de gestion de réservations entièrement opéré via WhatsApp, ciblant les prestataires de services à Maurice et dans la région africaine (coiffeurs, médecins, coachs, thérapeutes, etc.).

### Modèle de fonctionnement

- Le **prestataire** s'abonne à Riserv (abonnement mensuel ~Rs 1,500/mois).
- Il reçoit un **lien unique** à partager à ses clients : `wa.me/+230XXXX?text=NomDuSalon`
- Les **clients** cliquent ce lien, WhatsApp s'ouvre et le chatbot prend en charge la réservation de bout en bout.
- Le prestataire **gère tout** (agenda, services, disponibilités) en écrivant au numéro Riserv depuis son WhatsApp habituel — aucune app supplémentaire à installer.

### Ce que Riserv remplace

- Les réservations manuelles par WhatsApp (chronophages)
- Les agendas papier
- Les appels téléphoniques pour confirmer les RDV
- Les relances manuelles des clients inactifs

---

## Architecture générale

```
Clients                    Prestataires
(lien unique)              (numéro perso)
    │                           │
    └──────────┬────────────────┘
               ▼
        Meta Cloud API
        (1 seul numéro Riserv)
               │
               ▼
        Webhook Node.js
        (reçoit tous les messages)
               │
        ┌──────▼──────┐
        │   Routeur   │ ← vérifie le numéro expéditeur dans Supabase
        └──────┬──────┘
       ┌───────┴────────┐
       ▼                ▼
  Mode client    Mode prestataire
  (réservation)  (gestion agenda)
       │                │
       └───────┬────────┘
               ▼
        Claude API (Sonnet)
        (compréhension langage naturel)
               │
               ▼
           Supabase
        (PostgreSQL)
               │
        Cron job (Render)
        rappels J-1 automatiques
```

### Principe d'identification

Chaque message entrant contient le numéro de téléphone de l'expéditeur (`from`). Le backend vérifie ce numéro dans Supabase :

| Numéro trouvé dans | Comportement |
|---|---|
| Table `prestataires` | Mode prestataire activé |
| Table `clients` | Mode client — client connu |
| Nulle part + mot clé onboarding | Flow onboarding prestataire |
| Nulle part | Mode client — nouveau client |

---

## Stack technique

| Composant | Outil | Environnement |
|---|---|---|
| Backend / API | Node.js + Express | Dev + Prod |
| Base de données | Supabase (PostgreSQL) | Dev + Prod |
| IA / NLP | Claude API (claude-sonnet) | Dev + Prod |
| Transcription vocale | OpenAI Whisper API | Dev + Prod |
| WhatsApp (dev) | Twilio WhatsApp Sandbox | Dev uniquement |
| WhatsApp (prod) | Meta Cloud API | Prod uniquement |
| Hébergement | Render.com | Dev + Prod |
| Cron jobs | Render Cron Jobs | Dev + Prod |

### Abstraction du provider WhatsApp

Le provider WhatsApp est **entièrement abstrait** dans `services/whatsappService.js`. Le switch Twilio → Meta se fait en changeant une seule variable d'environnement (`WHATSAPP_PROVIDER`) sans modifier le code applicatif.

```
WHATSAPP_PROVIDER=twilio   ← développement
WHATSAPP_PROVIDER=meta     ← production
```

---

## Flux utilisateurs

### Flux client

1. Le client clique sur le lien unique du prestataire (`wa.me/+230XXXX?text=Salon+Fatima`)
2. WhatsApp s'ouvre avec le nom du salon pré-écrit
3. Le chatbot accueille le client **au nom du prestataire** (pas au nom de Riserv)
4. Le chatbot propose les services disponibles
5. Le client choisit un service
6. Le chatbot vérifie les créneaux disponibles dans Supabase
7. Le chatbot propose 3 créneaux au client
8. Le client choisit un créneau
9. La réservation est enregistrée dans Supabase
10. Le client reçoit une confirmation WhatsApp
11. Le prestataire reçoit une notification sur son numéro personnel
12. La veille du RDV, le client et le prestataire reçoivent un rappel automatique

### Flux prestataire

Le prestataire écrit au numéro Riserv depuis son WhatsApp habituel. Le backend reconnaît son numéro via Supabase et active le mode prestataire. Il peut alors utiliser toutes les commandes documentées dans la section [Fonctionnalités prestataire](#fonctionnalités-prestataire).

### Flux onboarding prestataire

L'onboarding est **100% automatique** — aucune intervention manuelle de l'équipe Riserv.

1. Le prestataire écrit au numéro Riserv avec un mot clé déclencheur :
   - `RISERV PRO`
   - `rejoindre riserv`
   - `inscription`
   - `je suis prestataire`
   - `devenir partenaire`
   - Ou toute phrase similaire détectée par Claude

2. Le chatbot collecte les informations en conversation :
   - Nom de l'établissement
   - Type de services proposés
   - Durée et prix de chaque service
   - Jours et horaires d'ouverture

3. Supabase enregistre automatiquement le prestataire

4. Le chatbot génère et envoie le lien client unique :
   `wa.me/+230XXXX?text=NomDuSalon`

5. Le prestataire partage ce lien sur ses réseaux sociaux, carte de visite, Google Maps, etc.

---

## Fonctionnalités prestataire

Toutes les fonctionnalités sont accessibles via WhatsApp en **langage naturel**. Claude interprète les intentions — pas besoin de commandes exactes.

---

### Agenda

#### Voir l'agenda du jour

**Commandes exemples :**
```
"agenda aujourd'hui"
"mes RDV du jour"
"qu'est-ce que j'ai aujourd'hui ?"
```

**Réponse du chatbot :**
```
📅 Agenda du mardi 28 mars :

09h00 — Sarah, Coupe femme (45 min)
11h00 — Marc, Barbe (30 min)
14h30 — Julie, Coloration (2h)
17h00 — Libre
```

#### Voir l'agenda d'un jour précis

**Commandes exemples :**
```
"agenda demain"
"agenda jeudi"
"agenda vendredi 4 avril"
```

#### Voir l'agenda de la semaine

**Commandes exemples :**
```
"agenda semaine"
"mes RDV cette semaine"
"planning de la semaine"
```

**Réponse du chatbot :**
```
📅 Semaine du 28 mars au 2 avril :

Lundi 28 : 3 RDV (09h, 11h, 14h30)
Mardi 29 : 2 RDV (10h, 15h)
Mercredi 30 : Indisponible
Jeudi 31 : 4 RDV (09h, 11h, 13h, 16h)
Vendredi 1 : 1 RDV (10h)
Samedi 2 : 2 RDV (09h, 11h)
```

#### Voir le détail d'un rendez-vous

**Commandes exemples :**
```
"infos RDV Sarah"
"détail RDV de 14h"
"qui est mon RDV de demain matin ?"
```

**Réponse du chatbot :**
```
📋 Rendez-vous — Jeudi 31 mars à 14h00

Client : Sarah (+23057123456)
Service : Coloration complète
Durée : 2h00
Statut : Confirmé
```

---

### Gestion des rendez-vous

#### Annuler un rendez-vous

**Commandes exemples :**
```
"annule RDV Sarah demain"
"annule le RDV de 14h jeudi"
"supprime RDV Marc"
```

**Comportement :**
1. Le chatbot demande confirmation avant d'agir
2. Après confirmation, le RDV est annulé dans Supabase
3. Le client reçoit automatiquement une notification d'annulation sur WhatsApp
4. Le créneau redevient disponible pour de nouvelles réservations

#### Déplacer un rendez-vous

**Commandes exemples :**
```
"déplace RDV Sarah à jeudi 10h"
"reporte RDV Marc à la semaine prochaine"
"change RDV Julie de 14h à 16h"
```

**Comportement :**
1. Le chatbot vérifie la disponibilité du nouveau créneau
2. Demande confirmation
3. Met à jour Supabase
4. Notifie automatiquement le client du changement

#### Confirmer un rendez-vous manuellement

Les RDV sont confirmés automatiquement à la réservation. Le prestataire peut néanmoins confirmer manuellement si nécessaire (ex : RDV créé en attente de validation).

**Commandes exemples :**
```
"confirme RDV Marc"
"valide RDV de vendredi"
```

**Comportement :**
1. Supabase met à jour le statut à `confirmé`
2. Le client reçoit une notification de confirmation

---

### Gestion des disponibilités

#### Bloquer un créneau ponctuel

Permet de bloquer une plage horaire spécifique sans modifier les horaires habituels.

**Commandes exemples :**
```
"indispo vendredi après-midi"
"bloque mardi de 12h à 14h"
"je suis occupé jeudi matin"
```

**Comportement :**
- Le créneau est enregistré dans la table `creneaux_bloques`
- Aucune réservation client ne sera acceptée sur ce créneau
- Les RDV existants sur ce créneau ne sont PAS automatiquement annulés (le prestataire doit les gérer manuellement)

#### Poser des congés

**Commandes exemples :**
```
"congé du 1er au 7 avril"
"je suis fermé la semaine prochaine"
"vacances du 15 au 22 avril"
```

**Comportement :**
- Toute la période est bloquée dans `creneaux_bloques`
- Aucune réservation ne peut être prise sur cette période
- Le chatbot informera les clients qui tenteront de réserver

#### Modifier les horaires d'un jour précis

**Commandes exemples :**
```
"je ferme à 16h ce samedi"
"je commence à 10h demain"
"horaires spéciaux vendredi : 8h-13h"
```

**Comportement :**
- Modification enregistrée dans `creneaux_bloques` avec type `horaire_modifie`
- Applicable uniquement au jour concerné, pas aux semaines suivantes

#### Modifier les horaires habituels

**Commandes exemples :**
```
"je change mes horaires : lundi-vendredi 9h-17h"
"à partir de la semaine prochaine je ferme le mercredi"
"nouveaux horaires du samedi : 8h-12h"
```

**Comportement :**
- Mise à jour du champ `horaires` dans la table `prestataires`
- Applicable immédiatement pour toutes les semaines suivantes

---

### Gestion des services

#### Lister les services

**Commandes exemples :**
```
"mes services"
"liste mes prestations"
"qu'est-ce que je propose ?"
```

**Réponse du chatbot :**
```
💈 Vos services :

1. Coupe femme — 45 min — Rs 350
2. Coupe homme — 30 min — Rs 250
3. Coloration complète — 2h — Rs 800
4. Barbe — 30 min — Rs 200
5. Lissage — 2h30 — Rs 1,200
```

#### Ajouter un service

**Commandes exemples :**
```
"ajoute Lissage brésilien 2h Rs 1200"
"nouveau service : Brushing 45min Rs 300"
"ajoute Manucure 1h Rs 400"
```

**Comportement :**
- Le chatbot extrait le nom, la durée et le prix via Claude
- Demande confirmation avant d'enregistrer
- Enregistre dans la table `services` liée au prestataire
- Le service est immédiatement disponible pour les réservations clients

#### Modifier un service

**Commandes exemples :**
```
"coupe femme passe à Rs 400"
"change durée coloration à 2h30"
"renomme Barbe en Taille barbe"
```

**Comportement :**
- Mise à jour du champ concerné dans `services`
- Confirmation envoyée au prestataire
- Les RDV existants pour ce service ne sont pas affectés

#### Supprimer un service

**Commandes exemples :**
```
"retire Barbe de mes services"
"supprime le service Manucure"
"je ne fais plus de Lissage"
```

**Comportement :**
1. Le chatbot vérifie s'il existe des RDV futurs pour ce service
2. Si oui, informe le prestataire et demande comment procéder
3. Si non, supprime le service après confirmation
4. Le service n'apparaît plus dans le menu client

---

### Aide guidée et support

Le prestataire peut demander de l'aide à tout moment en langage naturel. Claude détecte automatiquement quand il est perdu et adapte son niveau d'explication en conséquence — pas besoin de connaître les commandes exactes.

#### Demande d'aide générale

**Commandes exemples :**
```
"je comprends pas comment ça marche"
"aide"
"help"
"ki manyer sa marche ?"
```

**Réponse du chatbot :**
```
Pas de souci ! Je vais vous guider.
Que voulez-vous faire ?

1. 📅 Voir ou gérer mon agenda
2. ✏️ Annuler ou déplacer un RDV
3. 🔒 Bloquer des créneaux / congés
4. 💈 Gérer mes services
5. Autre chose
```

#### Aide contextuelle sur une fonctionnalité

**Commandes exemples :**
```
"comment j'ajoute un service ?"
"how do I block a day off ?"
"ki manyer mo blok enn zour ?"
```

**Comportement :**
- Claude explique la fonctionnalité demandée en termes simples
- Donne un exemple concret adapté au contexte du prestataire
- Invite le prestataire à essayer immédiatement
- Si la demande reste ambiguë, pose des questions de clarification

#### Clarification automatique

Quand un message est trop vague, Claude demande des précisions plutôt que d'échouer silencieusement.

```
Prestataire : "bloque mardi" ← trop vague
Chatbot : "Je veux bien bloquer mardi !
           Précisez-moi :
           - Toute la journée ou une plage horaire ?
           - Ce mardi ou un autre ?"
```

#### Confirmation avant toute action irréversible

Avant toute action qui modifie ou supprime des données (annulation, suppression de service, blocage de créneau), le chatbot demande toujours confirmation explicite du prestataire.

---

## Fonctionnalités client

### Notes vocales

> ⚠️ **Fonctionnalité réservée au plan Pro et Business.**
> Les prestataires avec un plan Starter ne peuvent pas activer les notes vocales pour leurs clients.

Les clients peuvent envoyer des notes vocales WhatsApp à la place de messages texte. Le système transcrit automatiquement l'audio en texte via l'API Whisper d'OpenAI, puis Claude traite la demande normalement.

#### Flux technique

```
Client envoie une note vocale (.ogg)
        │
        ▼
Webhook reçoit le fichier audio
        │
        ▼
Vérification : prestataire a plan Pro ou Business ?
        │
   ┌────┴────┐
  OUI       NON
   │         │
   ▼         ▼
Whisper   Message texte
transcrit  uniquement
   │
   ▼
Claude traite la transcription
(même logique que texte écrit)
        │
        ▼
Réponse WhatsApp en texte
```

#### Langues supportées par Whisper

Whisper détecte automatiquement la langue parlée, incluant :
- Français
- Anglais
- Créole mauricien (détecté comme français avec bonne précision)

#### Coût

Whisper facture $0.006/minute audio. Une note vocale de réservation dure rarement plus de 30 secondes — soit environ **$0.003 par note vocale**. Négligeable à l'échelle du MVP.

#### Réponse vocale (V2)

En V2, le chatbot pourra répondre également en note vocale via **ElevenLabs** ou **Amazon Polly**, rendant l'expérience 100% vocale pour les utilisateurs qui préfèrent ne pas taper.

---

## Support multilingue

Riserv supporte nativement trois langues : **français**, **anglais** et **créole mauricien**.

### Détection automatique de la langue

Claude détecte automatiquement la langue utilisée par le prestataire ou le client dès le premier message et répond dans cette même langue tout au long de la conversation.

```
Prestataire : "ki manyer mo azoute enn servis ?"
Chatbot : "Pena problem ! Dir mwa :
           - Non servis la
           - Konbien letan li pran
           - So pri

           Exanp : 'Koupe fam 45 minit Rs 350'
           Esey !"
```

```
Client : "how do I book an appointment ?"
Chatbot : "Hello! Which service would you like
           to book with Salon Fatima ?

           1. Women's haircut — 45 min — Rs 350
           2. Full colour — 2h — Rs 800
           3. Blowdry — 30 min — Rs 300"
```

### Règles de langue

- La langue est détectée dès le premier message
- Claude ne change pas de langue en cours de conversation sauf si l'utilisateur le demande explicitement
- En cas de mélange de langues, Claude utilise celle qui domine dans le message
- Le créole mauricien est traité comme une langue à part entière, pas comme du français approximatif

### Instruction dans le system prompt

```javascript
`LANGUE : Détecte automatiquement la langue de l'utilisateur
(français, anglais ou créole mauricien) et réponds toujours
dans sa langue. Ne change jamais de langue en cours de
conversation sauf demande explicite.`
```

---

## Plans et abonnements

### Tableau des plans

| Fonctionnalité | Starter | Pro | Business |
|---|---|---|---|
| Prix mensuel | Rs 1,000 | Rs 1,500 | Rs 2,500 |
| Agenda | ✅ | ✅ | ✅ |
| Gestion des RDV | ✅ | ✅ | ✅ |
| Gestion des disponibilités | ✅ | ✅ | ✅ |
| Gestion des services | ✅ | ✅ | ✅ |
| Aide guidée | ✅ | ✅ | ✅ |
| Multilingue (FR/EN/Créole) | ✅ | ✅ | ✅ |
| Notes vocales clients | ❌ | ✅ | ✅ |
| Statistiques | ❌ | ❌ | ✅ |
| Relances clients inactifs | ❌ | ❌ | ✅ |

### Champs d'abonnement dans Supabase

Chaque prestataire possède les champs suivants dans la table `prestataires` :

```sql
plan                  TEXT    -- 'starter', 'pro', 'business'
statut_abonnement     TEXT    -- 'actif', 'suspendu', 'expire'
date_expiration       DATE    -- fin de l'abonnement en cours
date_dernier_paiement DATE    -- dernier paiement reçu
```

### Contrôle d'accès

Chaque fonctionnalité est vérifiée avant exécution via le middleware `verifierAcces.js` :

```javascript
const FONCTIONNALITES_PAR_PLAN = {
  starter: [
    'agenda', 'gestion_rdv', 'disponibilites',
    'services', 'aide_guidee', 'multilingue'
  ],
  pro: [
    'agenda', 'gestion_rdv', 'disponibilites',
    'services', 'aide_guidee', 'multilingue',
    'notes_vocales'
  ],
  business: [
    'agenda', 'gestion_rdv', 'disponibilites',
    'services', 'aide_guidee', 'multilingue',
    'notes_vocales', 'statistiques', 'relances_clients'
  ]
}
```

### Messages de blocage

**Plan insuffisant :**
```
⚠️ La transcription de notes vocales est disponible
uniquement avec le plan Pro (Rs 1,500/mois).

Tapez UPGRADE pour passer au plan Pro.
```

**Abonnement expiré :**
```
⚠️ Votre abonnement Riserv a expiré.

Renouvelez votre abonnement pour continuer
à utiliser Riserv.

Contactez-nous : +230 XXXX XXXX
```

### Gestion des paiements

**MVP — Paiement manuel :**
- Le prestataire paie par virement / Juice / MyT Money
- La `date_expiration` est mise à jour manuellement dans Supabase
- Un cron job vérifie chaque nuit les abonnements expirés et suspend les accès automatiquement

**V2 — Paiement automatique :**
- Intégration d'une solution de paiement (Stripe ou solution locale mauricienne)
- Mise à jour automatique de Supabase via webhook de paiement

### Cron job de suspension automatique

Tourne chaque nuit à minuit. Suspend les prestataires dont la `date_expiration` est dépassée et leur envoie un message de relance 3 jours avant expiration :

```
⚠️ Votre abonnement Riserv expire dans 3 jours.
Renouvelez pour continuer à recevoir des réservations.

Contactez-nous : +230 XXXX XXXX
```

---

## Système de notifications et rappels

### Notifications automatiques

| Événement | Destinataire | Moment |
|---|---|---|
| Nouvelle réservation | Prestataire | Immédiat |
| Annulation client | Prestataire | Immédiat |
| Annulation prestataire | Client | Immédiat |
| Déplacement de RDV | Client | Immédiat |
| Confirmation de RDV | Client | Immédiat |

### Rappels automatiques (cron job)

Le cron job tourne chaque soir à 20h00 et envoie les rappels pour les RDV du lendemain.

**Rappel au client :**
```
Rappel : vous avez un rendez-vous demain
mardi 29 mars à 14h00 chez Salon Fatima.

Pour annuler, répondez ANNULER.
```

**Rappel au prestataire :**
```
📅 Rappel : RDV demain avec Sarah
à 14h00 — Coloration complète (2h).
```

### Relances clients inactifs (V2)

Un second cron job détecte les clients sans RDV depuis plus de X semaines et envoie un message de relance au nom du prestataire.

> ⚠️ Les rappels et relances envoyés hors fenêtre de 24h nécessitent des **templates Meta approuvés**. Ces templates doivent être soumis et validés dans le Meta Business Manager avant le déploiement en production.

---

## Identification des utilisateurs

### Principe

Le numéro de téléphone WhatsApp (`from`) est l'**identifiant universel** dans Riserv. Il est fourni automatiquement par Meta/Twilio dans chaque payload de message entrant — le client n'a rien à faire.

### Logique de routage

```javascript
// Pseudocode du routeur
const from = message.from // ex: "23057123456"

const prestataire = await supabase
  .from('prestataires')
  .select('*')
  .eq('telephone', from)
  .single()

if (prestataire) {
  // → Mode prestataire
  return handlePrestataire(from, message, prestataire)
}

const client = await supabase
  .from('clients')
  .select('*')
  .eq('telephone', from)
  .single()

if (client) {
  // → Mode client connu
  return handleClientConnu(from, message, client)
}

// Numéro inconnu → Claude détecte l'intention
const intention = await detecterIntention(message)

if (intention === 'ONBOARDING') {
  return startOnboarding(from)
} else {
  return handleNouveauClient(from, message)
}
```

---

## Provider WhatsApp

### Architecture d'abstraction

Toute la logique d'envoi de messages est centralisée dans `services/whatsappService.js`. Le reste du code appelle uniquement ce service — jamais Twilio ou Meta directement.

```javascript
// Utilisation dans le code
import { envoyerMessage, envoyerTemplate } from './services/whatsappService.js'

await envoyerMessage(to, "Votre RDV est confirmé !")
await envoyerTemplate(to, 'rappel_rdv', { prenom: 'Sarah', heure: '14h00' })
```

### Twilio (développement)

- Utiliser le **WhatsApp Sandbox** de Twilio
- Pas de validation de templates requise
- Idéal pour tester tous les flux sans contraintes Meta

### Meta Cloud API (production)

- 1 compte Meta Business → `business.facebook.com`
- 1 app sur `developers.facebook.com`
- Templates à soumettre et valider avant déploiement :
  - `rappel_rdv` — rappel automatique J-1
  - `confirmation_rdv` — confirmation de réservation
  - `annulation_rdv` — notification d'annulation
- Délai de validation Meta : 2 à 5 jours ouvrés

---

## Variables d'environnement

```bash
# ================================
# PROVIDER WHATSAPP
# ================================
WHATSAPP_PROVIDER=twilio        # 'twilio' (dev) ou 'meta' (prod)

# ================================
# TWILIO (développement)
# ================================
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_NUMBER=+14155238886      # Numéro sandbox WhatsApp Twilio

# ================================
# META CLOUD API (production)
# ================================
META_PHONE_ID=xxxxxxxxxxxxxxxxx
META_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
META_VERIFY_TOKEN=xxxxxxxx      # Token de vérification webhook

# ================================
# SUPABASE
# ================================
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxx
SUPABASE_SERVICE_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxx

# ================================
# CLAUDE API
# ================================
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxx

# ================================
# OPENAI WHISPER (notes vocales)
# ================================
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxx

# ================================
# APP
# ================================
PORT=3000
NODE_ENV=development            # 'development' ou 'production'
```

---

## Roadmap

### MVP (v1.0)

- [x] Architecture WhatsApp (Twilio dev / Meta prod)
- [x] Identification automatique client / prestataire
- [x] Onboarding prestataire automatique
- [x] Support multilingue (FR / EN / Créole)
- [x] Aide guidée et clarification automatique
- [x] Plans et abonnements (Starter / Pro / Business)
- [x] Contrôle d'accès par fonctionnalité
- [ ] Schéma Supabase complet
- [ ] Flow réservation client complet
- [ ] Agenda prestataire (jour / semaine)
- [ ] Gestion des RDV (annulation, déplacement, confirmation)
- [ ] Gestion des disponibilités (blocage, congés, horaires)
- [ ] Gestion des services (ajout, modification, suppression)
- [ ] Notes vocales clients (plan Pro+) via Whisper
- [ ] Notifications automatiques (nouvelle résa, annulation)
- [ ] Rappels automatiques J-1 (cron job)
- [ ] Cron job suspension abonnements expirés
- [ ] Déploiement Render.com
- [ ] Switch Twilio → Meta Cloud API

### V2

- [ ] Statistiques prestataire (RDV du mois, services populaires, clients fidèles)
- [ ] Historique client et profil
- [ ] Relances clients inactifs (plan Business)
- [ ] Contacter un client directement depuis WhatsApp
- [ ] Réponse vocale du chatbot (ElevenLabs / Amazon Polly)
- [ ] Paiement automatique des abonnements (Stripe / solution locale)
- [ ] Expansion régionale (Réunion, Madagascar, Afrique subsaharienne)
