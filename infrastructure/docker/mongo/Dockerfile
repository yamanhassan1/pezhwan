# PEZHWAN — MongoDB 7 replica-set node.
#
# Customises the official mongo:7 image with the pezhwan mongod.conf, replica-set
# init script, and a lightweight seed script for initial database bootstrap.
# Used only for development; production Kubernetes StatefulSet mounts configs
# via ConfigMaps.

FROM mongo:7

RUN mkdir -p /etc/mongo /scripts

COPY mongod.conf /etc/mongo/mongod.conf
COPY init.js /docker-entrypoint-initdb.d/init.js
COPY seed.js /docker-entrypoint-initdb.d/seed.js

EXPOSE 27017
