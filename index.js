const express = require("express");
const db = require("./db");
const bcrypt = require("bcryptjs"); // Importer bcrypt pour le hachage
const jwt = require("jsonwebtoken"); // Importer la bibliothèque JWT
const auth = require("./middleware/auth"); // <-- IMPORTER NOTRE GARDE
const cors = require("cors"); // <-- Importer cors
const nodemailer = require("nodemailer");
const crypto = require("node:crypto"); // Natif dans Node.js, pas d'install nécessaire

const transporter = nodemailer.createTransport({
  service: "gmail", // Garde ça, c'est pratique
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // Utilise SSL
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// 👇 1. Importez le middleware que vous venez de créer
const authenticateToken = require("./authMiddleware");

// On définit la liste des domaines autorisés
const allowedOrigins = new Set([
  "http://localhost:5173",
  "https://budget-frontend-seven.vercel.app",
]);

app.use(express.json());
app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // CORRECTION S7765 : Utilisation de !.includes() au lieu de .indexOf() === -1
      // C'est plus lisible : "Si les origines autorisées n'incluent pas l'origine actuelle..."
      if (!allowedOrigins.includes(origin)) {
        // CORRECTION S3504 : Utilisation de 'const' au lieu de 'var'
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

// Fonction pour enregistrer un changement dans l'historique
// Note: on passe le 'client' pour que ça fasse partie de la transaction SQL
async function logHistory(
  client,
  budgetId,
  userId,
  entityType,
  entityId,
  action,
  details
) {
  await client.query(
    "INSERT INTO history (budget_id, user_id, entity_type, entity_id, action, details) VALUES ($1, $2, $3, $4, $5, $6)",
    [budgetId, userId, entityType, entityId, action, details]
  );
}

// --- ROUTES ---

// Route pour la page d'accueil
app.get("/", (req, res) => {
  res.send("🎉 Le serveur de notre planificateur de budget est en marche !");
});

// Route pour tester la connexion à la BDD
app.get("/test-db", async (req, res) => {
  try {
    const result = await db.query("SELECT NOW()");
    res.send(
      `Connexion à la base de données réussie ! Heure du serveur BDD : ${result.rows[0].now}`
    );
  } catch (err) {
    console.error("Erreur de connexion à la base de données", err.stack);
    res.status(500).send("Erreur de connexion à la base de données");
  }
});

// NOUVELLE ROUTE : Inscription d'un utilisateur (POST /api/register)
// POST /api/register
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Vérifier existence
    const userExists = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (userExists.rows.length > 0) {
      return res
        .status(400)
        .json({ error: "Un utilisateur avec cet email existe déjà." });
    }

    // Hachage
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // GÉNÉRER LE TOKEN DE VÉRIFICATION
    const verificationToken = crypto.randomBytes(32).toString("hex");

    // INSÉRER (is_verified est FALSE par défaut)
    await db.query(
      "INSERT INTO users (name, email, password_hash, verification_token) VALUES ($1, $2, $3, $4)",
      [name, email, passwordHash, verificationToken]
    );

    // ENVOYER L'EMAIL
    const verifyLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Vérifiez votre compte Budget Planner",
      html: `
            <h1>Bienvenue ${name} !</h1>
            <p>Merci de vous être inscrit. Pour activer votre compte, veuillez cliquer sur le lien ci-dessous :</p>
            <a href="${verifyLink}">Confirmer mon email</a>
            <p>Ou copiez ce lien : ${verifyLink}</p>
        `,
    };

    await transporter.sendMail(mailOptions);

    // Réponse différente : on ne connecte pas l'utilisateur tout de suite
    res.status(201).json({
      message:
        "Inscription réussie. Veuillez vérifier vos emails pour activer votre compte.",
    });
  } catch (err) {
    console.error(err.message);
    // CORRECTION : Utilisez .json() au lieu de .send()
    res.status(500).json({
      error: "Erreur lors de l'envoi de l'email ou de l'inscription.",
    });
  }
});

