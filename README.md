# 💰 Budget Planner Backend (BPlan)

> **BPlan** est une application web complète de gestion de finances personnelles et collaboratives. Elle permet aux utilisateurs de suivre leurs dépenses, de visualiser leurs économies et de gérer des budgets communs en temps réel.

---

## 🌟 Fonctionnalités Clés

* **🔐 Authentification Sécurisée :** Inscription, connexion, et vérification d'email obligatoire.
* **📊 Tableau de Bord Interactif :** Vue d'ensemble des budgets avec visualisation graphique.
* **🤝 Collaboration :** Système d'invitation par email pour gérer des budgets à plusieurs (famille, couple, amis).
* **💸 Gestion Complète :**
    * Création de budgets illimités (Devises multiples : EUR, USD, MAD, RON...).
    * Gestion des catégories avec barres de progression.
    * Suivi des transactions (Revenus/Dépenses) avec historique.
* **📈 Visualisation de Données :** Graphiques en camembert (répartition) et linéaires (évolution temporelle).
* **🎨 Personnalisation :** Avatar (upload Cloudinary), Mode Sombre/Clair, Thèmes de couleur personnalisables.
* **📂 Export :** Téléchargement des données au format CSV/Excel.
* **📱 Responsive :** Interface adaptée aux mobiles et aux ordinateurs.

---

## 🚀 Démo en Ligne

L'application est déployée et accessible ici :
👉 **[https://bplan.space](https://bplan.space)**

---

## 📖 Guide d'Utilisation

### 1. Inscription et Vérification
Créez un compte sécurisé. Un email de confirmation vous sera envoyé pour valider votre identité avant de commencer.

### 2. Le Tableau de Bord (Dashboard)
Votre centre de commande. Visualisez tous vos budgets d'un coup d'œil. Vous pouvez voir les invitations reçues via la cloche de notification.

### 3. Gestion d'un Budget
Cliquez sur un budget pour voir les détails.
* **Colonne Gauche :** Ajoutez des catégories (ex: Loyer, Courses). Une barre de progression vous indique le reste à dépenser.
* **Colonne Droite :** Ajoutez vos transactions. Le nom de la personne ayant payé s'affiche à côté.
* **Haut de page :** Visualisez instantanément le solde restant et la répartition des dépenses.

### 4. Collaboration
Invitez un proche en saisissant son email. Il recevra un lien unique pour rejoindre votre budget. Les modifications sont synchronisées en temps réel.

### 5. Profil et Personnalisation
Changez votre photo de profil, activez le **Mode Sombre** ou changez la couleur principale de l'application selon vos goûts.

---

## 🛠️ Stack Technique

Ce projet est une application **Full Stack** construite avec des technologies modernes :

**Frontend :**
* [React.js](https://reactjs.org/) (Vite)
* [Recharts](https://recharts.org/) (Graphiques)
* CSS3 (Variables, Flexbox, Grid)

**Backend :**
* [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/)
* [PostgreSQL](https://www.postgresql.org/) (Base de données relationnelle)
* [Resend](https://resend.com/) (Service d'envoi d'emails)
* [Cloudinary](https://cloudinary.com/) (Stockage des images)
* [JWT](https://jwt.io/) & [Bcrypt](https://www.npmjs.com/package/bcrypt) (Sécurité)

**Infrastructure :**
* **Frontend :** Vercel
* **Backend :** Render
* **Database :** Neon (Serverless Postgres)

---

## 💻 Installation Locale du Backend (Pour les développeurs)

Si vous souhaitez cloner et lancer ce projet sur votre machine :

### Prérequis
* Node.js installé
* PostgreSQL installé (ou une URL de connexion externe)

### 1. Cloner le projet
```bash
git clone [https://github.com/VOTRE_NOM/budget-backend.git](https://github.com/VOTRE_NOM/budget-backend.git)
cd budget-backend
