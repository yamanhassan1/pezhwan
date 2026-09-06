FROM nginx:alpine

# PEZHWAN TLS-terminating reverse proxy. Serves on 443 with a runtime-mounted
# certificate bundle (/etc/nginx/certs/tls.crt + tls.key) and redirects HTTP.
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443