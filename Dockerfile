# Step 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files và cài đặt dependencies
COPY package*.json ./
RUN npm ci

# Copy toàn bộ mã nguồn
COPY . .

# Build client và backend server sang dạng production (dist/)
RUN npm run build

# Step 2: Runner stage
FROM node:20-alpine AS runner

WORKDIR /app

# Đặt biến môi trường production
ENV NODE_ENV=production
ENV PORT=8080

# Copy các file package và cài đặt duy nhất dependencies production
COPY package*.json ./
RUN npm ci --only=production

# Copy các sản phẩm đã build từ stage builder
COPY --from=builder /app/dist ./dist

# Mở port 8080 để truy cập bên ngoài
EXPOSE 8080

# Lệnh khởi chạy server (node dist/server.cjs)
CMD ["npm", "start"]
