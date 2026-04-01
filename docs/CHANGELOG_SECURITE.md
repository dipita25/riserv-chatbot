# Changelog Sécurité & Logging

## 2026-03-31 - Sécurisation Webhook & Système de Logging Complet

### 🔒 Sécurité Webhook

#### Ajout d'un système de sécurité multicouche

**Nouveau fichier** : `src/middlewares/webhookSecurity.js`

**Fonctionnalités** :

1. **Vérification Token Gupshup**
   - Header `x-gupshup-token` ou `Authorization: Bearer {token}`
   - Configuré via `GUPSHUP_WEBHOOK_TOKEN` dans `.env`
   - Rejet automatique si token invalide (403)

2. **IP Whitelisting**
   - Liste d'IPs autorisées via `GUPSHUP_ALLOWED_IPS`
   - Normalisation IPv4/IPv6
   - Logs détaillés des IPs rejetées

3. **Validation Format Payload**
   - Vérification structure Gupshup (`type`, `payload`)
   - Vérification champs requis (`source`, `sender`)
   - Rejet si format invalide

4. **Signature Twilio**
   - Vérification HMAC-SHA1 via `x-twilio-signature`
   - Utilise `TWILIO_AUTH_TOKEN` pour validation
   - Reconstruction du hash selon la spec Twilio

5. **Signature Meta**
   - Vérification HMAC-SHA256 via `x-hub-signature-256`
   - Utilise `META_APP_SECRET` pour validation
   - Conformément à la spec Meta Graph API

6. **Rate Limiting Webhook**
   - Limite : 100 requêtes/minute par IP
   - Nettoyage automatique des compteurs
   - Alerte admin si > 50 tentatives suspectes

7. **Logger Tentatives Suspectes**
   - Enregistrement complet (IP, headers, raison)
   - Format JSON structuré
   - Notification WhatsApp à l'admin en cas d'attaque

**Modifications** : `src/routes/webhook.js`

- Ajout vérifications de sécurité avant traitement
- Génération d'ID unique par requête (`requestId`)
- Logs détaillés à chaque étape
- Support du format Gupshup (en plus de Twilio et Meta)
- Gestion des images Gupshup
- Gestion des erreurs améliorée

**Variables d'environnement ajoutées** :

```env
GUPSHUP_APP_ID=
GUPSHUP_API_KEY=
GUPSHUP_WEBHOOK_TOKEN=
GUPSHUP_ALLOWED_IPS=
META_APP_SECRET=
```

### 📊 Système de Logging Complet

#### Logging dans tous les modules critiques

**1. Router (`src/services/router.js`)**

- ID unique par routage (`routerId`)
- Logs de détection utilisateur (admin/prestataire/client/onboarding)
- Logs des décisions de routage
- Logs de vérification rate limit
- Logs d'erreurs avec stack trace

**2. WhatsApp Service (`src/services/whatsappService.js`)**

- Support Gupshup ajouté
- ID unique par envoi (`msgId`)
- Logs de préparation et d'envoi
- Logs des erreurs API avec détails (status, code, message)
- Logs des IDs de message retournés (SID, MessageId)

**3. Claude Service (`src/services/claudeService.js`)**

- ID unique par appel IA (`callId`, `convId`, etc.)
- Logs des tokens consommés (prompt, completion, total)
- Logs de la longueur des réponses
- Logs des raisons d'arrêt (finish_reason, stop_reason)
- Logs d'erreurs IA avec détails complets

**4. Prestataire Handler (`src/services/prestataireHandler.js`)**

- ID unique par interaction (`handlerId`)
- Logs du prestataire (nom, plan, statut)
- Logs de vérification accès
- Logs d'exécution d'actions ([ACTION:...])
- Logs des résultats (RDV trouvés, service ajouté, etc.)

**5. Client Handler (`src/services/clientHandler.js`)**

- ID unique par interaction (`clientId`)
- Logs de détection prestataire
- Logs de vérification disponibilité horaire
- Logs de détection signalement
- Logs de pertinence message
- Logs des étapes de réservation

**6. Vérifier Accès (`src/middlewares/verifierAcces.js`)**

- Logs détaillés de chaque vérification
- Logs des raisons de refus (plan insuffisant, horaire, abonnement)
- Logs du bypass admin
- Logs de validation accès

**7. Notes Vocales (`src/routes/webhook.js`)**

- ID unique par transcription (`audioId_log`)
- Logs du provider (Gupshup/Twilio/Meta)
- Logs de vérification accès notes vocales
- Logs de transcription (succès/échec)
- Logs de routage post-transcription

### 📝 Documentation

**Nouveaux documents** :

1. `docs/SECURITE_WEBHOOK.md`
   - Architecture de sécurité multicouche
   - Configuration détaillée par provider
   - Tests et validation
   - Exemples de requêtes valides/invalides
   - Dépannage

