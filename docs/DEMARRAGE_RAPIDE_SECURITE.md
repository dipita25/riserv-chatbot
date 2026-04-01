# Guide de Démarrage Rapide - Sécurité Gupshup

## Installation Rapide (5 minutes)

### 1. Générer le token de sécurité

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copiez le résultat (64 caractères).

### 2. Mettre à jour `.env`

```env
WHATSAPP_PROVIDER=gupshup
GUPSHUP_WEBHOOK_TOKEN=COLLEZ_LE_TOKEN_GENERE_ICI
```

### 3. Configurer Gupshup Dashboard

1. Connectez-vous sur https://www.gupshup.io/developer/home
2. Allez dans votre App → "Webhooks"
3. URL : `https://votre-domaine.com/webhook`
4. Ajoutez un header personnalisé :
   - **Name** : `x-gupshup-token`
   - **Value** : Le token généré à l'étape 1
5. Sauvegardez

### 4. Tester

```bash
# Test sécurité (devrait rejeter)
curl -X POST https://votre-domaine.com/webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"message","payload":{"source":"23052123456","type":"text","payload":{"text":"Test"}}}'

# Résultat attendu : 403 Unauthorized

# Test avec token (devrait accepter)
curl -X POST https://votre-domaine.com/webhook \
  -H "Content-Type: application/json" \
  -H "x-gupshup-token: VOTRE_TOKEN_ICI" \
  -d '{"type":"message","payload":{"source":"23052123456","type":"text","payload":{"text":"Test"}}}'

# Résultat attendu : 200 OK
```

### 5. Vérifier les logs

```bash
# Sur votre serveur
tail -f logs/app.log

# Ou avec PM2
pm2 logs riserv
```

Vous devriez voir :

```
[WEBHOOK abc123] ========== NOUVELLE REQUÊTE ==========
[WEBHOOK abc123] Format détecté: Gupshup
[WEBHOOK abc123] Vérification sécurité: { tokenValid: true, ... }
[WEBHOOK abc123] ✅ Traitement terminé
```

## Configuration Complète (Production)

Pour une sécurité maximale :

### 1. Obtenir les IPs Gupshup

Email à `devsupport@gupshup.io` :

```
Sujet : Request for Webhook IP Addresses
Message : Hello, I need the list of Gupshup server IPs for webhook whitelisting.
          My App ID is: [VOTRE_APP_ID]
```

### 2. Configurer IP Whitelist

Dans `.env` :

```env
GUPSHUP_ALLOWED_IPS=1.2.3.4,5.6.7.8,10.20.30.40
```

### 3. Credentials Gupshup

Dans `.env` :

```env
GUPSHUP_APP_ID=votre_app_id
GUPSHUP_API_KEY=votre_api_key
```

## Dépannage Rapide

### Problème : 403 sur toutes les requêtes

**Cause** : Token ne correspond pas

**Solution** :
1. Vérifiez que le token dans `.env` est identique à celui dans Gupshup
2. Redémarrez le serveur : `pm2 restart riserv`

### Problème : Messages non reçus

**Cause** : Webhook mal configuré

**Solution** :
1. Vérifiez l'URL dans Gupshup Dashboard
2. Vérifiez que le header `x-gupshup-token` est bien configuré
3. Vérifiez les logs Gupshup : Dashboard → Logs → Webhook Logs

### Problème : Rate limit dépassé

**Cause** : Tests trop rapides ou attaque

**Solution** :
- Attendez 1 minute
- Vérifiez les logs `[SÉCURITÉ]` pour voir l'IP source
- Si c'est vous, c'est normal pendant les tests

## Commandes Utiles

```bash
# Voir les tentatives suspectes
grep "TENTATIVE_SUSPECTE" logs/app.log

# Compter les webhooks reçus
grep "NOUVELLE REQUÊTE" logs/app.log | wc -l

# Analyser les IPs
grep "WEBHOOK" logs/app.log | grep "IP:" | sort | uniq -c

# Voir les erreurs
grep "❌" logs/app.log | tail -20
```

## Documentation Complète

- **Configuration détaillée** : `docs/CONFIGURATION_GUPSHUP.md`
- **Architecture sécurité** : `docs/SECURITE_WEBHOOK.md`
- **Système de logs** : `docs/LOGS.md`
- **Changelog** : `docs/CHANGELOG_SECURITE.md`

## Prêt pour la Production

Une fois les tests validés :

```bash
# 1. Passer en mode production
# Dans .env : NODE_ENV=production

# 2. Redémarrer
pm2 restart riserv

# 3. Monitorer pendant 24h
pm2 logs riserv --lines 100
```

## Support

**Email** : support@riserv.mu  
**Gupshup Support** : devsupport@gupshup.io
