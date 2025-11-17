# Stage 1: Build the application
FROM node:alpine AS app
WORKDIR /app
# Copy package.json and package-lock.json
COPY package*.json package-lock.json ./
# Install dependencies
RUN npm install
# Copy the rest of the application code
COPY . .
# Build the application
RUN npm run build
# Stage 2: Serve the application with Caddy
FROM caddy:alpine
# Copy the built application from the previous stage
COPY --from=app /app/dist /usr/share/caddy
COPY caddyfile /etc/caddy/Caddyfile
RUN setcap -r /usr/bin/caddy