# Migrations Supabase

## Vue d'ensemble

Ce dossier contient les migrations SQL pour créer et mettre à jour les tables de la base de données Supabase.

## Ordre d'exécution

Les migrations doivent être exécutées dans l'ordre suivant :

### 1. `add_demandes_upgrade.sql` (NOUVELLE)

Crée les tables pour gérer les demandes d'upgrade et renouvellements :

- `demandes_upgrade` : Stocke les demandes de changement de plan
- `conversations_upgrade` : Historique des conversations d'upgrade
- `tentatives_client_apres_18h` : Tracer les tentatives de réservation après 18h

**Tables créées** :
```sql
demandes_upgrade
conversations_upgrade
tentatives_client_apres_18h
```

## Comment exécuter les migrations

### Option 1 : Interface Supabase (recommandé)

1. Connectez-vous à [Supabase Dashboard](https://supabase.com/dashboard)
2. Sélectionnez votre projet
3. Allez dans **SQL Editor**
4. Ouvrez le fichier de migration
5. Copiez-collez le contenu SQL
6. Cliquez sur **Run** ou appuyez sur `Ctrl+Enter`

### Option 2 : CLI Supabase

```bash
# Si vous utilisez Supabase CLI
supabase db push
```

### Option 3 : Manuellement avec psql

```bash
psql -h db.gjdweoqwuwskabkdtsqi.supabase.co \
     -U postgres \
     -d postgres \
     -f migrations/add_demandes_upgrade.sql
```

## Vérification

Après exécution, vérifiez que les tables ont été créées :

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('demandes_upgrade', 'conversations_upgrade', 'tentatives_client_apres_18h');
```

Vous devriez voir les 3 nouvelles tables.

## Rollback (si nécessaire)

Pour annuler la migration :

```sql
DROP TABLE IF EXISTS conversations_upgrade CASCADE;
DROP TABLE IF EXISTS tentatives_client_apres_18h CASCADE;
DROP TABLE IF EXISTS demandes_upgrade CASCADE;
```

⚠️ **Attention** : Le rollback supprime toutes les données de ces tables.

## Notes importantes

- Les migrations utilisent `IF NOT EXISTS` pour éviter les erreurs si les tables existent déjà
- Les contraintes `ON DELETE CASCADE` assurent la suppression en cascade
- Les index sont créés automatiquement pour optimiser les performances
- Les timestamps utilisent `TIMESTAMP WITH TIME ZONE` pour gérer les fuseaux horaires

## Support

En cas de problème lors de l'exécution des migrations :
- Vérifiez les permissions de votre utilisateur Supabase
- Consultez les logs d'erreur dans le SQL Editor
- Contactez le support Supabase si nécessaire
