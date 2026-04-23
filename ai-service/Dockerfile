FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --prefer-offline

COPY tsconfig.json ./
COPY src ./src

EXPOSE 3001

CMD ["npm", "run", "start"]
