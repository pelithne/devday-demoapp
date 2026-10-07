FROM nginxinc/nginx-unprivileged:1.29-alpine
USER root
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html styles.css app.js /usr/share/nginx/html/
ARG RELEASE_VERSION=local
RUN printf '{"release":"%s"}\n' "$RELEASE_VERSION" > /usr/share/nginx/html/release.json
USER 101:101
EXPOSE 8080
