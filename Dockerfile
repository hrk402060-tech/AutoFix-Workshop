FROM node:22-alpine AS web-build
WORKDIR /src/web
COPY web/package*.json ./
RUN npm install
COPY web ./
RUN npm run build

FROM node:22-alpine AS api-build
WORKDIR /src/backend
COPY backend/package*.json ./
RUN npm install
COPY backend ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY --from=api-build /src/backend/dist ./dist
COPY --from=web-build /src/web/dist ./web-dist
RUN mkdir -p /app/data /app/uploads
EXPOSE 3000
CMD ["node", "dist/main.js"]
