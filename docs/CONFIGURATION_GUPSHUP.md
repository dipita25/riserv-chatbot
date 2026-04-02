# Guide de Configuration Gupshup pour Riserv

## Prérequis

- Compte Gupshup actif
- Application WhatsApp Business approuvée sur Gupshup
- Serveur accessible publiquement via HTTPS

## Étapes de Configuration

### 1. Créer une Application Gupshup

1. Connectez-vous à [Gupshup Console](https://www.gupshup.io/developer/home)
2. Allez dans "Apps" → "Create App"
3. Sélectionnez "WhatsApp" comme channel
4. Suivez les étapes pour connecter votre numéro WhatsApp Business

### 2. Obtenir les Credentials

Une fois l'application créée, récupérez :

- **App ID** : Dans "App Details" → "App ID"
- **API Key** : Dans "Settings" → "API Key" → "Generate New Key"

### 3. Générer un Token de Sécurité

Sur votre serveur, générez un token aléatoire sécurisé :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Exemple de sortie** : `a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456`

Copiez ce token, vous en aurez besoin.

### 4. Configurer les Variables d'Environnement

Dans votre fichier `.env`, mettez à jour :

```env
# Provider actif
WHATSAPP_PROVIDER=gupshup

# Credentials Gupshup
GUPSHUP_APP_ID=votre_app_id_ici
GUPSHUP_API_KEY=votre_api_key_ici
GUPSHUP_WEBHOOK_TOKEN=le_token_genere_ci_dessus

# IP Whitelisting (optionnel mais recommandé)
GUPSHUP_ALLOWED_IPS=

# Développement local:
# false = simulation console (aucun envoi réel)
# true  = envoi réel vers le provider configuré
WHATSAPP_DEV_REAL_SEND=false
```

### 5. Configurer le Webhook dans Gupshup

#### A. URL du Webhook

1. Dans Gupshup Console → Votre App → "Webhooks"
2. Cliquez sur "Configure Webhook"
3. Entrez votre URL : `https://votre-domaine.com/webhook`

#### B. Ajouter le Header d'Authentification

Dans la section "Custom Headers" :

1. Cliquez sur "Add Header"
2. **Header Name** : `x-gupshup-token`
3. **Header Value** : Le token que vous avez généré à l'étape 3
4. Cliquez sur "Save"

**Important** : Assurez-vous que le token dans Gupshup correspond EXACTEMENT à `GUPSHUP_WEBHOOK_TOKEN` dans votre `.env`.

#### C. Sélectionner les Events

Cochez les cases suivantes :

**Message Events** :
- ✅ Message
- ✅ Message Delivered
- ✅ Message Read

**System Events** :
- ✅ User Opted In
- ✅ User Opted Out

### 6. IP Whitelisting (Recommandé)

Pour une sécurité maximale :

1. Envoyez un email à `devsupport@gupshup.io`
2. Sujet : "Request for Webhook IP Addresses"
3. Contenu : "Hello, I need the list of Gupshup server IPs for webhook whitelisting. My App ID is: [VOTRE_APP_ID]"
4. Ils vous enverront la liste des IPs
5. Ajoutez-les dans `.env` :

```env
GUPSHUP_ALLOWED_IPS=1.2.3.4,5.6.7.8,10.20.30.40
```

### 7. Tester la Configuration

#### Test local rapide via Postman (simulate)

Endpoint:

`POST http://localhost:3000/simulate`

Headers:

- `Content-Type: application/json`

Body (raw JSON):

```json
{
  "from": "+23057000003",
  "body": "Bonjour, je cherche un massage"
}
```

Comportement attendu en dev:

- Si `WHATSAPP_DEV_REAL_SEND=false` : réponse affichée en console, sans envoi réel WhatsApp
- Si `WHATSAPP_DEV_REAL_SEND=true` : envoi réel via provider (`WHATSAPP_PROVIDER`)

Important:

- En mode `simulate`, les contrôles de provenance/signature webhook ne sont pas appliqués (c'est volontaire pour les tests locaux).
- Les contrôles de sécurité s'appliquent sur `POST /webhook`.

#### Test 1 : Vérifier la sécurité

Envoyez une requête SANS le token (devrait être rejetée) :

```bash
curl -X POST https://votre-domaine.com/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "message",
    "payload": {
      "source": "23052123456",
      "type": "text",
      "payload": { "text": "Test sans token" }
    }
  }'
```

**Résultat attendu** : `403 Unauthorized`

#### Test 2 : Vérifier le bon fonctionnement

Envoyez une requête AVEC le token (devrait fonctionner) :

```bash
curl -X POST https://votre-domaine.com/webhook \
  -H "Content-Type: application/json" \
  -H "x-gupshup-token: VOTRE_TOKEN_ICI" \
  -d '{
    "type": "message",
    "payload": {
      "source": "23052123456",
      "type": "text",
      "payload": { "text": "Test avec token" }
    }
  }'
```

**Résultat attendu** : `200 OK`

#### Test 3 : Envoyer un vrai message WhatsApp

1. Depuis votre téléphone, envoyez un message au numéro WhatsApp Business configuré dans Gupshup
2. Surveillez les logs de votre serveur :

```bash
# Sur votre serveur
tail -f logs/app.log
# ou
pm2 logs riserv
```

Vous devriez voir :

```
[WEBHOOK abc123] ========== NOUVELLE REQUÊTE ==========
[WEBHOOK abc123] Format détecté: Gupshup
[WEBHOOK abc123] Vérification sécurité: { tokenValid: true, formatValid: true, ... }
[WEBHOOK abc123] → Routage message texte de 23052123456: "Test..."
[WEBHOOK abc123] ✅ Traitement terminé
```

### 8. Monitoring et Logs

#### Surveiller les tentatives suspectes

Les tentatives non autorisées sont loggées avec le tag `[SÉCURITÉ]` :

```bash
grep "SÉCURITÉ" logs/app.log
```

Exemple de log suspect :

```json
{
  "timestamp": "2026-03-31T10:30:00.000Z",
  "type": "TENTATIVE_SUSPECTE",
  "ip": "123.45.67.89",
  "raison": "token_invalide",
  "details": {...}
}
```

#### Alertes Admin Automatiques

Si plus de 50 tentatives suspectes par minute sont détectées, l'admin recevra un message WhatsApp :

```
🚨 ALERTE SÉCURITÉ

Tentatives suspectes détectées :
IP : 123.45.67.89
Raison : token_invalide
Compteur : 52
Heure : 31/03/2026 10:30:15
```

### 9. Dépannage

#### Problème : "403 Unauthorized" sur toutes les requêtes

**Cause** : Le token ne correspond pas

**Solution** :
1. Vérifiez que `GUPSHUP_WEBHOOK_TOKEN` dans `.env` est identique au token configuré dans Gupshup
2. Redémarrez votre serveur après modification du `.env`
3. Vérifiez que le header dans Gupshup est bien `x-gupshup-token` (sensible à la casse)

#### Problème : Messages non reçus

**Cause** : Webhook non configuré correctement dans Gupshup

**Solution** :
1. Vérifiez l'URL du webhook dans Gupshup Console
2. Testez l'URL manuellement avec curl
3. Vérifiez que votre serveur est accessible publiquement (pas localhost)
4. Vérifiez les logs Gupshup dans "Logs" → "Webhook Logs"

#### Problème : "IP non autorisée"

**Cause** : L'IP de Gupshup n'est pas dans la whitelist

**Solution** :
1. Récupérez les IPs officielles auprès de Gupshup
2. Mettez à jour `GUPSHUP_ALLOWED_IPS` dans `.env`
3. Redémarrez le serveur

#### Problème : "Rate limit dépassé"

**Cause** : Plus de 100 requêtes par minute depuis une même IP

**Solution** :
1. C'est normal si vous testez rapidement
2. Attendez 1 minute
3. Si le problème persiste, vérifiez s'il y a une attaque DDoS

### 10. Migration depuis Twilio/Meta

Si vous migrez depuis un autre provider :

#### Étape 1 : Garder l'ancien actif

Ne changez PAS `WHATSAPP_PROVIDER` tout de suite. Configurez d'abord Gupshup complètement.

#### Étape 2 : Tester Gupshup en parallèle

Vous pouvez tester Gupshup en utilisant un numéro de test :

1. Configurez tout selon ce guide
2. Dans `.env`, laissez `WHATSAPP_PROVIDER=twilio` (ou meta)
3. Testez manuellement avec curl
4. Vérifiez les logs

#### Étape 3 : Basculer

Une fois les tests concluants :

1. Changez `WHATSAPP_PROVIDER=gupshup` dans `.env`
2. Redémarrez le serveur : `pm2 restart riserv`
3. Surveillez les logs pendant 24h
4. Vérifiez que tous les messages passent bien

#### Étape 4 : Nettoyage

Après 1 semaine sans incident, vous pouvez :

- Désactiver le webhook Twilio/Meta
- Supprimer les credentials Twilio/Meta du `.env` (ou les laisser en backup)

## Checklist Finale

Avant de passer en production, vérifiez :

- [ ] `WHATSAPP_PROVIDER=gupshup` dans `.env`
- [ ] `GUPSHUP_APP_ID` configuré
- [ ] `GUPSHUP_API_KEY` configuré
- [ ] `GUPSHUP_WEBHOOK_TOKEN` généré (32+ caractères aléatoires)
- [ ] Token configuré dans Gupshup Dashboard (header `x-gupshup-token`)
- [ ] Webhook URL configurée dans Gupshup : `https://votre-domaine.com/webhook`
- [ ] HTTPS actif et certificat SSL valide
- [ ] Test manuel avec curl réussi (avec et sans token)
- [ ] Test avec vrai message WhatsApp réussi
- [ ] Logs `[WEBHOOK]` et `[GUPSHUP]` visibles dans les logs serveur
- [ ] `GUPSHUP_ALLOWED_IPS` configuré (optionnel mais recommandé)
- [ ] Monitoring actif (logs, alertes admin)

## Support

**Gupshup** :
- Email : devsupport@gupshup.io
- Documentation : https://docs.gupshup.io
- Console : https://www.gupshup.io/developer/home

**Riserv** :
- Email support : support@riserv.mu
- Documentation sécurité : `docs/SECURITE_WEBHOOK.md`

## Annexe : Format Payload Gupshup

### Message texte entrant

```json
{
  "type": "message",
  "payload": {
    "id": "ABEGkYaYVDPXAhAQ_XXXXXXXXXXX",
    "source": "23052123456",
    "type": "text",
    "payload": {
      "text": "Bonjour"
    },
    "sender": {
      "phone": "23052123456",
      "name": "John Doe"
    }
  }
}
```

### Message audio entrant

```json
{
  "type": "message",
  "payload": {
    "source": "23052123456",
    "type": "audio",
    "payload": {
      "url": "https://example.com/audio.ogg",
      "urlExpiry": 1711900000000
    }
  }
}
```

### Message image entrant

```json
{
  "type": "message",
  "payload": {
    "source": "23052123456",
    "type": "image",
    "payload": {
      "url": "https://example.com/image.jpg",
      "caption": "Preuve de paiement"
    }
  }
}
```

### Event de statut message

```json
{
  "type": "message-event",
  "payload": {
    "id": "ABEGkYaYVDPXAhAQ_XXXXXXXXXXX",
    "gsId": "GUPSHUP_MESSAGE_ID",
    "type": "delivered",
    "destination": "23052123456",
    "payload": {
      "ts": 1711900000000
    }
  }
}
```
