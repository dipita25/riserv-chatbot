# Restriction Horaire Plan Starter - Comportement Complet

## 🕕 Vue d'ensemble

**Les prestataires en plan Starter sont désormais complètement bloqués après 18h00.**

---

## 🔴 **RESTRICTION GLOBALE APRÈS 18H00**

### Prestataire Starter écrit après 18h

**TOUT est bloqué** :
- ❌ Consulter agenda
- ❌ Annuler RDV
- ❌ Déplacer RDV
- ❌ Gérer services
- ❌ Bloquer créneaux
- ❌ Demander aide
- ❌ Notes vocales
- ❌ Toute autre action

**Message reçu automatiquement** :

```
🕕 Votre plan Starter est disponible jusqu'à 18h00.

💡 *Vous voulez accéder 24h/24 ? Passez au plan PRO !*

📦 *Plan PRO* - Rs 1,490/mois

✅ Toutes les fonctionnalités Starter +
🌟 Accès 24h/24 (gérez votre activité à toute heure)
🌟 Réservations clients après 18h00
🎤 Transcription notes vocales
⚡ 100 messages IA/heure
🔥 Support prioritaire

💳 Vous voulez upgrader ? Répondez "OUI" et je vous guide.

Questions ? support@riserv.mu
```

---

## ✅ **FLUX D'UPGRADE APRÈS 18H**

### Scénario complet

```
18h15 - Prestataire Starter écrit "agenda aujourd'hui"
  ↓
Router détecte :
  - prestataire.plan = 'starter'
  - heure = 18
  - heure >= 18 → TRUE
  ↓
Router vérifie :
  - demandeUpgrade en cours ? NON
  - body contient "oui" ? NON
  - numMedia > 0 ? NON
  ↓
→ handlePrestataire normalement
  ↓
verifierAcces(prestataire, 'agenda')
  ↓
Détecte : plan = starter + heure >= 18
  ↓
Return {
  autorise: false,
  raison: 'hors_horaire_starter',
  message: getMessageHorsHorairePrestataire()
}
  ↓
Envoie message de blocage + proposition upgrade
  ↓
⏸️ FIN (pas de token consommé, message statique)
```

---

### Prestataire répond "OUI"

```
18h16 - Prestataire répond "OUI"
  ↓
Router détecte :
  - prestataire.plan = 'starter'
  - heure = 18 → >= 18
  - body.includes('oui') → TRUE ✅
  ↓
→ handleUpgrade(from, body, numMedia, prestataire)
  ↓
Créer demande_upgrade :
  - type: 'upgrade'
  - messages_restants: 7
  ↓
analyserIntentionUpgrade() avec IA
  ↓
Détecte : CHOISIR_PLAN ou MESSAGE_GENERAL
  ↓
"Je suis là pour vous aider à changer de plan.
Quel plan souhaitez-vous ?
1️⃣ Starter - Rs 990/mois
2️⃣ Pro - Rs 1,490/mois (recommandé)
3️⃣ Business - Rs 2,490/mois
Tapez 1, 2 ou 3"
  ↓
Compteur : 6 messages restants
```

---

### Prestataire choisit le plan

```
18h17 - Prestataire répond "2" ou "Pro"
  ↓
→ handleUpgrade (demande existe)
  ↓
analyserIntentionUpgrade()
  ↓
Détecte : CHOISIR_PLAN → "pro"
  ↓
traiterChoixPlan()
  ↓
Sauvegarder plan_demande = 'pro'
  ↓
"✅ Excellent choix ! Plan PRO sélectionné.

💰 Prix : Rs 1,490/mois

🎁 Inclus :
✅ Toutes les fonctionnalités Starter +
🌟 Accès 24h/24
🌟 Réservations clients après 18h00
🎤 Transcription notes vocales
⚡ 100 messages IA/heure
🔥 Support prioritaire

💳 Étape suivante :
Effectuez votre paiement mobile de Rs 1,490 et envoyez-moi la capture d'écran.

Votre compte sera upgradé immédiatement après validation."
  ↓
Compteur : 5 messages restants
```

---

### Prestataire envoie preuve de paiement

