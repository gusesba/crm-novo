FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/whatsapp/package.json apps/whatsapp/
RUN npm ci
COPY apps/whatsapp apps/whatsapp
RUN npm run build -w apps/whatsapp
FROM node:22-bookworm-slim
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/whatsapp/package.json ./apps/whatsapp/package.json
COPY --from=build /repo/apps/whatsapp/dist ./apps/whatsapp/dist
WORKDIR /repo/apps/whatsapp
RUN mkdir data && chown -R node:node data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3080
EXPOSE 3080
CMD ["node", "dist/server.js"]