// NOUVELLE ROUTE : Connexion d'un utilisateur
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const userResult = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (userResult.rows.length === 0) {
      return res
        .status(400)
        .json({ error: "Email ou mot de passe incorrect." });
    }
    const user = userResult.rows[0];

    // --- VÉRIFICATION EMAIL ---
    if (!user.is_verified) {
      return res
        .status(403)
        .json({ error: "Votre compte n'est pas activé. Vérifiez vos emails." });
    }
    // --------------------------

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res
        .status(400)
        .json({ error: "Email ou mot de passe incorrect." });
    }

    // 4. Si tout est correct, créer le "payload" du token
    // C'est l'information que l'on veut stocker dans le "bracelet"
    const payload = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    };

    // 5. Signer le token avec notre clé secrète et définir une expiration
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "1h" }, // Le token expirera dans 1 heure
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
        });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erreur du serveur");
  }
});

// POST /api/verify-email
app.post("/api/verify-email", async (req, res) => {
  try {
    const { token } = req.body;

    // Chercher l'utilisateur avec ce token
    const result = await db.query(
      "SELECT * FROM users WHERE verification_token = $1",
      [token]
    );

    if (result.rows.length === 0) {
      return res
        .status(400)
        .json({ error: "Jeton de vérification invalide ou expiré." });
    }

    const user = result.rows[0];

    // Activer le compte et supprimer le token
    await db.query(
      "UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = $1",
      [user.id]
    );

    res.json({
      message: "Compte vérifié avec succès ! Vous pouvez vous connecter.",
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erreur serveur");
  }
});

// --- 👇 2. AJOUTEZ LA NOUVELLE ROUTE PROTÉGÉE ---
// Cette route ne sera accessible que si un token JWT valide est fourni.
app.get("/api/dashboard", authenticateToken, (req, res) => {
  // Grâce au middleware `authenticateToken`, nous avons accès à `req.user`.
  // `req.user` contient le "payload" du token (par exemple: { userId: 1, email: 'user@example.com' })

  res.json({
    message: `Bienvenue sur votre tableau de bord, ${req.user.name} !`,
    userData: req.user,
  });
});

// --- NOUVELLE ROUTE DE TEST (PROTÉGÉE) ---
// Notez le 'auth' que nous passons en deuxième argument.
// C'est notre "garde" qui s'exécute AVANT la logique de la route.
app.get("/api/protected-test", auth, (req, res) => {
  // Si on arrive ici, c'est que le "garde" (auth) a validé notre token
  res.json({
    message: "Accès autorisé ! Bienvenue dans la zone VIP.",
    user: req.user, // On peut même voir l'ID de l'utilisateur qui a été décodé
  });
});

// --- ROUTES DU BUDGET (PROTÉGÉES) ---

// POST /api/budgets - Créer un nouveau budget
app.post("/api/budgets", auth, async (req, res) => {
  const { name, currency } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Le nom du budget est requis." });
  }

  const userId = req.user.id;
  const budgetCurrency = currency || "EUR";

  // 1. OBTENIR UN CLIENT DÉDIÉ DEPUIS LE POOL
  // C'est indispensable pour qu'une transaction (BEGIN/COMMIT) fonctionne
  const client = await db.pool.connect();

  try {
    // 2. Démarrer la transaction sur CE client spécifique
    await client.query("BEGIN");

    // A. Créer le budget
    const newBudgetQuery =
      "INSERT INTO budgets (name, currency) VALUES ($1, $2) RETURNING id, name, currency";
    const newBudgetResult = await client.query(newBudgetQuery, [
      name,
      budgetCurrency,
    ]);
    const newBudgetData = newBudgetResult.rows[0];

    // B. Lier l'utilisateur
    const linkUserQuery =
      "INSERT INTO user_budgets (user_id, budget_id, role) VALUES ($1, $2, $3)";
    await client.query(linkUserQuery, [userId, newBudgetData.id, "owner"]);

    // 3. Valider la transaction
    await client.query("COMMIT");

    // 4. Renvoyer le résultat
    res.status(201).json(newBudgetData);
  } catch (err) {
    // En cas d'erreur, on annule tout
    await client.query("ROLLBACK");
    console.error("Erreur création budget:", err.message);
    res.status(500).send("Erreur serveur lors de la création.");
  } finally {
    // 5. TRÈS IMPORTANT : Libérer le client pour qu'il retourne dans le pool
    client.release();
  }
});

// GET /api/budgets - Récupérer tous les budgets d'un utilisateur
app.get("/api/budgets", auth, async (req, res) => {
  try {
    // 1. Récupérer l'ID de l'utilisateur depuis le token
    const userId = req.user.id;

    // 2. Écrire la requête SQL avec une jointure (JOIN)
    // On sélectionne toutes les colonnes de la table 'budgets' (b.*)
    // On joint 'budgets' (b) avec 'user_budgets' (ub)
    // On ne garde que les lignes où l'ID de l'utilisateur (ub.user_id)
    // correspond à notre utilisateur connecté ($1)
    const query = `
            SELECT b.* FROM budgets b
            JOIN user_budgets ub ON b.id = ub.budget_id
            WHERE ub.user_id = $1
        `;

    // 3. Exécuter la requête
    const userBudgets = await db.query(query, [userId]);

    // 4. Renvoyer la liste des budgets trouvés
    // userBudgets.rows sera un tableau [ ] de tous les budgets
    res.status(200).json(userBudgets.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erreur du serveur.");
  }
});

// GET /api/budgets/:budgetId - Récupérer les détails d'UN SEUL budget
app.get("/api/budgets/:budgetId", auth, async (req, res) => {
  try {
    const { budgetId } = req.params;
    const userId = req.user.id;

    // 1. VÉRIFICATION SÉCURITÉ : L'utilisateur appartient-il à ce budget ?
    const authCheckQuery =
      "SELECT * FROM user_budgets WHERE user_id = $1 AND budget_id = $2";
    const authCheck = await db.query(authCheckQuery, [userId, budgetId]);

    if (authCheck.rows.length === 0) {
      return res.status(403).json({ error: "Action non autorisée." });
    }

    // 2. Récupérer les infos du budget
    const budgetQuery = "SELECT * FROM budgets WHERE id = $1";
    const budgetResult = await db.query(budgetQuery, [budgetId]);

    if (budgetResult.rows.length === 0) {
      return res.status(404).json({ error: "Budget non trouvé." });
    }

    res.status(200).json(budgetResult.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erreur du serveur.");
  }
});

// POST /api/budgets/:id/invite - Inviter un utilisateur
app.post("/api/budgets/:id/invite", auth, async (req, res) => {
  const { id } = req.params; // ID du budget
  const { email } = req.body; // Email du destinataire
  const senderId = req.user.id;
  const targetEmail = email.toLowerCase();

  if (!email) return res.status(400).json({ error: "L'email est requis." });

  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Vérifier que l'utilisateur est PROPRIÉTAIRE
    const checkOwner = await client.query(
      "SELECT * FROM user_budgets WHERE budget_id = $1 AND user_id = $2 AND role = 'owner'",
      [id, senderId]
    );
    if (checkOwner.rows.length === 0) {
      throw new Error("Seul le propriétaire peut envoyer des invitations.");
    }

    const budgetName = (
      await client.query("SELECT name FROM budgets WHERE id = $1", [id])
    ).rows[0].name;

    // 2. Vérifier si la personne est DÉJÀ membre
    // On cherche l'ID de l'utilisateur cible s'il existe
    const targetUserRes = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );
    if (targetUserRes.rows.length > 0) {
      const targetId = targetUserRes.rows[0].id;
      const isMember = await client.query(
        "SELECT * FROM user_budgets WHERE budget_id = $1 AND user_id = $2",
        [id, targetId]
      );
      if (isMember.rows.length > 0)
        throw new Error("Cet utilisateur est déjà membre du budget.");
    }

    // 3. Créer l'invitation
    const token = crypto.randomBytes(32).toString("hex");

    await client.query(
      "INSERT INTO invitations (budget_id, sender_id, recipient_email, token) VALUES ($1, $2, $3, $4)",
      [id, senderId, targetEmail, token]
    );

    // 4. Envoyer l'email
    // Le lien renverra vers une page React "/invitations" (à créer)
    const inviteLink = `${process.env.FRONTEND_URL}/invitations?token=${token}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Invitation à rejoindre le budget "${budgetName}"`,
      html: `
                <h2>Vous avez été invité !</h2>
                <p>L'utilisateur avec l'ID ${senderId} vous invite à collaborer sur le budget <strong>${budgetName}</strong>.</p>
                <p>Cliquez ci-dessous pour accepter ou refuser :</p>
                <a href="${inviteLink}" style="padding: 10px 20px; background-color: #4361ee; color: white; text-decoration: none; border-radius: 5px;">Voir l'invitation</a>
                <p><small>Si vous n'avez pas de compte, vous devrez en créer un avec cet email (${email}) d'abord.</small></p>
            `,
    };

    await transporter.sendMail(mailOptions);

    await client.query("COMMIT");
    res.json({ message: `Invitation envoyée à ${email}` });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    // Gestion de l'erreur doublon (clé unique)
    if (err.code === "23505") {
      return res
        .status(400)
        .json({ error: "Une invitation est déjà en cours pour cet email." });
    }
    res.status(400).json({ error: err.message || "Erreur lors de l'envoi." });
  } finally {
    client.release();
  }
});

