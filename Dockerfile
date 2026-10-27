FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json LICENSE ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
# Runs as root: the .env on the host is root-only (600) and is mounted read-only.
# Settings (SQLite) and the uploaded background live in /data, a volume.
ENV DATA_DIR=/data
EXPOSE 8080
CMD ["node", "src/server.js"]
