# Résumé des Modifications - Système d'Upgrade et Admin

## 🎯 Objectifs atteints

### ✅ 1. Bypass temporaire pour prestataires suspendus
- **7 messages maximum** pour gérer le renouvellement
- Compteur affiché dans les notifications
- Redirection automatique vers `handleUpgrade`
- Au-delà de 7 messages → blocage + contact support par email

### ✅ 2. Admin sans aucune restriction
- Bypass total dans `verifierAcces`
- Pas de rate limit (illimité)
- Accès à toutes les fonctionnalités prestataire/client
- Peut discuter librement avec l'IA hors contexte

### ✅ 3. Remplacement numéro téléphone par email support
- Tous les messages `+230 XXXX XXXX` → `support@riserv.mu`
- Variable `SUPPORT_EMAIL` ajoutée dans `.env`

### ✅ 4. Période ambassadeurs réduite
- **6 mois → 3 mois** de gratuité

### ✅ 5. Proposition active d'upgrade
- Messages de plan insuffisant proposent directement les avantages
- Clients reçoivent les détails et peuvent dire "OUI"

### ✅ 6. Notification prestataire - Client bloqué après 18h
- Après 3 tentatives, le prestataire est notifié
- Proposition d'upgrade vers plan Pro
- Explication des opportunités perdues

---

## 📋 Scénarios résolus

### Scénario 1 : Prestataire Starter répond "OUI" à proposition upgrade notes vocales

**AVANT** :
```
Prestataire envoie note vocale
  ↓
"Notes vocales pas disponibles. Contactez-nous pour upgrader"
  ↓
Prestataire répond "OUI"
  ↓
Message mal interprété par l'IA ❌
```

**MAINTENANT** :
```
Prestataire envoie note vocale
  ↓
"Notes vocales pas disponibles. Plan PRO - Rs 1,490/mois [détails]. Souhaitez-vous passer au plan PRO ? Répondez OUI"
  ↓
Prestataire répond "OUI"
  ↓
Router détecte intention → handleUpgrade ✅
  ↓
IA guide l'upgrade → demande preuve paiement
  ↓
Admin notifié → valide → compte upgradé
```

---

### Scénario 2 : Prestataire suspendu veut renouveler

**AVANT** :
```
Prestataire suspendu écrit
  ↓
Message de suspension "Renouvelez votre abonnement"
  ↓
Prestataire répond avec plan choisi
  ↓
handlePrestataire → verifierAcces → REFUSÉ ❌
  ↓
Renvoie message de suspension (boucle infinie)
```

**MAINTENANT** :
```
Prestataire suspendu écrit
  ↓
Router détecte statut suspendu
  ↓
SI (demande en cours OU "oui" OU "plan" OU image) 
  ↓
→ handleUpgrade avec compteur 7 messages ✅
  ↓
IA guide le processus
  ↓
Preuve de paiement → Notification admin
  ↓
Admin valide → Compte réactivé + plan mis à jour
```

---

### Scénario 3 : Client veut réserver après 18h (prestataire Starter)

**AVANT** :
```
Client écrit après 18h15
  ↓
"Service disponible jusqu'à 18h00. Revenez demain"
  ↓
Prestataire n'est PAS notifié ❌
  ↓
Perte de client silencieuse
```

**MAINTENANT** :
```
Client écrit après 18h15
  ↓
"Service disponible jusqu'à 18h00. Revenez demain"
  ↓
Système comptabilise (table tentatives_client_apres_18h)
  ↓
À la 3ème tentative → Notification au prestataire ✅
  ↓
"Un client a tenté de réserver 3 fois après 18h. 
Passez au plan PRO pour recevoir des réservations 24h/24 :
[détails plan Pro]
Répondez OUI pour upgrader"
  ↓
Prestataire répond "OUI"
  ↓
→ handleUpgrade guide l'upgrade
```

---

### Scénario 4 : Admin teste les fonctionnalités

**AVANT** :
```
Admin écrit n'importe quoi
  ↓
→ handleAdmin uniquement
  ↓
Pas d'accès aux fonctionnalités prestataire/client ❌
```

**MAINTENANT** :
```
Admin écrit une commande admin (stats, liste, etc.)
  ↓
→ handleAdmin

Admin écrit autre chose (test, conversation)
  ↓
→ Bypass total dans verifierAcces ✅
  ↓
Peut tester toutes les fonctionnalités prestataire/client
  ↓
Peut discuter librement avec l'IA
```

---

## 🔧 Fichiers modifiés

### 1. **router.js**
- Import `handleUpgrade` et `getDemandeUpgradeEnCours`
- Détection admin au début avec logique commande vs test
- Détection prestataire suspendu → redirect vers `handleUpgrade`
- Bypass rate limit pour admin
- Message libre pour admin non enregistré

### 2. **upgradeHandler.js** (NOUVEAU)
- Gestion complète des demandes d'upgrade
- Compteur 7 messages avec alerte
- Détection d'intention IA
- Présentation détaillée des plans
- Traitement preuves de paiement
- Notification prestataire pour clients bloqués après 18h

### 3. **verifierAcces.js**
- Bypass TOTAL pour admin en première ligne
- Messages de plan insuffisant avec avantages détaillés
- Messages d'expiration avec 7 messages disponibles

