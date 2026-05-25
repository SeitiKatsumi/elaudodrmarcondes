FROM node:20-bookworm-slim

ENV NODE_ENV=production
ENV PORT=80
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/data /app/uploads

EXPOSE 80

CMD ["npm", "start"]
