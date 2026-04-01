# 🛡️ Système de Sécurité et Modération Riserv

## Vue d'ensemble

Ce système implémente deux mécanismes de protection :
1. **Blocage administrateur** : L'admin peut bloquer l'accès d'un prestataire
2. **Bannissement automatique** : Les clients abusant des annulations sont bannis automatiquement

---

## 1️⃣ Gestion Admin des Prestataires

### Bloquer un prestataire

L'admin peut bloquer complètement l'accès d'un prestataire à la plateforme.

**Commande WhatsApp :**
```
bloquer [nom du prestataire]
```

**Effets du blocage :**
- Le prestataire ne peut plus se connecter
- Son entreprise est marquée comme "désactivée"
- Les clients ne peuvent plus prendre de rendez-vous avec ce prestataire
- Un message est envoyé au prestataire pour l'informer
- Le statut passe à `bloque` dans la base de données

**Exemple :**
```
bloquer Beauty House
```

---

### Débloquer un prestataire

**Commande WhatsApp :**
```
débloquer [nom du prestataire]
```

**Effets du déblocage :**
- Le prestataire récupère son accès complet
- Son entreprise redevient active
- Les clients peuvent à nouveau réserver
- Un message de confirmation est envoyé au prestataire
- Le statut repasse à `actif` dans la base de données

**Exemple :**
```
débloquer Beauty House
```

---

## 2️⃣ Système Anti-Abus Client

### Règle de bannissement

Un client est **automatiquement banni** s'il effectue **3 annulations ou plus en 10 jours**.

### Notifications progressives

1. **1ère annulation** : Confirmation normale
2. **2ème annulation** (en 10 jours) : ⚠️ Avertissement
   ```
   ⚠️ C'est votre 2ème annulation en 10 jours.
   Une 3ème annulation entraînera la suspension de votre accès.
   ```

3. **3ème annulation** (en 10 jours) : ⛔ Bannissement immédiat
   ```
   ⛔ Votre accès à la plateforme a été suspendu
   en raison de 3 annulations répétées en moins de 10 jours.
   ```

### Détection automatique

Un **CRON job** tourne **2 fois par jour** (10h et 20h, heure Maurice) pour :
- Analyser toutes les annulations des 10 derniers jours
- Identifier les clients ayant ≥3 annulations
- Les bannir automatiquement
- Notifier l'admin de chaque bannissement

### Client banni : comportement

Quand un client banni tente d'utiliser la plateforme :
```
⛔ Votre accès à la plateforme a été suspendu
en raison d'annulations répétées.

Si vous pensez qu'il s'agit d'une erreur,
contactez le support : +230 XXXX XXXX
```

### Débannir un client

L'admin peut débannir manuellement un client si nécessaire.

**Commande WhatsApp :**
```
débannir [numéro de téléphone]
```

**Exemple :**
```
débannir +23055555555
```

Le client reçoit un message :
```
✅ Votre accès à la plateforme Riserv a été rétabli.
Vous pouvez à nouveau effectuer des réservations.
```

---

## 🗄️ Base de données

### Nouvelles colonnes ajoutées

**Table `clients` :**
- `banni` (BOOLEAN) : Indique si le client est banni
- `raison_bannissement` (TEXT) : Raison du bannissement
- `date_bannissement` (TIMESTAMP) : Date du bannissement

**Table `prestataires` :**
- `date_blocage` (TIMESTAMP) : Date du blocage admin
- Statut `bloque` ajouté aux valeurs possibles de `statut_abonnement`

### Migration SQL

Pour ajouter ces colonnes à votre base de données Supabase, exécutez :

```sql
-- Dans l'éditeur SQL de Supabase
\i migrations/add_bannissement_system.sql
```

Ou copiez-collez le contenu du fichier `migrations/add_bannissement_system.sql`.

---

## 🔄 CRON Jobs