### 4. **supabaseService.js**
- Nouvelles fonctions :
  - `getDemandeUpgradeEnCours`
  - `creerDemandeUpgrade`
  - `incrementerMessagesUpgrade`
  - `validerDemandeUpgrade`
  - `supprimerDemandeUpgrade`
  - `getConversationUpgrade`
  - `ajouterMessageUpgrade`

### 5. **adminHandler.js**
- Période ambassadeurs : 6 mois → 3 mois
- Email support au lieu de téléphone
- Validation paiement avec gestion upgrade automatique
- Mode conversation libre pour admin

### 6. **clientHandler.js**
- Import `notifierPrestataireClientBloque18h`
- Appel notification quand client bloqué après 18h
- Email support pour bannissements

### 7. **prestataireHandler.js**
- Bypass admin en début de fonction
- Messages avec 7 messages disponibles
- Email support

### 8. **cronJobs.js**
- Messages de suspension avec 7 messages disponibles
- Alertes J-3 avec avertissement anticipé
- Email support pour bannissements

### 9. **rateLimitService.js**
- Email support pour tous les messages

### 10. **webhook.js**
- Bypass admin pour notes vocales

### 11. **.env** et **.env.example**
- Variable `SUPPORT_EMAIL` ajoutée

---

## 📊 Tables SQL (migrations/add_demandes_upgrade.sql)

### demandes_upgrade
```sql
- id (UUID, PK)
- prestataire_id (UUID, FK → prestataires)
- plan_actuel (VARCHAR)
- plan_demande (VARCHAR)
- type (VARCHAR: 'upgrade', 'renouvellement')
- statut (VARCHAR: 'en_attente', 'valide', 'refuse')
- messages_utilises (INTEGER, default: 0)
- messages_restants (INTEGER, default: 7)
- preuve_paiement_url (TEXT)
- timestamps + validation
```

### conversations_upgrade
```sql
- id (UUID, PK)
- demande_id (UUID, FK → demandes_upgrade)
- role (VARCHAR: 'user', 'assistant')
- contenu (TEXT)
- created_at (TIMESTAMP)
```

### tentatives_client_apres_18h
```sql
- id (UUID, PK)
- prestataire_id (UUID, FK → prestataires)
- client_telephone (VARCHAR)
- nombre_tentatives (INTEGER, default: 1)
- derniere_tentative (TIMESTAMP)
- notif_prestataire_envoyee (BOOLEAN, default: false)
- created_at (TIMESTAMP)
```

---

## 🧪 Tests à effectuer

### Test 1 : Prestataire suspendu renouvelle

1. Suspendre un prestataire de test
2. Lui écrire en tant que ce prestataire
3. Vérifier message de suspension avec "7 messages max"
4. Répondre "Plan Pro"
5. Vérifier présentation des avantages
6. Envoyer image (capture test)
7. Vérifier notification admin
8. Admin valide : "[nom] a payé"
9. Vérifier réactivation + changement de plan

### Test 2 : Client après 18h (prestataire Starter)

1. Configurer l'heure système après 18h
2. Écrire en tant que client vers prestataire Starter
3. Vérifier message "Service jusqu'à 18h"
4. Répéter 3 fois
5. Vérifier notification prestataire avec proposition upgrade

### Test 3 : Admin sans restriction

1. Écrire en tant qu'admin : "stats"
2. Vérifier commandes admin fonctionnent
3. Écrire en tant qu'admin (compte prestataire test) : "agenda aujourd'hui"
4. Vérifier accès fonctionnalités prestataire
5. Vérifier pas de rate limit

### Test 4 : Limite 7 messages upgrade

1. Créer demande upgrade
2. Envoyer 7 messages sans valider
3. Vérifier alertes progressives (à 3 messages restants)
4. Au 8ème message → blocage + redirection email

---

## 🚀 Déploiement

### Ordre des opérations

1. **Exécuter la migration SQL** dans Supabase
2. **Ajouter `SUPPORT_EMAIL`** dans les variables d'environnement
3. **Redémarrer le serveur** pour charger les nouvelles variables
4. **Tester les scénarios** ci-dessus

### Variables d'environnement requises

```env
SUPPORT_EMAIL=support@riserv.mu
ADMIN_PHONE=+23055040203
```

---

## 📝 Notes de maintenance

### Nettoyage automatique

Les demandes d'upgrade devraient être nettoyées périodiquement :

```sql
-- Supprimer les demandes vieilles de plus de 7 jours
DELETE FROM demandes_upgrade 
WHERE created_at < NOW() - INTERVAL '7 days' 
  AND statut IN ('valide', 'refuse');
```

### Monitoring

Surveiller les métriques suivantes :

- Nombre de demandes d'upgrade par jour
- Taux de conversion (demandes → paiements validés)
- Nombre de prestataires atteignant les 7 messages
- Tentatives clients après 18h par prestataire Starter

---

## 🔍 Logs importants

Les logs suivants ont été ajoutés :

```
[ROUTER] Prestataire suspendu → Mode upgrade/renouvellement
[UPGRADE] Traitement demande pour [nom]
[ACCES] Admin détecté → Bypass total
```

Surveillez ces logs pour détecter les problèmes.
