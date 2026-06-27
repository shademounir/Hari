# Dev-oriented image. For a production build use a multi-stage `next build` instead.
FROM node:22-alpine

WORKDIR /app

# Copy manifests + Prisma schema first (better layer caching). The schema must
# be present BEFORE `npm install` because the postinstall hook runs
# `prisma generate`, which needs prisma/schema.prisma.
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install

# Copy the rest of the source (overlaid by the bind-mount in docker-compose).
COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]
