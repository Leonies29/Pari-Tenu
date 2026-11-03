# ✿ Pari tenu

Site (installable comme une app sur téléphone) pour se lancer des défis entre amis :
perte de poids, salle de sport, arrêter de fumer ou défi libre.

## Fonctionnalités

- **Comptes** : inscription (pseudo, email, mot de passe, date de naissance, sexe), connexion, mot de passe oublié
- **Anniversaires** : message le jour J ; les amis ne sont prévenus que si la personne l'a choisi (« Prévenir mes amis »), et ne voient jamais la date ni l'âge
- **Textes accordés** au sexe de chacun (« il a flanché », « ton amie »…), neutres si on préfère ne pas le dire
- **Idées de défis** : 18 défis tout prêts (forme, sport, bien-être, habitudes) qui pré-remplissent le formulaire
- **Aide « ? »** sur chaque champ de l'objectif
- **Défi seul·e ou entre potes** : un défi solo reste privé, sans invités ni salon de chat (on peut l'ouvrir à des potes plus tard)
- **Tutoriel de bienvenue** en pop-ups pour les nouveaux comptes (on peut le passer, et le revoir depuis son profil)
- **Défis privés ou publics**
  - 🔒 Privé : visible seulement par les membres et les potes invités
  - 🌍 Public : visible par tous les inscrits, qui peuvent le rejoindre
- **Invitations** par pseudo, à accepter ou refuser
- **Objectif perso** pour chaque membre, et une interface qui s'adapte au type de défi
- Compte à rebours, suivi **chaque jour**, **chaque semaine**, **chaque mois**, ou **seulement quand on craque** (rien à cocher : chaque jour sans écart compte comme réussi, avec un nombre d'écarts autorisés)
- « **J'ai flanché** » / « **Signaler qu'il/elle a flanché** » → sanction votée par **tous** les membres
- Bilan final : **récompense** ou **sanction**
- **Notifications** : cloche 🔔 dans l'appli (invitations, demandes d'ami, écarts, sanctions, messages, sorties bookées, rappels, anniversaires) + notifications sur le téléphone même appli fermée → voir **NOTIFICATIONS.md**
- **Barre d'onglets** : Accueil · Défis · ＋ Nouveau défi · Chat · Amis (l'admin a un bouton bouclier en haut)
- **Amis** : envoyer / accepter des demandes d'ami (pastille sur l'onglet quand une demande attend) ; les amis sont proposés en un clic pour les invitations
- **Calendrier** : jours tenus en vert, écarts en rose, sur chaque défi et sur l'accueil
- **Chat en direct** : conversations privées ou en groupe avec tes amis + un salon par défi
  - **📅 Proposer un moment** (resto, ciné, sport…) avec jour et heure : chacun répond Dispo / Peut-être / Pas dispo, puis l'auteur **booke** → le moment apparaît sur l'accueil
  - **📊 Sondages** dans n'importe quelle conversation
- **Tableau de bord** : ce qu'il y a à faire aujourd'hui, votes en attente, progrès de chaque défi
- **Page Admin** : liste des inscrits, recherche, passer admin, bloquer ou **supprimer** un compte, supprimer un défi

## Fichiers

```
index.html         la page
fonts/             les polices (Lilita One, Jost — licence libre OFL)
style.css          le style (vert & rose, fond rayé)
app.js             l'interface
config.js          ← TES clés Supabase vont ici
api-supabase.js    connexion à Supabase (vrais comptes)
api-demo.js        mode démo (si config.js est vide)
supabase/schema.sql   la base de données + les règles de sécurité
manifest.json, sw.js, icon.svg   → installable comme une app
```

## Mode démo

Tant que `config.js` est vide, le site tourne en **mode démo** : tout est stocké dans le navigateur,
avec 4 comptes de test (`leonie@demo.fr` est admin, `camille@`, `hugo@`, `ines@demo.fr`, mot de passe `demo`).
Pratique pour tester avant de brancher Supabase. Dans le chat, un pote « répond » automatiquement pour simuler le direct.

## Brancher Supabase (≈ 10 min, gratuit)

1. Crée un compte sur **supabase.com** → **New project** (choisis une région en Europe, note le mot de passe).
2. Dans le projet : **SQL Editor → New query** → colle tout le contenu de `supabase/schema.sql` → **Run**.
   (Il active aussi le temps réel sur les tables `messages` et `reponses` pour le chat.)
3. **Project Settings → API** : copie **Project URL** et la clé **anon public** dans `config.js`.
4. **Authentication → URL Configuration** : mets l'adresse de ton site GitHub Pages dans *Site URL*
   (ex. `https://tonpseudo.github.io/pari-tenu/`) pour que les liens des emails (confirmation, mot de passe oublié) ramènent au site.
   - Option : **Authentication → Sign In / Providers → Email** → désactive *Confirm email* si tu veux que les potes puissent jouer sans valider leur email.
5. Inscris-toi sur le site, puis dans **SQL Editor** :
   ```sql
   update public.profiles set role = 'admin' where pseudo = 'TonPseudo';
   ```
   Reconnecte-toi : le bouton **Admin** apparaît.

La clé *anon* peut être publique sur GitHub : c'est prévu comme ça. La sécurité vient des règles
du `schema.sql` (un défi privé n'est lisible que par ses membres, chacun ne saisit que ses propres données,
seuls les admins voient les emails, etc.). **Ne mets jamais la clé `service_role` dans le site.**

## Mettre en ligne sur GitHub Pages

1. Crée un dépôt sur github.com (ex. `pari-tenu`).
2. **Add file → Upload files** : dépose tout le contenu du dossier (avec le dossier `supabase`).
3. **Settings → Pages** → *Deploy from a branch* → `main`, dossier `/ (root)` → Save.
4. Après 1–2 min : `https://<ton-pseudo>.github.io/pari-tenu/`
5. Sur téléphone : « Ajouter à l'écran d'accueil » → ça s'ouvre comme une app.

Tester en local : `python3 -m http.server` dans le dossier, puis http://localhost:8000

## Pistes pour la suite

- Notifications de rappel (pesée du jour, séance) et quand un pote te signale
- Liste d'amis (pour inviter sans retaper le pseudo)
- Vraie app sur les stores en emballant le site avec **Capacitor**