# Serves the Wasp client build (landing page and the rest of the public/unauthenticated UI).
# `deploy/deploy.sh` copies the build into ./build before deploying.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY build /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