2. `docs/CONFIGURATION_GUPSHUP.md`
   - Guide étape par étape de configuration Gupshup
   - Génération de token sécurisé
   - Configuration webhook dans Dashboard
   - Tests de validation
   - Migration depuis Twilio/Meta
   - Checklist finale

3. `docs/LOGS.md`
   - Structure complète du système de logs
   - Format et symboles utilisés
   - Guide par module (WEBHOOK, ROUTER, CLIENT, etc.)
   - Commandes de surveillance
   - Scénarios de debugging
   - Best practices (rotation, centralisation, RGPD)

**Mise à jour** :

4. `README.md`
   - Section Sécurité ajoutée
   - Section Logging et Monitoring ajoutée
   - Stack technique mise à jour (Gupshup, IA multi-provider)
   - Variables d'environnement complétées
   - Roadmap mise à jour

### 🔧 Améliorations Techniques

#### Support Multi-Provider IA

- `AI_PROVIDER` : `openai` ou `claude`
- Logs des tokens selon le provider
- Gestion unifiée dans `claudeService.js`

#### Génération d'IDs Uniques

Tous les modules utilisent `crypto.randomBytes()` pour générer des IDs courts :

```javascript
const routerId = crypto.randomBytes(6).toString('hex'); // 12 caractères
```

#### Gestion d'Erreurs Améliorée

- Try/catch dans toutes les fonctions critiques
- Logs avec stack trace complets
- Contexte d'erreur enrichi (from, body, prestataire, etc.)

#### Console.log Structurés

Format standardisé :

```javascript
console.log(`[MODULE ${id}] Symbole Message`, objetContexte);
```

Symboles :
- `✅` : Succès
- `⛔` : Bloqué
- `⚠️` : Avertissement
- `❌` : Erreur
- `🚨` : Alerte critique
- `→` : Action suivante

### 🚀 Performance

- Rate limiting webhook : réduit la charge sur le serveur
- IDs courts (6-8 bytes) : lisibilité maximale avec taille minimale
- Logs conditionnels possibles (via `NODE_ENV`)

### 🔐 Sécurité Renforcée

#### Avant (ancien système)

- Aucune vérification d'origine des requêtes
- N'importe qui pouvait appeler le webhook
- Pas de protection DDoS
- Logs minimaux

#### Après (nouveau système)

- ✅ Token secret obligatoire (Gupshup)
- ✅ Signature cryptographique (Twilio/Meta)
- ✅ IP whitelisting optionnel
- ✅ Rate limiting (100/min par IP)
- ✅ Validation format payload
- ✅ Logs exhaustifs avec détection d'attaque
- ✅ Alerte admin automatique

### 📊 Observabilité

#### Avant

```
Message envoyé à 23052123456 :
Bonjour...

Erreur dans le routeur : Error: ...
```

#### Après

```
[WEBHOOK a1b2c3] ========== NOUVELLE REQUÊTE ==========
[WEBHOOK a1b2c3] IP: 203.192.X.X
[WEBHOOK a1b2c3] Rate limit OK (12/100 par minute)
[WEBHOOK a1b2c3] Provider configuré: gupshup
[WEBHOOK a1b2c3] Format détecté: Gupshup
[WEBHOOK a1b2c3] Vérification sécurité: { tokenValid: true, formatValid: true }
[WEBHOOK a1b2c3] → Routage message texte de 23052123456: "agenda..."
[ROUTER d4e5f6] ✅ Identifié: PRESTATAIRE { nom: 'Salon', plan: 'starter' }
[PRESTATAIRE g7h8i9] Vérification accès...
[ACCES] ✅ Accès autorisé pour agenda
[PRESTATAIRE g7h8i9] → Appel IA pour interpréter commande...
[IA j0k1l2] Appel openai { messagesCount: 5, maxTokens: 1024 }
[IA j0k1l2] ✅ Réponse OpenAI { tokensTotal: 1570 }
[PRESTATAIRE g7h8i9] 1 action(s) détectée(s) { actions: ['AGENDA_JOUR'] }
[PRESTATAIRE g7h8i9] → Agenda jour: 4 RDV trouvés
[SEND m3n4o5] ✅ Message envoyé avec succès
```

**Bénéfices** :
- Traçage complet de bout en bout via IDs
- Debugging facilité (grep par ID)
- Métriques automatiques (tokens, performance)
- Détection rapide des problèmes

### 📈 Métriques Disponibles

Via `docs/LOGS.md`, vous pouvez maintenant :

- Compter les messages par jour
- Analyser la consommation de tokens
- Identifier les IPs suspectes
- Mesurer les temps de réponse
- Détecter les patterns d'erreurs

