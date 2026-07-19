# Public landing service only. SERA Core is deliberately not included here.
FROM node:22-bookworm-slim

WORKDIR /app

# Install the root runtime because Reception shares its TypeScript source with
# src/reception while keeping its own public HTTP entry point.
COPY package.json package-lock.json ./
RUN npm ci

COPY src/reception ./src/reception
COPY sera-reception ./sera-reception

RUN npm --prefix sera-reception run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "run", "start:reception"]
