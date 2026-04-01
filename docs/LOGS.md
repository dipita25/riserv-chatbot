# Système de Logging - Riserv

## Vue d'ensemble

Le système de logging de Riserv suit chaque étape du traitement des messages, de la réception du webhook jusqu'à l'envoi de la réponse finale. Chaque opération reçoit un identifiant unique pour faciliter le traçage.

## Structure des Logs

### Format des Identifiants

Tous les logs utilisent des identifiants courts générés aléatoirement :

```
[MODULE ID] Description du log
```

Exemples :
- `[WEBHOOK abc123]` : Traitement d'une requête webhook
- `[ROUTER def456]` : Routage d'un message
- `[CLIENT ghi789]` : Traitement côté client
- `[PRESTATAIRE jkl012]` : Traitement côté prestataire
- `[IA mno345]` : Appel à l'Intelligence Artificielle
- `[SEND pqr678]` : Envoi de message WhatsApp

### Symboles de Statut

- `✅` : Succès
- `⛔` : Accès refusé / Bloqué
- `⚠️` : Avertissement
- `❌` : Erreur
- `🚨` : Alerte sécurité critique
- `→` : Direction / Action suivante

## Modules et Tags

### 1. WEBHOOK - Réception des Messages

**Tag** : `[WEBHOOK {id}]`

**Événements loggés** :
- Réception de requête (IP, User-Agent)
- Vérification rate limit
- Détection du provider (Gupshup/Twilio/Meta)
- Vérification de sécurité (token, signature, IP)
- Parsing du payload
- Routage vers le handler approprié

**Exemple** :

```
[WEBHOOK a1b2c3d4] ========== NOUVELLE REQUÊTE ==========
[WEBHOOK a1b2c3d4] IP: 203.192.X.X
[WEBHOOK a1b2c3d4] User-Agent: Gupshup/1.0
[WEBHOOK a1b2c3d4] Rate limit OK (12/100 par minute)
[WEBHOOK a1b2c3d4] Provider configuré: gupshup
[WEBHOOK a1b2c3d4] Format détecté: Gupshup
[WEBHOOK a1b2c3d4] Vérification sécurité: { tokenValid: true, formatValid: true }
[WEBHOOK a1b2c3d4] Message Gupshup { from: '23052123456', type: 'text' }
[WEBHOOK a1b2c3d4] → Routage message texte de 23052123456: "Bonjour..."
[WEBHOOK a1b2c3d4] ✅ Traitement terminé
```

### 2. ROUTER - Distribution des Messages

**Tag** : `[ROUTER {id}]`

**Événements loggés** :
- Identification de l'utilisateur (admin/prestataire/client/onboarding/inconnu)
- Détection intention upgrade
- Vérification rate limit
- Redirection vers handler approprié

**Exemple** :

```
[ROUTER e5f6g7h8] ========== ROUTAGE MESSAGE ==========
[ROUTER e5f6g7h8] De: 23052123456
[ROUTER e5f6g7h8] Message: "Je veux voir mon agenda"
[ROUTER e5f6g7h8] Médias: 0
[ROUTER e5f6g7h8] ✅ Identifié: PRESTATAIRE { nom: 'Salon Beauté', plan: 'starter', statut: 'actif' }
[ROUTER e5f6g7h8] Vérification rate limit prestataire...
[ROUTER e5f6g7h8] ✅ Rate limit OK (5/50)
[ROUTER e5f6g7h8] ========== FIN ROUTAGE ==========
```

### 3. CLIENT - Gestion Réservations

**Tag** : `[CLIENT {id}]`

**Événements loggés** :
- Identification client
- Vérification bannissement
- Détermination du prestataire
- Vérification disponibilité horaire
- Détection signalement / hors-sujet
- Étapes de réservation (choix service, créneau, confirmation)
- Tracking tokens consommés

**Exemple** :

```
[CLIENT i9j0k1l2] ========== DÉBUT TRAITEMENT ==========
[CLIENT i9j0k1l2] Numéro: 23057891234
[CLIENT i9j0k1l2] Message: "Je veux un rdv demain"
[CLIENT i9j0k1l2] Client existant: OUI
[CLIENT i9j0k1l2] Rate limit restant: 45
[CLIENT i9j0k1l2] Chargement conversation...
[CLIENT i9j0k1l2] Historique: 3 messages
[CLIENT i9j0k1l2] Détermination prestataire...
[CLIENT i9j0k1l2] ✅ Prestataire identifié: Salon Beauté { plan: 'pro', statut: 'actif' }
[CLIENT i9j0k1l2] Vérification disponibilité horaire...
[CLIENT i9j0k1l2] ✅ Disponibilité horaire OK
[CLIENT i9j0k1l2] Vérification pertinence message...
[CLIENT i9j0k1l2] ✅ Message pertinent
[CLIENT i9j0k1l2] Étape conversation: choix_service
[CLIENT i9j0k1l2] → Traitement choix service
[CLIENT i9j0k1l2] Tokens consommés (estimés): 320
[CLIENT i9j0k1l2] ✅ Service validé: Coupe cheveux
[CLIENT i9j0k1l2] ✅ Traitement terminé avec succès
[CLIENT i9j0k1l2] ========== FIN TRAITEMENT ==========
```

