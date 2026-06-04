# Hermes — minimal Railway-ready image. Not built/deployed automatically.
FROM node:20-alpine

WORKDIR /app
COPY package.json ./
# No deps yet (pure fetch). If you add deps, also COPY package-lock.json + npm ci.
RUN npm install --omit=dev || true

COPY . .

# Telegram control loop. The nightly dream runs via `npm run dream` (cron).
CMD ["node", "index.js"]
