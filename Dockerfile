FROM node:22-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run expo:static:build && npm run server:build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/server_dist ./server_dist
COPY --from=build /app/static-build ./static-build
COPY --from=build /app/server ./server
COPY --from=build /app/assets ./assets
COPY --from=build /app/app.json ./app.json

EXPOSE 5000
CMD ["node", "server_dist/index.js"]
