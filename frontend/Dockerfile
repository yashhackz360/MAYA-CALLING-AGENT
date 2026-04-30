# ─── MantaRay AI Frontend — Multi-Stage Dockerfile ───────────────────────────

# Stage 1: Build
FROM node:20-alpine AS builder

LABEL maintainer="MantaRay AI Team"
LABEL description="Real Estate AI Calling Agent — React Frontend"

WORKDIR /app

# Copy package files first (layer caching)
COPY package*.json ./

# Install dependencies
RUN npm ci --silent

# Copy source
COPY . .

# Build-time env for API URL (empty = use nginx proxy relative paths)
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

# Build for production
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine AS production

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
