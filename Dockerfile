FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .
RUN npm run build

EXPOSE 8080

CMD ["npm", "run", "start"]
