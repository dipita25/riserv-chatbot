# Sécurisation Webhook Gupshup

## Vue d'ensemble

Ce document décrit la stratégie de sécurité multicouche mise en place pour protéger le webhook `/webhook` contre les accès non autorisés et les attaques.

## Architecture de sécurité

### Niveau 1 : Rate Limiting Global

Un système de rate limiting au niveau webhook limite le nombre de requêtes à **100 par minute par IP**.

- Prévient les attaques DDoS
- Nettoie automatiquement les compteurs toutes les minutes
- Alerte l'admin si plus de 50 tentatives suspectes

### Niveau 2 : Authentification par Token (Gupshup)

Pour Gupshup, un token secret personnalisé est vérifié :

```javascript
Header: x-gupshup-token: YOUR_TOKEN
// ou
Header: Authorization: Bearer YOUR_TOKEN
```

**Configuration** : `GUPSHUP_WEBHOOK_TOKEN` dans `.env`

### Niveau 3 : IP Whitelisting (Optionnel mais Recommandé)

Limite les requêtes aux IPs officielles de Gupshup.

**Configuration** : `GUPSHUP_ALLOWED_IPS=ip1,ip2,ip3` dans `.env`

Pour obtenir les IPs officielles : contacter `devsupport@gupshup.io`

### Niveau 4 : Validation du Payload

Vérifie que la structure du payload correspond au format Gupshup standard :

```json
{
  "type": "message",
  "payload": {
    "source": "91XXXXXXXXXX",
    "type": "text",
    "payload": {
      "text": "Message content"
    }
  }
}
```

### Niveau 5 : Signature Cryptographique (Twilio & Meta)

- **Twilio** : Vérification HMAC-SHA1 via `x-twilio-signature`
- **Meta** : Vérification HMAC-SHA256 via `x-hub-signature-256`

## Configuration

### Variables d'environnement requises

```env
# Provider actif
WHATSAPP_PROVIDER=gupshup

# Gupshup
GUPSHUP_APP_ID=your_app_id
GUPSHUP_API_KEY=your_api_key
GUPSHUP_WEBHOOK_TOKEN=your_secure_random_token_min_32_chars
GUPSHUP_ALLOWED_IPS=1.2.3.4,5.6.7.8

# Twilio (si utilisé)
TWILIO_AUTH_TOKEN=your_token

# Meta (si utilisé)
META_APP_SECRET=your_secret
```

### Génération du token sécurisé

```bash
# Générer un token aléatoire fort (32 caractères min)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Configuration dans Gupshup Dashboard

1. Aller dans votre app Gupshup
2. Section "Webhooks"
3. Ajouter votre URL : `https://votre-domaine.com/webhook`
4. Dans les headers personnalisés, ajouter :
   - **Header** : `x-gupshup-token`
   - **Value** : Votre `GUPSHUP_WEBHOOK_TOKEN`

## Logging et Monitoring

### Logs de sécurité

Chaque requête est loggée avec :

```javascript
{
  timestamp: "2026-03-31T10:30:00.000Z",
  ip: "1.2.3.4",
  headers: { userAgent, tokenPresent },
  validations: { tokenValid, userAgentValid, ipWhitelisted, formatValid },
  raison: "token_invalide" // Si rejeté
}
```

### Tentatives suspectes

Les tentatives suspectes sont enregistrées dans les logs avec le tag `[SÉCURITÉ]` et incluent :

- IP source
- User-Agent
- Raison du rejet
- Payload (si pertinent)

### Alertes Admin

L'admin reçoit une alerte WhatsApp automatique si :

- Plus de 50 tentatives suspectes par IP en 1 minute
- Format détecté : attaque potentielle

## Flux de traitement