| Tâche | Fréquence | Heure (Maurice) | Description |
|-------|-----------|-----------------|-------------|
| Rappels J-1 | Quotidien | 20h00 | Rappels de RDV pour le lendemain |
| Suspension abonnements | Quotidien | Minuit | Suspendre les abonnements expirés |
| Alertes expiration | Quotidien | 09h00 | Alerter les prestataires J-3 |
| Rapport journalier | Quotidien | 17h00 | Envoyer les stats à l'admin |
| **Détection abus clients** | **2x/jour** | **10h et 20h** | **Bannir les clients abusifs** |

---

## 📱 Commandes Admin (résumé)

### Prestataires
- `bloquer [nom]` - Bloquer l'accès d'un prestataire
- `débloquer [nom]` - Débloquer un prestataire
- `suspendre [nom]` - Suspendre un compte
- `réactiver [nom]` - Réactiver un compte
- `info [nom]` - Afficher les détails d'un prestataire
- `liste prestataires` - Lister tous les prestataires
- `ambassadeur [nom]` - Marquer comme ambassadeur

### Clients
- `débannir [téléphone]` - Débannir un client

### Paiements
- `[nom] a payé` - Valider 1 mois
- `[nom] a payé 3 mois` - Valider plusieurs mois

### Stats
- `stats` - Vue d'ensemble de la plateforme

---

## 🔐 Sécurité

### Configuration

Le numéro admin est défini dans `.env` :
```env
ADMIN_PHONE=+23055040203
```

**Important :** 
- Ce numéro a un accès **total et illimité**
- Il n'est soumis à **aucune restriction** de plan ou d'abonnement
- Toutes les commandes admin sont disponibles uniquement pour ce numéro

---

## 💰 Économie de Tokens (Anti-Spam)

### Problème résolu

Sans protection, un numéro inconnu qui envoie des messages ambigus peut épuiser vos tokens IA en faisant appeler l'API à répétition.

### Solution implémentée

**Limite de tentatives pour numéros inconnus :**
- **1ère tentative** : Message accueillant avec choix
- **2ème tentative** : Message plus direct avec compteur
- **3ème tentative** : Message final + **blocage 24h**

**Après 3 tentatives :**
```
Nous n'avons pas pu identifier votre demande après plusieurs tentatives.
Veuillez réessayer dans 24 heures ou contactez-nous directement : +230 XXXX XXXX
```

**Réinitialisation automatique :**
- Après 24h, le compteur est remis à zéro
- Si l'intention est clairement détectée (professionnel ou client), le compteur est supprimé

**Table créée :**
- `tentatives_inconnus` : stocke le compteur par numéro
- Nettoyage recommandé : supprimer les entrées >7 jours

**Économie estimée :**
- Sans protection : potentiellement **infini** (spam possible)
- Avec protection : **maximum 3 appels IA par numéro inconnu en 24h**

---

## 🧪 Tests recommandés

### Tester le blocage prestataire
1. Admin : `bloquer [nom prestataire]`
2. Client essaie de réserver → Message "entreprise n'accepte plus de réservations"
3. Admin : `débloquer [nom prestataire]`
4. Client peut à nouveau réserver

### Tester le bannissement client
1. Client annule 3 réservations en quelques jours
2. Au 3ème `ANNULER`, le client est banni automatiquement
3. Client essaie de réserver → Message "accès suspendu"
4. Admin : `débannir [téléphone]`
5. Client peut à nouveau réserver

---

## 📊 Notifications admin

L'admin reçoit automatiquement :
- Un rapport journalier à 17h (stats du jour)
- Une notification à chaque bannissement de client
- Les statistiques incluant le nombre d'annulations

---

## 🚀 Déploiement

1. **Exécuter la migration SQL** dans Supabase
2. **Redémarrer le serveur** pour activer les nouveaux CRON jobs
3. **Vérifier les logs** pour confirmer le bon fonctionnement

```bash
npm start
```

Vous devriez voir :
```
✓ Cron jobs démarrés :
  - Détection abus   : 2x/jour à 10h et 20h (Maurice)
```
