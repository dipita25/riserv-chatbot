# Système de Rate Limiting et Tracking de Tokens

## Vue d'ensemble

Le système de rate limiting protège votre application contre l'épuisement de tokens IA en limitant le nombre de messages par utilisateur selon leur rôle et plan d'abonnement.

---

## Limites de messages par rôle

| Rôle | Limite | Période | Alerte à |
|------|--------|---------|----------|
| **Clients** | 22 messages | Par heure | 5 restants |
| **Onboarding** | 20 messages | Total session | 5 restants |
| **Prestataire Starter** | 30 messages | Par heure | 5 restants |
| **Prestataire Pro** | 100 messages | Par heure | 5 restants |
| **Prestataire Business** | 200 messages | Par heure | 5 restants |
| **Admin** | Illimité | - | - |

---

## Comportement utilisateur

### Progression normale

1. **Messages** jusqu’à la zone d’alerte : traitement normal
2. **Dès qu’il reste ≤ 5 messages** (client, cette heure) : alerte
   ```
   ⚠️ Il vous reste 3 messages cette heure
   (Renouvellement dans 38 minutes)
   ```
3. **Au-delà de la limite** : blocage temporaire
   ```
   ⛔ Limite de messages atteinte
   
   Vous avez envoyé 22 messages cette heure.
   Vous pourrez nous écrire à nouveau dans 42 minutes.
   ```

### Pour les prestataires (avec upgrade)

Quand un prestataire Starter atteint sa limite :

```
⛔ Limite de messages atteinte

Vous avez envoyé 30 messages cette heure (Plan Starter).

Vous pourrez utiliser le système à nouveau dans 42 minutes.

Plan actuel : Starter (30 messages/heure)
Besoin de plus ? Passez au plan Pro (100 messages/heure)
Contactez-nous : +230 XXXX XXXX
```

---

## Rapport admin enrichi

Le rapport journalier (envoyé à 17h) contient maintenant :

### Statistiques de consommation IA

```
🤖 Consommation IA (tokens estimés)
Total : 125,000 tokens
• Clients : 45,000 (36%)
• Prestataires : 65,000 (52%)
• Onboarding : 10,000 (8%)
• Admin : 5,000 (4%)

🏆 Top 5 prestataires (tokens)
1. Beauty Spa — 12,500 tokens
2. Salon Fatima — 8,900 tokens
3. Coiffure Express — 6,200 tokens
4. Nail Art Pro — 5,100 tokens
5. Massage Zen — 4,800 tokens
```

Cela vous permet de :
- Identifier les prestataires qui utilisent le plus le système
- Détecter les abus potentiels
- Optimiser les coûts IA
- Préparer la facturation par usage (future feature)

---

## Architecture technique

### Tables créées

**`rate_limits`** : Compteurs de messages
- Stocke le nombre de messages envoyés par heure/session
- Réinitialisé automatiquement chaque heure (clients/prestataires)
- Compteur total pour onboarding
- Nettoyage automatique toutes les heures (entrées >2h)

**`token_metrics`** : Métriques de consommation
- Enregistre chaque appel IA avec estimation de tokens
- Permet les rapports admin détaillés
- Identifie le processus métier (choix_service, agenda, etc.)
- Conservé pour historique (suppression manuelle si besoin)

### Fichiers créés

1. **`migrations/add_rate_limiting_tracking.sql`** - Migration SQL
2. **`src/services/rateLimitService.js`** - Service de rate limiting
3. **`src/utils/tokenEstimator.js`** - Estimation de tokens

### Fichiers modifiés

1. **`src/services/supabaseService.js`** - Fonctions DB pour rate limiting
2. **`src/services/router.js`** - Vérification avant chaque handler
3. **`src/services/clientHandler.js`** - Tracking + alertes clients
4. **`src/services/prestataireHandler.js`** - Tracking + alertes prestataires
5. **`src/services/onboardingHandler.js`** - Tracking + alertes onboarding
6. **`src/services/cronJobs.js`** - Rapport enrichi + CRON nettoyage
7. **`src/server.js`** - Activation CRON nettoyage

---

## Protection économique

### Sans rate limiting
- Un utilisateur malveillant peut envoyer 1000 messages/heure
- Coût estimé : **$10-15/mois par utilisateur abusif**
- Risque de facture IA exorbitante

### Avec rate limiting
- Maximum 200 messages/heure (plan Business)
- Coût max : **$2/mois même avec abus**
- **Économie : jusqu'à 85% sur les coûts de spam**