```
18h18 - Prestataire envoie image (capture d'écran)
  ↓
Router détecte : numMedia > 0 → TRUE
  ↓
→ handleUpgrade
  ↓
traiterPreuvePaiement()
  ↓
Enregistrer preuve_paiement_url
  ↓
Notification ADMIN immédiate :
"💰 Nouvelle demande d'upgrade/renouvellement

Prestataire : [nom]
Téléphone : [téléphone]
Plan actuel : starter
Plan demandé : pro
Type : upgrade

📸 Preuve de paiement reçue

Pour valider : '[nom prestataire] a payé'"
  ↓
Message au prestataire :
"✅ Parfait ! J'ai bien reçu votre preuve de paiement.

📋 Récapitulatif :
Plan : PRO
Montant : Rs 1,490/mois

⏳ Votre demande est en cours de validation.
Vous recevrez une confirmation dans les prochaines minutes.

Merci de votre confiance ! 🙏"
  ↓
Compteur : 4 messages restants
```

---

### Admin valide

```
Admin écrit : "Salon Beauty a payé"
  ↓
interpreterCommandeAdmin() détecte : PAIEMENT_VALIDER
  ↓
validerPaiementAdmin()
  ↓
Détecte demande_upgrade en cours
  ↓
Met à jour :
  - plan: 'starter' → 'pro'
  - statut_abonnement: 'actif'
  - date_expiration: +1 mois
  - essai_gratuit: false
  ↓
validerDemandeUpgrade(demande.id, 'admin')
  ↓
Notification prestataire :
"✅ Votre paiement a bien été reçu et votre abonnement Riserv est actif.

Abonnement valide jusqu'au : [date]

🎉 Votre plan a été upgradé vers *PRO* !

Merci pour votre confiance !"
  ↓
✅ UPGRADE TERMINÉ
Prestataire peut maintenant accéder 24h/24
```

---

## 💰 **Consommation de tokens**

### Message de blocage initial (18h15)
- ❌ **Pas de token** consommé
- Message statique dans `verifierAcces.js`

### Après "OUI" → handleUpgrade
- ✅ **Tokens consommés** pour :
  - `analyserIntentionUpgrade()` → Appel Claude API
  - Chaque réponse de l'IA
  - Tracking dans `token_metrics`

### Compteur de 7 messages
- Inclut TOUS les messages dans la session d'upgrade
- Après 7 messages → Blocage + redirection email support

---

## 🎯 **Tableau récapitulatif**

| Action | Plan Starter avant 18h | Plan Starter après 18h | Plan Pro/Business après 18h |
|--------|------------------------|------------------------|----------------------------|
| **Consulter agenda** | ✅ | ❌ BLOQUÉ | ✅ |
| **Gérer RDV** | ✅ | ❌ BLOQUÉ | ✅ |
| **Gérer services** | ✅ | ❌ BLOQUÉ | ✅ |
| **Bloquer créneaux** | ✅ | ❌ BLOQUÉ | ✅ |
| **Notes vocales** | ❌ | ❌ BLOQUÉ | ✅ |
| **Répond "OUI" à upgrade** | N/A | ✅ → handleUpgrade | N/A |
| **Session upgrade** | N/A | ✅ 7 msg max | N/A |
| **Clients réservent** | ✅ | ❌ BLOQUÉ | ✅ |

---

## 🔐 **Exceptions**

### Admin (ADMIN_PHONE)
- ✅ Accès 24h/24 même en plan Starter
- ✅ Bypass total dans `verifierAcces`
- ✅ Pas de compteur de messages
- ✅ Peut tester toutes les fonctionnalités

---

## 📋 **Impact sur les clients**

### Les clients peuvent-ils réserver après 18h chez un prestataire Starter ?

**NON** - Double blocage :

1. **Blocage côté client** (`clientHandler.js` ligne 124-131)
2. **Blocage côté prestataire** (nouveau - `verifierAcces.js` ligne 234-242)

**Résultat** : Aucune réservation possible après 18h avec plan Starter.

---

## ✅ **Avantages de cette restriction**

1. **Cohérence totale** : Plan Starter = 6h00-18h00 pour TOUT
2. **Incitation forte** : Prestataires motivés à upgrader
3. **Message clair** : Proposition d'upgrade immédiate
4. **Pas de confusion** : Restriction simple et compréhensible

---

## 🚀 **Résumé des modifications apportées**

### 1. **verifierAcces.js**
- Ajout vérification horaire GLOBALE (ligne 234-242)
- Nouvelle fonction `getMessageHorsHorairePrestataire()` avec avantages plan Pro

### 2. **router.js**
- Détection prestataire Starter après 18h avec intention upgrade (ligne 54-66)
- Redirection automatique vers `handleUpgrade`

### 3. **prestataireHandler.js**
- Utilisation directe de `acces.message` (simplifié)
- Bypass admin maintenu

---

**Le système est maintenant complètement cohérent : Plan Starter = 6h00-18h00 pour TOUS !** 🎯