### 4. PRESTATAIRE - Gestion Activité

**Tag** : `[PRESTATAIRE {id}]`

**Événements loggés** :
- Identification prestataire
- Vérification accès (abonnement, horaire)
- Détection commandes (aide, agenda, services)
- Extraction et exécution d'actions
- Tracking tokens

**Exemple** :

```
[PRESTATAIRE m3n4o5p6] ========== DÉBUT TRAITEMENT ==========
[PRESTATAIRE m3n4o5p6] Prestataire: Salon Beauté (starter)
[PRESTATAIRE m3n4o5p6] Message: "agenda aujourd'hui"
[PRESTATAIRE m3n4o5p6] Médias: 0
[PRESTATAIRE m3n4o5p6] Rate limit restant: 42
[PRESTATAIRE m3n4o5p6] Vérification accès...
[PRESTATAIRE m3n4o5p6] ✅ Accès autorisé
[PRESTATAIRE m3n4o5p6] → Appel IA pour interpréter commande...
[PRESTATAIRE m3n4o5p6] 1 action(s) détectée(s) { actions: ['AGENDA_JOUR'] }
[PRESTATAIRE m3n4o5p6] Exécution action: AGENDA_JOUR { parametres: ['2026-03-31'] }
[PRESTATAIRE m3n4o5p6] → Agenda jour: 4 RDV trouvés
[PRESTATAIRE m3n4o5p6] ✅ RDV confirmé et client notifié
[PRESTATAIRE m3n4o5p6] Tokens consommés (estimés): 450
[PRESTATAIRE m3n4o5p6] → Envoi réponse finale...
[PRESTATAIRE m3n4o5p6] ✅ Traitement terminé avec succès
[PRESTATAIRE m3n4o5p6] ========== FIN TRAITEMENT ==========
```

### 5. IA - Appels Intelligence Artificielle

**Tags** :
- `[IA {id}]` : Appel général
- `[IA-CONV {id}]` : Conversation contextualisée
- `[IA-INTENTION {id}]` : Détection d'intention
- `[IA-PERTINENCE {id}]` : Vérification pertinence
- `[IA-SIGNALEMENT {id}]` : Détection signalement
- `[IA-DIRECT {id}]` : Appel direct (admin)

**Événements loggés** :
- Provider IA utilisé (OpenAI/Claude)
- Nombre de messages dans le contexte
- Tokens consommés (prompt, completion, total)
- Longueur de la réponse
- Raison d'arrêt (finish_reason)

**Exemple** :

```
[IA q7r8s9t0] Appel openai { provider: 'openai', messagesCount: 5, maxTokens: 1024 }
[IA q7r8s9t0] ✅ Réponse OpenAI reçue {
  tokensPrompt: 1250,
  tokensCompletion: 320,
  tokensTotal: 1570,
  responseLength: 450,
  finishReason: 'stop'
}
```

### 6. SEND - Envoi de Messages

**Tags** :
- `[SEND {id}]` : Préparation envoi
- `[GUPSHUP {id}]` : Envoi via Gupshup
- `[TWILIO {id}]` : Envoi via Twilio
- `[META {id}]` : Envoi via Meta

**Événements loggés** :
- Destinataire
- Provider utilisé
- Longueur du message
- ID du message (SID, MessageId)
- Erreurs d'envoi

**Exemple** :

```
[SEND u1v2w3x4] Préparation envoi {
  to: '23052123456',
  provider: 'gupshup',
  messageLength: 250,
  preview: 'Bonjour ! Voici votre agenda...'
}
[GUPSHUP y5z6a7b8] Envoi message à 23052123456...
[GUPSHUP y5z6a7b8] ✅ Envoyé (MessageId: GS_1234567890)
[SEND u1v2w3x4] ✅ Message envoyé avec succès à 23052123456
```

### 7. ACCES - Contrôle d'Accès

**Tag** : `[ACCES]`

**Événements loggés** :
- Informations prestataire (nom, plan, statut)
- Fonctionnalité demandée
- Raison de refus (si applicable)
- Bypass admin

**Exemple** :

```
[ACCES] Vérification accès {
  prestataire: 'Salon Beauté',
  telephone: '23052123456',
  plan: 'starter',
  statut: 'actif',
  fonctionnalite: 'agenda'
}
[ACCES] ✅ Accès autorisé pour agenda
```

**Exemple de refus** :

