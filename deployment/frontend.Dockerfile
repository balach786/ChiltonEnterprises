# Builds the React app and serves it from nginx, which also proxies /api to the API service.
# Build context must be the repository root:
#   docker build -f deployment/frontend.Dockerfile -t showroom-web .
FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# API origin baked into the bundle. Leave it empty to call same-origin /api, which nginx
# forwards to the API service - no secrets are ever placed in frontend code.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY deployment/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
