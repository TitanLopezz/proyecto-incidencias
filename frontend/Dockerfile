FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html ./
COPY scripts ./scripts
COPY vite.config.js ./
COPY src ./src
COPY public ./public

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
ARG VITE_MAP_DEFAULT_LATITUDE=19.4326
ARG VITE_MAP_DEFAULT_LONGITUDE=-99.1332
ENV VITE_MAP_DEFAULT_LATITUDE=${VITE_MAP_DEFAULT_LATITUDE}
ENV VITE_MAP_DEFAULT_LONGITUDE=${VITE_MAP_DEFAULT_LONGITUDE}
RUN npm run build

FROM nginx:stable-alpine@sha256:583b7f2fce1cdb8da5ad5c39ebd3c33b98b87d493190e548bdee1fa8c619c311
ENV BACKEND_UPSTREAM=backend:3000
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