```
[ACCES] Vérification accès {
  prestataire: 'Salon Beauté',
  plan: 'starter',
  statut: 'actif',
  fonctionnalite: 'notes_vocales'
}
[ACCES] ⛔ Fonctionnalité non incluse dans plan starter {
  fonctionnalite: 'notes_vocales',
  planRequis: 'pro'
}
```

### 8. AUDIO - Notes Vocales

**Tag** : `[AUDIO {id}]`

**Événements loggés** :
- Détection expéditeur (prestataire/client)
- Vérification plan pour notes vocales
- Provider de transcription
- Résultat transcription
- Routage du texte transcrit

**Exemple** :

```
[AUDIO c9d0e1f2] Début traitement note vocale {
  from: '23052123456',
  provider: 'gupshup',
  hasMediaUrl: true
}
[AUDIO c9d0e1f2] Expéditeur identifié: prestataire {
  nom: 'Salon Beauté',
  plan: 'pro',
  statut: 'actif'
}
[AUDIO c9d0e1f2] Vérification accès notes vocales: { autorise: true }
[AUDIO c9d0e1f2] Début transcription via gupshup
[AUDIO c9d0e1f2] ✅ Transcription réussie: "Je veux voir mon agenda demain"
[AUDIO c9d0e1f2] ✅ Routage terminé
```

### 9. SÉCURITÉ - Tentatives Suspectes

**Tag** : `[SÉCURITÉ]`

**Événements loggés** :
- IP source
- Raison du rejet
- Headers de la requête
- Compteur de tentatives
- Alerte admin (si > 50 tentatives)

**Exemple** :

```json
[SÉCURITÉ] {
  "timestamp": "2026-03-31T10:30:00.000Z",
  "type": "TENTATIVE_SUSPECTE",
  "ip": "123.45.67.89",
  "method": "POST",
  "path": "/webhook",
  "headers": {
    "userAgent": "curl/7.68.0",
    "contentType": "application/json",
    "origin": null
  },
  "raison": "token_invalide",
  "details": {
    "tokenPresent": false
  }
}
```

## Commandes de Surveillance

### Suivre les logs en temps réel

```bash
# Tous les logs
tail -f logs/app.log

# Uniquement les webhooks
tail -f logs/app.log | grep "WEBHOOK"

# Uniquement les erreurs
tail -f logs/app.log | grep "❌"

# Uniquement les alertes sécurité
tail -f logs/app.log | grep "SÉCURITÉ"
```

### Analyser les logs

```bash
# Compter les webhooks reçus aujourd'hui
grep "NOUVELLE REQUÊTE" logs/app.log | grep "$(date +%Y-%m-%d)" | wc -l

# Trouver toutes les erreurs de la dernière heure
grep "$(date -d '1 hour ago' '+%Y-%m-%dT%H')" logs/app.log | grep "❌"

# Voir les IPs suspectes
grep "TENTATIVE_SUSPECTE" logs/app.log | grep -oP '"ip": "\K[^"]+' | sort | uniq -c | sort -rn

# Compter les tokens consommés
grep "Tokens consommés" logs/app.log | grep -oP '\d+' | awk '{sum+=$1} END {print sum}'
```

### Monitoring avec PM2

Si vous utilisez PM2 :

```bash
# Logs en temps réel
pm2 logs riserv

# Logs des erreurs uniquement
pm2 logs riserv --err

# Statistiques
pm2 monit
```

## Scénarios de Debugging

### Scénario 1 : Message non reçu

**Symptômes** : Un utilisateur dit avoir envoyé un message mais aucune réponse

**Debugging** :

1. Chercher le numéro dans les logs webhook :
```bash
grep "23052123456" logs/app.log
```

2. Si rien → Le webhook n'a pas reçu le message
   - Vérifier la configuration Gupshup
   - Vérifier les logs Gupshup Dashboard

3. Si présent mais erreur → Voir le tag `[WEBHOOK]` et identifier l'erreur

### Scénario 2 : Message rejeté par sécurité

**Symptômes** : `403 Unauthorized` dans les logs Gupshup

**Debugging** :

```bash
grep "TENTATIVE_SUSPECTE" logs/app.log | tail -20
```

Regarder la `raison` :
- `token_invalide` → Token mal configuré dans Gupshup
- `ip_non_autorisee` → IP pas dans whitelist
- `format_invalide` → Payload corrompu

### Scénario 3 : Erreur IA / Tokens

**Symptômes** : Utilisateur ne reçoit pas de réponse ou réponse bizarre

**Debugging** :

```bash
# Trouver tous les appels IA pour ce numéro
grep "IA.*23052123456" logs/app.log

# Voir les erreurs IA
grep "IA.*❌" logs/app.log | tail -20
```

Causes fréquentes :
- Quota OpenAI/Claude dépassé
- API key invalide
- Timeout réseau