### 🛡️ Protection DDoS

- Rate limiting au niveau webhook
- Blocage automatique des IPs abusives
- Alertes en temps réel

## Impact sur les Coûts

### Tokens IA

Les logs incluent maintenant la consommation de tokens :

```
[IA abc123] ✅ Réponse OpenAI { tokensTotal: 1570 }
[PRESTATAIRE def456] Tokens consommés (estimés): 320
```

Permet d'analyser les coûts par :
- Prestataire
- Type d'interaction (agenda, service, réservation)
- Provider IA (OpenAI vs Claude)

### WhatsApp API

Les logs incluent les IDs de message :

```
[GUPSHUP abc123] ✅ Envoyé (MessageId: GS_1234567890)
```

Permet de croiser avec la facturation Gupshup/Twilio/Meta.

## Migration Nécessaire

### Pour utiliser Gupshup en production :

1. Suivre `docs/CONFIGURATION_GUPSHUP.md`
2. Générer un token sécurisé (32+ caractères)
3. Configurer `GUPSHUP_WEBHOOK_TOKEN` dans `.env`
4. Ajouter le header dans Gupshup Dashboard
5. Tester avec curl
6. Basculer `WHATSAPP_PROVIDER=gupshup`

### Pour activer les logs en production :

Aucune action requise ! Les logs sont activés par défaut.

**Recommandations** :
- Configurer une rotation de logs (logrotate)
- Masquer les numéros de téléphone en prod (RGPD)
- Centraliser les logs (Sentry, Datadog, CloudWatch)

## Tests de Validation

### Sécurité

```bash
# Test token invalide (devrait être rejeté)
curl -X POST https://votre-domaine.com/webhook \
  -H "x-gupshup-token: wrong_token" \
  -d '{"type":"message","payload":{...}}'
# Résultat attendu : 403

# Test token valide (devrait passer)
curl -X POST https://votre-domaine.com/webhook \
  -H "x-gupshup-token: VOTRE_VRAI_TOKEN" \
  -d '{"type":"message","payload":{...}}'
# Résultat attendu : 200
```

### Logging

```bash
# Vérifier les logs
tail -f logs/app.log

# Tester un message
# → Vous devriez voir [WEBHOOK], [ROUTER], [CLIENT/PRESTATAIRE], [IA], [SEND]

# Compter les IDs uniques (chaque requête devrait avoir un ID différent)
grep "WEBHOOK.*NOUVELLE REQUÊTE" logs/app.log | wc -l
```

## Fichiers Modifiés

### Nouveaux fichiers

- `src/middlewares/webhookSecurity.js` - Middleware de sécurité
- `docs/SECURITE_WEBHOOK.md` - Documentation sécurité
- `docs/CONFIGURATION_GUPSHUP.md` - Guide configuration
- `docs/LOGS.md` - Documentation logging
- `docs/CHANGELOG_SECURITE.md` - Ce fichier

### Fichiers modifiés

- `src/routes/webhook.js` - Sécurité + logs + support Gupshup
- `src/services/router.js` - Logs détaillés
- `src/services/whatsappService.js` - Support Gupshup + logs
- `src/services/claudeService.js` - Support multi-IA + logs tokens
- `src/services/prestataireHandler.js` - Logs actions
- `src/services/clientHandler.js` - Logs réservations
- `src/middlewares/verifierAcces.js` - Logs décisions accès
- `.env` - Variables Gupshup
- `.env.example` - Template avec Gupshup
- `README.md` - Sections sécurité et logging

## Checklist Déploiement

Avant de déployer en production :

- [ ] Générer `GUPSHUP_WEBHOOK_TOKEN` (32+ caractères)
- [ ] Configurer le token dans Gupshup Dashboard
- [ ] Configurer `GUPSHUP_APP_ID` et `GUPSHUP_API_KEY`
- [ ] (Optionnel) Demander les IPs Gupshup et configurer `GUPSHUP_ALLOWED_IPS`
- [ ] Tester avec curl (token invalide → 403)
- [ ] Tester avec curl (token valide → 200)
- [ ] Envoyer un vrai message WhatsApp
- [ ] Vérifier les logs `[WEBHOOK]`, `[ROUTER]`, `[SEND]`
- [ ] Configurer rotation des logs
- [ ] Mettre en place monitoring (Sentry/Datadog)
- [ ] Basculer `WHATSAPP_PROVIDER=gupshup`

## Support

**Questions Gupshup** : devsupport@gupshup.io  
**Questions Riserv** : support@riserv.mu

## Références

- [Gupshup Webhook Documentation](https://docs.gupshup.io/docs/webhooks-2)
- [Twilio Signature Validation](https://www.twilio.com/docs/usage/security#validating-requests)
- [Meta Webhook Security](https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests)
