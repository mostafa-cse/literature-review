# Production Dockerfile for LitSphere Literature Review System
FROM node:22-bookworm-slim

# Install OpenSSL (required by Prisma engine on Debian)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Install dependencies first for better caching
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

# Generate Prisma Client at build time
RUN npx prisma generate

# Copy application code
COPY . .

# Ensure data and uploads directories exist with proper permissions
RUN mkdir -p /app/data /app/uploads /app/Backend/uploads

# Expose server port
EXPOSE 3000

# Start server (Prisma client is pre-generated at build time)
CMD ["node", "--no-warnings", "Backend/server.js"]