### Scénario 4 : Rate limit dépassé

**Symptômes** : Utilisateur dit que ça ne répond plus

**Debugging** :

```bash
grep "Rate limit.*23052123456" logs/app.log
```

Si `⛔ Rate limit dépassé` → Normal, attendre renouvellement (1h)

Si pas de rate limit dépassé → Autre problème

### Scénario 5 : Accès refusé

**Symptômes** : Prestataire Starter se plaint de ne pas pouvoir utiliser une fonctionnalité

**Debugging** :

```bash
grep "ACCES.*23052123456" logs/app.log | tail -10
```

Regarder :
- `⛔ Fonctionnalité non incluse` → Upgrade requis
- `⛔ Starter après 18h` → Restriction horaire
- `⛔ Abonnement non actif` → Expiration

## Niveaux de Log par Environnement

### Développement (`NODE_ENV=development`)

Tous les logs activés :
- Webhook détaillé
- Router détaillé
- IA avec tokens
- Actions détaillées

### Production (`NODE_ENV=production`)

Logs essentiels uniquement :
- Webhooks (IDs uniquement)
- Erreurs complètes
- Sécurité complète
- IA (sans détails tokens)

**Configuration** : À implémenter dans chaque module avec `if (process.env.NODE_ENV === 'development')`

## Métriques Utiles

### Performance

```bash
# Temps moyen de traitement webhook
grep "Traitement terminé" logs/app.log | # TODO: extraire durée

# Temps moyen appel IA
grep "Réponse.*reçue" logs/app.log | # TODO: extraire durée
```

### Volume

```bash
# Messages par jour
grep "ROUTAGE MESSAGE" logs/app.log | grep "$(date +%Y-%m-%d)" | wc -l

# Répartition prestataires vs clients
grep "Identifié: PRESTATAIRE" logs/app.log | wc -l
grep "Identifié: CLIENT" logs/app.log | wc -l
```

### Sécurité

```bash
# Tentatives suspectes par IP
grep "TENTATIVE_SUSPECTE" logs/app.log | jq -r '.ip' | sort | uniq -c | sort -rn

# Raisons de rejet les plus fréquentes
grep "TENTATIVE_SUSPECTE" logs/app.log | jq -r '.raison' | sort | uniq -c
```

## Best Practices

### 1. Rotation des Logs

Configurez une rotation automatique :

```bash
# Avec logrotate (Linux)
/var/log/riserv/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
}
```

### 2. Centralisation (Production)

Pour un environnement de production, envisagez :

- **Sentry** : Pour les erreurs et exceptions
- **Datadog** : Pour les métriques et APM
- **CloudWatch** : Si hébergé sur AWS
- **Logtail** : Service simple pour agrégation

### 3. Alertes Proactives

Configurez des alertes pour :

- Plus de 10 erreurs IA en 5 minutes
- Plus de 50 tentatives suspectes en 1 minute
- Webhook down (pas de requête reçue pendant 10 minutes)
- Rate limit atteint pour > 50% des users

### 4. RGPD et Données Sensibles

**Ne JAMAIS logger** :
- Mots de passe
- Tokens d'API complets (uniquement les 4 premiers caractères)
- Numéros de carte bancaire
- Messages complets en production (uniquement aperçu)

**Actuellement dans les logs** :
- ✅ Messages tronqués (50 premiers caractères)
- ✅ IDs anonymes générés
- ⚠️ Numéros de téléphone complets → À masquer en production

**Recommandation** : Créer une fonction de masquage :

```javascript
function masquerTelephone(tel) {
  if (process.env.NODE_ENV === 'production') {
    return tel.substring(0, 6) + 'XXXX';
  }
  return tel;
}
```

## FAQ

### Q : Les logs sont-ils persistants ?

**R** : Oui, si configuré avec PM2 ou redirection `> logs/app.log`. Sinon, ils disparaissent au redémarrage.

### Q : Peut-on désactiver certains logs ?

**R** : Oui, créez des variables d'environnement :

```env
LOG_WEBHOOK=true
LOG_ROUTER=true
LOG_IA=false
LOG_SECURITY=true
```

### Q : Que faire si les logs sont trop volumineux ?

**R** : 
1. Activer la rotation (voir Best Practices)
2. Réduire le niveau de détail en production
3. Archiver les logs > 30 jours

### Q : Comment déboguer un problème spécifique ?

**R** : Utilisez l'ID de tracking :

```bash
# Trouver l'ID dans l'interaction problématique
grep "MESSAGE_SPECIFIQUE" logs/app.log | grep -oP 'ROUTER \K\w+'

# Puis tracer tout le flux avec cet ID
grep "abc123" logs/app.log
```

## Support

Pour toute question sur les logs :
- Documentation : `docs/LOGS.md` (ce fichier)
- Email support : support@riserv.mu