```
Requête entrante
    ↓
Rate Limit (100/min par IP) ← Rejet 429
    ↓
Détection Provider (Gupshup/Twilio/Meta)
    ↓
Vérification Token/Signature ← Rejet 403 + Log suspect
    ↓
Vérification IP Whitelist (si configuré) ← Rejet 403 + Log suspect
    ↓
Validation Format Payload ← Rejet 403 + Log suspect
    ↓
✅ Requête Autorisée → Traitement
```

## Exemples de requêtes

### ✅ Requête valide Gupshup

```http
POST /webhook HTTP/1.1
Host: votre-domaine.com
Content-Type: application/json
x-gupshup-token: your_secure_token
User-Agent: Gupshup/1.0

{
  "type": "message",
  "payload": {
    "source": "23052123456",
    "type": "text",
    "payload": { "text": "Bonjour" }
  }
}
```

### ❌ Requête rejetée - Token invalide

```http
POST /webhook HTTP/1.1
Host: votre-domaine.com
Content-Type: application/json
x-gupshup-token: wrong_token

{...}
```

**Résultat** : 403 Unauthorized + Log `[SÉCURITÉ] token_invalide`

### ❌ Requête rejetée - Format invalide

```http
POST /webhook HTTP/1.1
Host: votre-domaine.com
Content-Type: application/json
x-gupshup-token: correct_token

{
  "random": "data",
  "not": "gupshup_format"
}
```

**Résultat** : 403 Unauthorized + Log `[SÉCURITÉ] format_invalide`

## Tests

### Test du webhook sécurisé

```bash
# Test avec token valide
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "x-gupshup-token: YOUR_TOKEN" \
  -d '{
    "type": "message",
    "payload": {
      "source": "23052123456",
      "type": "text",
      "payload": { "text": "Test" }
    }
  }'

# Test avec token invalide (devrait être rejeté)
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "x-gupshup-token: wrong_token" \
  -d '{...}'

# Test rate limiting (envoyer 101 requêtes rapidement)
for i in {1..101}; do
  curl -X POST http://localhost:3000/webhook \
    -H "Content-Type: application/json" \
    -H "x-gupshup-token: YOUR_TOKEN" \
    -d '{...}'
done
```

## Recommandations de sécurité

### Priorité HAUTE

1. ✅ **Activer HTTPS obligatoire** : Toutes les requêtes doivent utiliser HTTPS
2. ✅ **Définir un token fort** : Minimum 32 caractères aléatoires
3. ✅ **Configurer le token dans Gupshup** : Ajouter le header personnalisé

### Priorité MOYENNE

4. ⚠️ **Activer IP Whitelisting** : Contacter Gupshup pour obtenir les IPs officielles et les ajouter dans `GUPSHUP_ALLOWED_IPS`
5. ⚠️ **Monitoring** : Surveiller les logs `[SÉCURITÉ]` pour détecter des tentatives d'attaque

### Priorité BASSE

6. 🔄 **Rotation du token** : Changer le `GUPSHUP_WEBHOOK_TOKEN` tous les 3-6 mois
7. 🔄 **Audit des logs** : Réviser régulièrement les tentatives suspectes

## Migration depuis Twilio/Meta

Si vous migrez depuis Twilio ou Meta vers Gupshup :

1. Changer `WHATSAPP_PROVIDER=gupshup` dans `.env`
2. Configurer `GUPSHUP_WEBHOOK_TOKEN`
3. Configurer le webhook dans Gupshup Dashboard
4. Tester avec quelques messages
5. Monitorer les logs pour vérifier le bon fonctionnement
6. (Optionnel) Configurer `GUPSHUP_ALLOWED_IPS`

## Compatibilité Multi-Provider

Le système supporte 3 providers en parallèle :

- **Gupshup** : Token personnalisé + validation format
- **Twilio** : Signature HMAC-SHA1
- **Meta** : Signature HMAC-SHA256

Le provider actif est déterminé par `WHATSAPP_PROVIDER` dans `.env`.

## Support

Pour toute question de sécurité :

- Email support : support@riserv.mu
- Support Gupshup : devsupport@gupshup.io
