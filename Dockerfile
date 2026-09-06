# Production Dockerfile for LitSphere Literature Review System
FROM node:22-bookworm-slim

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Install dependencies first for better caching
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application code
COPY . .

# Ensure data and uploads directories exist with proper permissions
RUN mkdir -p /app/data /app/uploads /app/Backend/uploads

# Expose server port
EXPOSE 3000

# Start server
CMD ["node", "Backend/server.js"]
