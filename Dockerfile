# On part d'une image Node.js légère
FROM node:18-alpine

# On crée un dossier de travail
WORKDIR /app

# On copie les fichiers de dépendances
COPY package*.json ./

# On installe les dépendances
RUN npm install --production

# On copie tout le reste du code
COPY . .

# On expose le port (Cloud Run utilise le port 8080 par défaut ou la variable PORT)
ENV PORT=8080
EXPOSE 8080

# La commande pour démarrer
CMD ["npm", "start"]