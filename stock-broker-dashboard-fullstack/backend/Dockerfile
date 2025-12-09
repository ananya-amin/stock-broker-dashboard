########################
# BUILD STAGE
########################
FROM node:20-alpine AS build

WORKDIR /app

# Native deps for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build


########################
# RUNTIME STAGE
########################
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

# ✅ Create sqlite directory
RUN mkdir -p /app/data

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# ✅ copy compiled JS only
COPY --from=build /app/dist ./dist

EXPOSE 4000

CMD ["node", "dist/server.js"]
