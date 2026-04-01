# Système de Gestion des Upgrades et Renouvellements

## Vue d'ensemble

Le système gère automatiquement les demandes d'upgrade de plan et les renouvellements d'abonnement avec un bypass temporaire pour les prestataires suspendus.

## Fonctionnalités

### 1. Bypass temporaire pour prestataires suspendus

Quand un prestataire avec un abonnement expiré écrit au système :

- **7 messages maximum** pour gérer le renouvellement
- Compteur affiché dans les notifications
- Au-delà de 7 messages → redirection vers support email

### 2. Détection automatique des intentions

Le système détecte automatiquement :
- Choix de plan ("1", "2", "3", "Starter", "Pro", "Business", "oui")
- Demandes d'informations ("c'est quoi le plan Pro ?")
- Confirmations ("ok", "valide", "d'accord")
- Annulations ("non", "annuler", "laisser tomber")
- Preuves de paiement (images)

### 3. Workflow complet

```
Prestataire suspendu écrit
  ↓
Message de suspension + 7 messages disponibles
  ↓
Prestataire choisit un plan (1, 2 ou 3)
  ↓
Système présente les détails du plan
  ↓
Prestataire confirme
  ↓
Système demande la preuve de paiement
  ↓
Prestataire envoie capture d'écran
  ↓
Notification à l'admin
  ↓
Admin valide : "[nom prestataire] a payé"
  ↓
Compte réactivé + plan mis à jour
```

### 4. Notification prestataire - Client bloqué après 18h

Quand un client tente de réserver après 18h chez un prestataire Starter :

- Après **3 tentatives**, le prestataire reçoit une notification
- Message avec proposition d'upgrade vers plan Pro
- Explique les clients perdus

### 5. Admin sans restriction

L'admin (`ADMIN_PHONE` dans `.env`) a :

- ✅ Rate limit illimité
- ✅ Accès à toutes fonctionnalités (bypass `verifierAcces`)
- ✅ Peut tester les fonctionnalités prestataire/client
- ✅ Peut discuter librement avec l'IA
- ✅ Commandes admin prioritaires

## Tables créées

### `demandes_upgrade`
- `prestataire_id` : UUID du prestataire
- `plan_actuel` : Plan actuel
- `plan_demande` : Plan demandé
- `type` : 'upgrade' ou 'renouvellement'
- `statut` : 'en_attente', 'valide', 'refuse'
- `messages_utilises` : Compteur de messages
- `messages_restants` : Messages disponibles (max 7)
- `preuve_paiement_url` : URL de la preuve
- `valide_par` : 'admin' ou 'automatique'

### `conversations_upgrade`
- `demande_id` : UUID de la demande
- `role` : 'user' ou 'assistant'
- `contenu` : Contenu du message

### `tentatives_client_apres_18h`
- `prestataire_id` : UUID du prestataire Starter
- `client_telephone` : Téléphone du client
- `nombre_tentatives` : Compteur de tentatives
- `notif_prestataire_envoyee` : Boolean

## Commandes admin

### Valider un paiement avec upgrade

```
Salon Fatima a payé
```

Si une demande d'upgrade existe, le système :
1. Change le plan automatiquement
2. Renouvelle l'abonnement
3. Notifie le prestataire du nouveau plan
4. Clôture la demande d'upgrade

## Sécurité

- Limite stricte de 7 messages par demande
- Historique complet dans `conversations_upgrade`
- Notifications admin pour chaque preuve de paiement
- Protection contre les abus (compteur, timeout)

## Variables d'environnement

```env
SUPPORT_EMAIL=support@riserv.mu
ADMIN_PHONE=+23055040203
```
