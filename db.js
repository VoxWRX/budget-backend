const { Pool } = require("pg");
require("dotenv").config();

// Configuration de la connexion
const dbConfig = process.env.DATABASE_URL
  ? {
      // Si on est sur Render (Production)
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false, // <--- C'EST LA LIGNE MAGIQUE OBLIGATOIRE POUR NEON
      },
    }
  : {
      // Si on est en local (Développement)
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_DATABASE,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    };

const pool = new Pool(dbConfig);

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool: pool,
};