// GET /api/invitations - Voir mes invitations reçues
app.get("/api/invitations", auth, async (req, res) => {
  try {
    const userEmail = req.user.email.toLowerCase();

    // On récupère les invits liées à mon email ET qui sont 'pending'
    const query = `
            SELECT i.*, b.name as budget_name, u.name as sender_name 
            FROM invitations i
            JOIN budgets b ON i.budget_id = b.id
            JOIN users u ON i.sender_id = u.id
            WHERE i.recipient_email = $1 AND i.status = 'pending'
        `;

    const result = await db.query(query, [userEmail]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/budgets/:id/members - Voir les membres du budget
app.get("/api/budgets/:id/members", auth, async (req, res) => {
  const { id } = req.params;

  try {
    // On joint 'user_budgets' avec 'users' pour avoir les noms et avatars
    const query = `
            SELECT u.id, u.name, u.email, u.avatar_url, ub.role
            FROM user_budgets ub
            JOIN users u ON ub.user_id = u.id
            WHERE ub.budget_id = $1
        `;
    const result = await db.query(query, [id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/invitations/:id/respond - Accepter ou Refuser
app.post("/api/invitations/:id/respond", auth, async (req, res) => {
  const { id } = req.params; // ID de l'invitation
  const { status } = req.body; // 'accepted' ou 'rejected'
  const userId = req.user.id;

  if (!["accepted", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Statut invalide." });
  }

  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Récupérer l'invit
    const invitRes = await client.query(
      "SELECT * FROM invitations WHERE id = $1",
      [id]
    );
    if (invitRes.rows.length === 0) throw new Error("Invitation introuvable.");

    const invitation = invitRes.rows[0];

    // 2. Mettre à jour le statut de l'invitation
    await client.query("UPDATE invitations SET status = $1 WHERE id = $2", [
      status,
      id,
    ]);

    // 3. SI ACCEPTÉ : Ajouter l'utilisateur au budget
    if (status === "accepted") {
      await client.query(
        "INSERT INTO user_budgets (user_id, budget_id, role) VALUES ($1, $2, $3)",
        [userId, invitation.budget_id, "member"] // Rôle 'member' (pas owner)
      );

      // On loggue l'arrivée du membre dans l'historique
      await logHistory(
        client,
        invitation.budget_id,
        userId,
        "BUDGET",
        invitation.budget_id,
        "UPDATE",
        "Nouveau membre rejoint le budget"
      );
    }

    await client.query("COMMIT");
    res.json({
      message: `Invitation ${status === "accepted" ? "acceptée" : "refusée"}.`,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --- ROUTES DES CATÉGORIES (PROTÉGÉES) ---

// POST /api/budgets/:budgetId/categories - Créer une nouvelle catégorie pour un budget
app.post("/api/budgets/:budgetId/categories", auth, async (req, res) => {
  try {
    // 1. Récupérer les informations
    const { budgetId } = req.params; // Récupère 'budgetId' de l'URL
    const { name, monthly_budget } = req.body; // Récupère les infos de la catégorie
    const userId = req.user.id; // Récupère l'utilisateur connecté

    // 2. VÉRIFICATION D'AUTORISATION
    // Vérifier si l'utilisateur est bien membre de ce budget
    const authCheck = await db.query(
      "SELECT * FROM user_budgets WHERE user_id = $1 AND budget_id = $2",
      [userId, budgetId]
    );

    if (authCheck.rows.length === 0) {
      return res.status(403).json({
        error: "Action non autorisée. Vous n'êtes pas membre de ce budget.",
      });
    }

    // 3. Insérer la nouvelle catégorie
    const newCategory = await db.query(
      "INSERT INTO categories (budget_id, name, monthly_budget) VALUES ($1, $2, $3) RETURNING *",
      [budgetId, name, monthly_budget]
    );

    res.status(201).json(newCategory.rows[0]);
  } catch (err) {
    console.error(err.message);
    // Gérer l'erreur de "doublon" (UNIQUE constraint)
    if (err.code === "23505") {
      return res.status(400).json({
        error: "Une catégorie avec ce nom existe déjà dans ce budget.",
      });
    }
    res.status(500).send("Erreur du serveur.");
  }
});

// GET /api/budgets/:budgetId/categories - Récupérer toutes les catégories d'un budget
app.get("/api/budgets/:budgetId/categories", auth, async (req, res) => {
  try {
    // 1. Récupérer les informations
    const { budgetId } = req.params;
    const userId = req.user.id;

    // 2. VÉRIFICATION D'AUTORISATION
    const authCheck = await db.query(
      "SELECT * FROM user_budgets WHERE user_id = $1 AND budget_id = $2",
      [userId, budgetId]
    );

    if (authCheck.rows.length === 0) {
      return res.status(403).json({
        error: "Action non autorisée. Vous n'êtes pas membre de ce budget.",
      });
    }

    // 3. Récupérer les catégories
    const categories = await db.query(
      "SELECT * FROM categories WHERE budget_id = $1",
      [budgetId]
    );

    res.status(200).json(categories.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erreur du serveur.");
  }
});

// --- ROUTES DES TRANSACTIONS (PROTÉGÉES) ---

// POST /api/budgets/:budgetId/transactions - Ajouter une nouvelle transaction
app.post("/api/budgets/:budgetId/transactions", auth, async (req, res) => {
  try {
    // 1. Récupérer les informations
    const { budgetId } = req.params;
    const userId = req.user.id;
    const { category_id, amount, type, description, transaction_date } =
      req.body;

    // 2. VÉRIFICATION D'AUTORISATION (rapide)
    const authCheck = await db.query(
      "SELECT * FROM user_budgets WHERE user_id = $1 AND budget_id = $2",
      [userId, budgetId]
    );
    if (authCheck.rows.length === 0) {
      return res.status(403).json({
        error: "Action non autorisée. Vous n'êtes pas membre de ce budget.",
      });
    }

    // 3. (Optionnel) Vérifier que la catégorie appartient bien à ce budget
    // C'est une bonne pratique pour l'intégrité des données
    if (category_id) {
      const categoryCheck = await db.query(
        "SELECT * FROM categories WHERE id = $1 AND budget_id = $2",
        [category_id, budgetId]
      );
      if (categoryCheck.rows.length === 0) {
        return res
          .status(400)
          .json({ error: "Cette catégorie n'appartient pas à ce budget." });
      }
    }

    // 4. Insérer la transaction
    const newTransaction = await db.query(
      `INSERT INTO transactions 
             (budget_id, user_id, category_id, amount, type, description, transaction_date) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        budgetId,
        userId,
        category_id,
        amount,
        type,
        description,
        transaction_date,
      ]
    );

    res.status(201).json(newTransaction.rows[0]);
  } catch (err) {
    console.error(err.message);
    // Gérer l'erreur de contrainte (ex: type != 'income' ou 'expense')
    if (err.code === "23514") {
      return res.status(400).json({
        error: "Le type de transaction doit être 'income' ou 'expense'.",
      });
    }
    res.status(500).send("Erreur du serveur.");
  }
});

// GET /api/budgets/:budgetId/transactions - Récupérer toutes les transactions d'un budget
app.get("/api/budgets/:budgetId/transactions", auth, async (req, res) => {
  try {
    // 1. Récupérer les informations
    const { budgetId } = req.params;
    const userId = req.user.id;

    // 2. VÉRIFICATION D'AUTORISATION
    const authCheck = await db.query(
      "SELECT * FROM user_budgets WHERE user_id = $1 AND budget_id = $2",
      [userId, budgetId]
    );
    if (authCheck.rows.length === 0) {
      return res.status(403).json({
        error: "Action non autorisée. Vous n'êtes pas membre de ce budget.",
      });
    }

    // 3. Récupérer les transactions
    // On trie par date (les plus récentes en premier)
    const transactions = await db.query(
      `SELECT t.*, u.name as user_name 
             FROM transactions t
             JOIN users u ON t.user_id = u.id
             WHERE t.budget_id = $1 
             ORDER BY t.transaction_date DESC, t.id DESC`,
      [budgetId]
    );

    res.status(200).json(transactions.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erreur du serveur.");
  }
});

// --- ROUTE HISTORIQUE ---
// GET /api/budgets/:budgetId/history - Voir les changements
app.get("/api/budgets/:budgetId/history", auth, async (req, res) => {
  try {
    const { budgetId } = req.params;
    const result = await db.query(
      `SELECT h.*, u.name as user_name 
             FROM history h 
             JOIN users u ON h.user_id = u.id 
             WHERE h.budget_id = $1 
             ORDER BY h.created_at DESC LIMIT 50`,
      [budgetId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur serveur");
  }
});

// --- ROUTES DE MODIFICATION ---

// PUT /api/transactions/:id - Modifier une transaction
app.put("/api/transactions/:id", auth, async (req, res) => {
  const { id } = req.params;
  // On récupère bien 'transaction_date'
  const { description, amount, transaction_date, type, category_id } = req.body;

  const userId = req.user.id;

  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Récupérer l'ancienne transaction
    const oldTxResult = await client.query(
      "SELECT * FROM transactions WHERE id = $1",
      [id]
    );
    if (oldTxResult.rows.length === 0) {
      client.release(); // Important de relâcher ici aussi si on quitte tôt
      return res.status(404).json({ error: "Transaction introuvable" });
    }
    const oldTx = oldTxResult.rows[0];

    // 2. Préparer le message d'historique
    let changes = [];

    // --- CORRECTION SONARQUBE ICI (Number.parseFloat) ---
    if (Number.parseFloat(oldTx.amount) !== Number.parseFloat(amount)) {
      changes.push(`Montant: ${oldTx.amount} -> ${amount}`);
    }

    if (oldTx.description !== description)
      changes.push(`Desc: ${oldTx.description} -> ${description}`);

    const oldDate = new Date(oldTx.transaction_date)
      .toISOString()
      .split("T")[0];
    const newDate = new Date(transaction_date).toISOString().split("T")[0];
    if (oldDate !== newDate) changes.push(`Date: ${oldDate} -> ${newDate}`);

    const historyDetails = changes.join(", ");

    // 3. Mettre à jour
    const updateQuery = `
            UPDATE transactions 
            SET description = $1, amount = $2, transaction_date = $3, type = $4, category_id = $5
            WHERE id = $6 RETURNING *`;

    const updatedTx = await client.query(updateQuery, [
      description,
      amount,
      transaction_date,
      type,
      category_id,
      id,
    ]);

    // 4. Logguer l'historique si nécessaire
    if (changes.length > 0) {
      await logHistory(
        client,
        oldTx.budget_id,
        userId,
        "TRANSACTION",
        id,
        "UPDATE",
        historyDetails
      );
    }

    await client.query("COMMIT");
    res.json(updatedTx.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    // On renvoie du JSON en cas d'erreur
    res.status(500).json({ error: "Erreur lors de la modification" });
  } finally {
    client.release();
  }
});

// PUT /api/budgets/:id - Modifier un budget (Nom/Devise)
app.put("/api/budgets/:id", auth, async (req, res) => {
  const { id } = req.params;
  const { name, currency } = req.body;
  const userId = req.user.id;

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const oldBudget = (
      await client.query("SELECT * FROM budgets WHERE id = $1", [id])
    ).rows[0];

    let changes = [];
    if (oldBudget.name !== name)
      changes.push(`Nom: ${oldBudget.name} -> ${name}`);
    if (oldBudget.currency !== currency)
      changes.push(`Devise: ${oldBudget.currency} -> ${currency}`);

    const updateQuery =
      "UPDATE budgets SET name = $1, currency = $2 WHERE id = $3 RETURNING *";
    const updatedBudget = await client.query(updateQuery, [name, currency, id]);

    if (changes.length > 0) {
      await logHistory(
        client,
        id,
        userId,
        "BUDGET",
        id,
        "UPDATE",
        changes.join(", ")
      );
    }

    await client.query("COMMIT");
    res.json(updatedBudget.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).send("Erreur update budget");
  } finally {
    client.release();
  }
});

// --- SUPPRIMER UN BUDGET ---
app.delete("/api/budgets/:id", auth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // 1. Vérifier que l'utilisateur est bien le PROPRIÉTAIRE (owner)
    const checkOwner = await db.query(
      "SELECT * FROM user_budgets WHERE budget_id = $1 AND user_id = $2 AND role = 'owner'",
      [id, userId]
    );

    if (checkOwner.rows.length === 0) {
      return res
        .status(403)
        .json({ error: "Seul le propriétaire peut supprimer ce budget." });
    }

    // 2. Supprimer le budget
    // Grâce au "ON DELETE CASCADE" dans notre SQL, cela supprimera aussi
    // automatiquement les catégories, transactions et liens utilisateurs associés !
    await db.query("DELETE FROM budgets WHERE id = $1", [id]);

    res.json({ message: "Budget supprimé avec succès." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de la suppression." });
  }
});

// --- MODIFIER UNE CATÉGORIE ---
app.put("/api/categories/:id", auth, async (req, res) => {
  const { id } = req.params;
  const { name, monthly_budget } = req.body;
  const userId = req.user.id;

  try {
    // 1. Récupérer la catégorie pour trouver l'ID du budget
    const catResult = await db.query("SELECT * FROM categories WHERE id = $1", [
      id,
    ]);
    if (catResult.rows.length === 0)
      return res.status(404).json({ error: "Catégorie introuvable" });

    const budgetId = catResult.rows[0].budget_id;

    // 2. Vérifier les droits d'accès au budget
    const authCheck = await db.query(
      "SELECT * FROM user_budgets WHERE user_id = $1 AND budget_id = $2",
      [userId, budgetId]
    );
    if (authCheck.rows.length === 0)
      return res.status(403).json({ error: "Non autorisé" });

    // 3. Mettre à jour
    const updatedCat = await db.query(
      "UPDATE categories SET name = $1, monthly_budget = $2 WHERE id = $3 RETURNING *",
      [name, monthly_budget, id]
    );

    res.json(updatedCat.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de la modification." });
  }
});

// PUT /api/users/profile - Mettre à jour le profil
// PUT /api/users/profile - Mettre à jour le profil
app.put("/api/users/profile", auth, async (req, res) => {
  const userId = req.user.id;
  const { name, phone_number, avatar_url } = req.body;

  try {
    // CORRECTION : Transformer les chaînes vides ("") en NULL
    // Si le champ est vide ou contient juste des espaces, on envoie null à la BDD
    const phoneToSave =
      phone_number && phone_number.trim() !== "" ? phone_number : null;
    const avatarToSave =
      avatar_url && avatar_url.trim() !== "" ? avatar_url : null;

    const query = `
            UPDATE users 
            SET name = $1, phone_number = $2, avatar_url = $3
            WHERE id = $4
            RETURNING id, name, email, phone_number, avatar_url, currency
        `;

    // On utilise nos nouvelles variables '...ToSave'
    const result = await db.query(query, [
      name,
      phoneToSave,
      avatarToSave,
      userId,
    ]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    // Gestion spécifique de l'erreur "Doublon" pour afficher un message clair
    if (err.code === "23505") {
      // Code erreur PostgreSQL pour contrainte unique
      return res.status(400).json({
        error: "Ce numéro de téléphone est déjà utilisé par un autre compte.",
      });
    }
    res.status(500).json({ error: "Erreur lors de la mise à jour du profil." });
  }
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
