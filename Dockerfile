FROM node:24-alpine

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["sh", "-c", "npm run db:migrate && (npm run db:seed || echo 'Seed data not mounted; starting with an empty database') && npm start"]
