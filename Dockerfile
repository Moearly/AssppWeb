# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-build
RUN apk add --no-cache python3 make g++
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Stage 3: Runtime
FROM node:20-alpine
RUN apk add --no-cache zip python3 make g++
WORKDIR /app
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/package.json ./
COPY --from=backend-build /app/backend/src/db/schema.sql ./dist/db/
COPY --from=frontend-build /app/frontend/dist ./public

# 先复制 node_modules（但不包括 better-sqlite3）
COPY --from=backend-build /app/backend/node_modules ./node_modules

# 在运行时环境重新安装 better-sqlite3（确保 native 模块正确编译）
# 这会覆盖从 backend-build 复制的错误版本
RUN npm install better-sqlite3@11.8.1

RUN mkdir -p /data/packages
EXPOSE 8080
ENV DATA_DIR=/data PORT=8080
CMD ["node", "dist/index.js"]
