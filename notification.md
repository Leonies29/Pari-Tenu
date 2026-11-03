# 🔔 Mettre en route les notifications

Deux choses :
1. **La cloche dans l'app** : marche dès l'étape 1.
2. **Les notifications sur le téléphone** (même appli fermée) : étapes 2 à 5.

> ⚠️ Ne mets **jamais** la clé privée VAPID ni le secret du webhook dans les fichiers du site ou sur GitHub.
> Ils vont uniquement dans les *Secrets* de Supabase.

## 1. Créer les notifications dans la base
Supabase → **SQL Editor** → colle tout `supabase/notifications.sql` → **Run**.
(On peut le relancer sans risque.)

## 2. Rappels et anniversaires automatiques (facultatif)
1. Supabase → **Database → Extensions** → cherche **pg_cron** → active-le.
2. **SQL Editor** → colle `supabase/rappels-programmes.sql` → **Run**.

## 3. Les secrets
Supabase → **Edge Functions → Secrets** → ajoute :

| Nom | Valeur |
|---|---|
| `VAPID_PUBLIC_KEY` | la clé publique (la même que dans `app.js`) |
| `VAPID_PRIVATE_KEY` | la clé privée (gardée secrète) |
| `VAPID_SUJET` | `mailto:` + ton email, ex. `mailto:moi@exemple.fr` |
| `WEBHOOK_SECRET` | un mot de passe inventé |

## 4. La fonction qui envoie les notifications
1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nom : `envoyer-push`.
3. Colle tout `supabase/functions/envoyer-push/index.ts` → **Deploy**.
4. Dans les réglages de la fonction, **désactive « Verify JWT »** (la sécurité est assurée par `WEBHOOK_SECRET`).

## 5. Le déclencheur (Database Webhook)
Supabase → **Database → Webhooks** (ou **Integrations → Database Webhooks**) → **Create a new hook** :
- Nom : `push-notifications`
- Table : `notifications`
- Événements : **Insert** et **Update**
- Type : **Supabase Edge Functions** → `envoyer-push`, méthode **POST**
- **HTTP Headers** → ajoute `x-webhook-secret` = la même valeur que `WEBHOOK_SECRET`

## 6. Sur chaque téléphone
- **iPhone** (iOS 16.4 ou plus) : ouvrir le site dans Safari → Partager → **Sur l'écran d'accueil** → ouvrir l'appli depuis l'icône.
- **Android** : depuis Chrome, ça marche directement (ou « Installer l'appli »).
- Puis dans l'appli : 🔔 → **Activer**.

### Ça ne marche pas ?
- Supabase → Edge Functions → `envoyer-push` → **Logs** : regarde les erreurs.
- `401 interdit` → l'en-tête `x-webhook-secret` du webhook ne correspond pas au secret.
- Rien dans les logs → le webhook n'est pas créé sur la table `notifications`.