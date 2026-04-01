# Diagrammes de Flux - Système d'Upgrade

## 🔄 Flux 1 : Prestataire suspendu veut renouveler

```
┌─────────────────────────────────────────┐
│ Prestataire suspendu écrit au système  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ Router : getPrestataire(from)           │
│ → prestataire trouvé                    │
│ → statut_abonnement !== 'actif'         │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ Vérifier demande en cours OU            │
│ message contient "oui"/"plan" OU image  │
└──────────────┬──────────────────────────┘
               │ OUI
               ▼
┌─────────────────────────────────────────┐
│ → handleUpgrade(from, body, prestataire)│
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ Vérifier compteur messages              │
│ messages_restants <= 0 ?                │
└──────────────┬──────────────────────────┘
       NON     │      OUI
       ├───────┴──────────┐
       ▼                  ▼
┌──────────────┐    ┌──────────────────┐
│ Continuer    │    │ BLOCAGE          │
│ le processus │    │ → Email support  │
└──────┬───────┘    └──────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ Incrémenter compteur                    │
│ messages_utilises + 1                   │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ Analyser intention avec IA :            │
│ - CHOISIR_PLAN                          │
│ - DEMANDER_INFOS                        │
│ - CONFIRMER                             │
│ - MESSAGE_GENERAL                       │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ Traiter selon intention                 │
│ → Présenter plan avec avantages         │
│ → Demander preuve de paiement           │
└──────────────┬──────────────────────────┘
               │
               ▼ IMAGE REÇUE
┌─────────────────────────────────────────┐
│ Enregistrer preuve_paiement_url         │
│ → Notifier ADMIN immédiatement          │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ Admin valide : "[nom] a payé"           │
│ → renouvelerAbonnement()                │
│ → Changer plan si nécessaire            │
│ → validerDemandeUpgrade()               │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ ✅ COMPTE RÉACTIVÉ                      │
│ → Notification prestataire              │
│ → statut_abonnement = 'actif'           │
│ → plan mis à jour                       │
└─────────────────────────────────────────┘
```

---

## 🕕 Flux 2 : Client bloqué après 18h (plan Starter)

```
┌─────────────────────────────────────────┐
│ Client écrit après 18h15                │
│ pour réserver chez prestataire Starter  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ clientHandler.js                        │
│ → estServiceDisponible(prestataire)     │
└──────────────┬──────────────────────────┘
               │
               ▼ disponible = false
┌─────────────────────────────────────────┐
│ Envoyer message au CLIENT :             │
│ "Service disponible jusqu'à 18h00"      │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ notifierPrestataireClientBloque18h()    │
│ → Vérifier table tentatives_client...   │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
  1ère ou 2ème      3ème tentative+
  tentative
       │                │
       ▼                ▼
┌──────────────┐  ┌──────────────────────┐
│ Incrémenter  │  │ Notifier PRESTATAIRE │
│ compteur     │  │ avec proposition     │
│ Silence      │  │ upgrade vers Pro     │
└──────────────┘  └───────┬──────────────┘
                          │
                          ▼
                  ┌─────────────────────┐
                  │ Prestataire répond  │
                  │ "OUI"               │
                  └───────┬─────────────┘
                          │
                          ▼
                  ┌─────────────────────┐
                  │ → handleUpgrade     │
                  │ Guide l'upgrade     │
                  └─────────────────────┘
```

---

## 👨‍💼 Flux 3 : Admin sans restriction

```
┌─────────────────────────────────────────┐
│ Admin (ADMIN_PHONE) écrit               │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ Router détecte estAdmin = true          │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
  Commande admin    Message libre
  (stats, liste)    (test, conversation)
       │                │
       ▼                ▼
┌──────────────┐  ┌──────────────────────┐
│ handleAdmin  │  │ Continue flux normal │
└──────────────┘  │ SANS vérification    │
                  └───────┬──────────────┘
                          │
                  ┌───────┴────────┐
                  │                │
           Est prestataire    Pas en base
           en base
                  │                │
                  ▼                ▼
          ┌──────────────┐  ┌─────────────┐
          │ handlePresta │  │ Message     │
          │ BYPASS total │  │ "Mode libre"│
          └──────────────┘  └─────────────┘
          
┌─────────────────────────────────────────┐
│ Dans verifierAcces() :                  │
│                                         │
│ if (adminPhone && telephone === admin)  │
│   return { autorise: true }  // BYPASS  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Dans verifierRateLimit() :              │
│                                         │
│ role = admin → return 999999 messages   │
└─────────────────────────────────────────┘
```

---

## 🎯 Flux 4 : Détection automatique upgrade

```
┌─────────────────────────────────────────┐
│ Prestataire écrit "Je veux le plan Pro" │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ handleUpgrade() → analyserIntention()   │
│ Envoie à l'IA :                         │
│ - Historique conversation               │
│ - Message actuel                        │
│ - Plan actuel                           │
│ - Type de demande                       │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ IA répond en JSON :                     │
│ {"action": "CHOISIR_PLAN",              │
│  "plan_choisi": "pro"}                  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ traiterChoixPlan() :                    │
│ - Sauvegarder plan_demande dans BDD    │
│ - Présenter les avantages détaillés    │
│ - Demander paiement                     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ Prestataire envoie capture d'écran      │
│ (numMedia > 0)                          │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ traiterPreuvePaiement() :               │
│ - Enregistrer dans demande              │
│ - Notifier admin avec détails complets  │
│ - Confirmer au prestataire              │
└─────────────────────────────────────────┘
```

---

## 📱 Exemples de messages

### Suspension avec bypass temporaire

```
⚠️ Votre abonnement Riserv a expiré.

Votre accès est suspendu. Vos clients ne peuvent plus effectuer de nouvelles réservations.

📦 *Renouvelez votre abonnement :*

1️⃣ *Starter* - Rs 990/mois
2️⃣ *Pro* - Rs 1,490/mois
3️⃣ *Business* - Rs 2,490/mois

💳 *Comment payer ?*
Effectuez un paiement mobile et envoyez-nous la capture d'écran ici avec le nom de votre plan.

Votre compte sera réactivé immédiatement après validation.

⚠️ *IMPORTANT :* Vous disposez de 7 messages maximum dans cette conversation pour finaliser. Au-delà, vous devrez contacter le support par email.

Questions ? support@riserv.mu
```

### Notification prestataire - Client bloqué après 18h

```
⚠️ *Opportunité manquée*

Un client a tenté de réserver 3 fois après 18h00, mais votre plan Starter ne permet pas les réservations tardives.

💡 *Passez au plan PRO pour ne plus perdre de clients :*

📦 *Plan PRO* - Rs 1,490/mois

✅ Toutes les fonctionnalités Starter +
🌟 Réservations 24h/24 (après 18h)
🎤 Transcription notes vocales
⚡ 100 messages IA/heure
🔥 Support prioritaire

💳 Intéressé ? Répondez "OUI" et je vous guide pour l'upgrade.
```

### Plan insuffisant avec proposition active

```
⚠️ Les réservations après 18h00 est disponible uniquement avec le plan PRO.

📦 *Plan PRO* - Rs 1,490/mois

✅ Toutes les fonctionnalités Starter +
🌟 Réservations 24h/24 (après 18h)
🎤 Transcription notes vocales
⚡ 100 messages IA/heure
🔥 Support prioritaire

💡 Souhaitez-vous passer au plan PRO ?

Répondez "OUI" pour changer de plan, ou écrivez-nous : support@riserv.mu
```