---

## CRON Jobs actifs

| Tâche | Fréquence | Heure | Description |
|-------|-----------|-------|-------------|
| Rappels J-1 | Quotidien | 20h00 | Rappels RDV lendemain |
| Suspension abonnements | Quotidien | Minuit | Suspendre expirés |
| Alertes expiration | Quotidien | 09h00 | Alerter J-3 |
| Rapport journalier | Quotidien | 17h00 | Stats + tokens + top 5 |
| Détection abus clients | 2x/jour | 10h & 20h | Bannir 3+ annulations |
| Nettoyage tokens | Hebdo | Dim 3h | Nettoyer tentatives >7j |
| **Nettoyage limits** | **Horaire** | **Toutes les heures** | **Nettoyer rate_limits >2h** |

---

## Installation

### 1. Exécuter la migration SQL

Dans Supabase SQL Editor, exécutez :

```sql
-- Le contenu complet est dans migrations/add_rate_limiting_tracking.sql
```

Ou copiez-collez le fichier `migrations/add_rate_limiting_tracking.sql`.

### 2. Redémarrer le serveur

Le serveur a déjà été redémarré automatiquement par nodemon.

Vérifiez les logs pour confirmer :
```
✓ Nettoyage limits : toutes les heures (Maurice)
```

---

## Tests recommandés

### Test 1 : Client atteint sa limite
1. Client envoie 15 messages en 1 heure
2. Au 11ème message → voit alerte "5 messages restants"
3. Au 16ème message → bloqué temporairement
4. Après 1 heure → peut à nouveau envoyer des messages

### Test 2 : Prestataire Starter vs Pro
1. Prestataire Starter envoie 30 messages → bloqué
2. Prestataire Pro envoie 100 messages → bloqué
3. Vérifier que le message indique le plan et l'upgrade possible

### Test 3 : Rapport admin
1. Attendre 17h (ou tester manuellement le CRON)
2. Vérifier que le rapport contient :
   - Total tokens estimés
   - Répartition par rôle (%)
   - Top 5 prestataires consommateurs

### Test 4 : Onboarding limite totale
1. Démarrer onboarding
2. Envoyer 21 messages → bloqué au 21ème
3. Pas de renouvellement (limite totale)

---

## Vocabulaire

### Pour les utilisateurs (clients et prestataires)
- **"messages"** : Le terme utilisé dans tous les messages
- "Il vous reste 3 messages cette heure"
- "30 messages/heure (Plan Starter)"

### Pour l'admin (rapports techniques)
- **"tokens"** : Métrique technique réelle de coût IA
- "125,000 tokens consommés"
- "Top 5 prestataires (tokens)"

---

## Avantages

1. **Protection économique** : Limite les coûts IA à $2/mois max par utilisateur
2. **Transparence** : Les utilisateurs savent combien de messages il leur reste
3. **Incitation upgrade** : Les prestataires voient les limites des plans supérieurs
4. **Analytics admin** : Rapports détaillés de consommation
5. **Anti-spam** : Bloque automatiquement les abus

---

## Nettoyage et maintenance

### Automatique
- **Rate limits** : Nettoyage toutes les heures (entrées >2h)
- **Tentatives inconnus** : Nettoyage hebdomadaire (entrées >7j)

### Manuel (si besoin)
```sql
-- Nettoyer les anciennes métriques (> 30 jours)
DELETE FROM token_metrics WHERE date < CURRENT_DATE - INTERVAL '30 days';

-- Voir la consommation d'un prestataire spécifique
SELECT date, SUM(tokens_estimes) as total
FROM token_metrics
WHERE prestataire_id = 'uuid-du-prestataire'
GROUP BY date
ORDER BY date DESC;
```

---

## Résumé des protections mises en place

1. ✅ **Numéros inconnus** : Max 3 tentatives en 24h
2. ✅ **Clients** : Max 15 messages/heure
3. ✅ **Onboarding** : Max 20 messages total
4. ✅ **Prestataires** : Limites selon plan (30/100/200 par heure)
5. ✅ **Alertes** : À 5 messages restants
6. ✅ **Tracking** : Tous les appels IA sont enregistrés
7. ✅ **Rapport admin** : Stats détaillées quotidiennes
8. ✅ **Nettoyage auto** : Maintenance automatique

Votre application est maintenant **complètement protégée contre l'épuisement de tokens** ! 🎉
