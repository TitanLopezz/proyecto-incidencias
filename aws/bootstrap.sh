#!/bin/bash
# Variables are injected by CloudFormation. Do not enable shell tracing.
set -euo pipefail
umask 027
dnf install -y docker jq awscli2
systemctl enable --now docker
install -d -m 755 /usr/local/lib/docker/cli-plugins
curl -fsSL --retry 5 "https://github.com/docker/compose/releases/download/v2.39.4/docker-compose-linux-x86_64" -o /usr/local/lib/docker/cli-plugins/docker-compose
curl -fsSL --retry 5 "https://github.com/docker/compose/releases/download/v2.39.4/docker-compose-linux-x86_64.sha256" -o /tmp/compose.sha256
printf '%s  %s\n' "$(cut -d ' ' -f 1 /tmp/compose.sha256)" /usr/local/lib/docker/cli-plugins/docker-compose | sha256sum --check --status
chmod 755 /usr/local/lib/docker/cli-plugins/docker-compose

# Select the exact attached EBS volume by serial, never by enumeration order.
serial="${PHOTO_VOLUME//-/}"
device=''
for attempt in $(seq 1 120); do
  device=$(lsblk -dn -o PATH,SERIAL | awk -v serial="$serial" '$2 == serial {print $1}')
  if [ -n "$device" ]; then break; fi
  sleep 5
done
test -b "$device"
if ! blkid "$device" >/dev/null 2>&1; then mkfs.ext4 "$device"; fi
test "$(blkid -s TYPE -o value "$device")" = ext4
install -d -m 755 /srv/incidencias
uuid=$(blkid -s UUID -o value "$device")
grep -q "UUID=$uuid " /etc/fstab || printf 'UUID=%s /srv/incidencias ext4 defaults 0 2\n' "$uuid" >> /etc/fstab
mountpoint -q /srv/incidencias || mount /srv/incidencias
install -d -m 750 -o 1000 -g 1000 /srv/incidencias/photos
install -d -m 750 -o root -g 1000 /opt/incidencias/secrets
cd /opt/incidencias

fetch_secret() {
  aws secretsmanager get-secret-value --region "$AWS_REGION" --secret-id "$1" --query SecretString --output text > "secrets/$2.json"
  chown root:1000 "secrets/$2.json"
  chmod 640 "secrets/$2.json"
}
fetch_secret "$APP_SECRET" app
fetch_secret "$JWT_SECRET_ARN" jwt
fetch_secret "$RDS_SECRET" rds
fetch_secret "$ADMIN_ONE_SECRET" admin-one
fetch_secret "$ADMIN_TWO_SECRET" admin-two
curl -fsSL --retry 5 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o secrets/rds-ca.pem
chmod 644 secrets/rds-ca.pem

# This block is replaced by build-template.cjs with the production Compose file.
__COMPOSE_FILE__
printf 'BACKEND_IMAGE=%s\nFRONTEND_IMAGE=%s\nDB_HOST=%s\nDOMAIN_NAME=%s\n' "$BACKEND_IMAGE" "$FRONTEND_IMAGE" "$DB_HOST" "$DOMAIN_NAME" > .env
chmod 600 .env
registry="${BACKEND_IMAGE%%/*}"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$registry"
docker compose -f compose.production.json pull

# Run migrations and bootstrap accounts as separate jobs with temporary master access.
for attempt in $(seq 1 30); do
  if docker compose -f compose.production.json run --rm --no-deps \
    -v /opt/incidencias/secrets/rds.json:/run/incidencias/rds.json:ro backend migrate; then break; fi
  if [ "$attempt" = 30 ]; then exit 1; fi
  sleep 10
done
docker compose -f compose.production.json run --rm --no-deps \
  -v /opt/incidencias/secrets/rds.json:/run/incidencias/rds.json:ro \
  -v /opt/incidencias/secrets/admin-one.json:/run/incidencias/admin-one.json:ro \
  -v /opt/incidencias/secrets/admin-two.json:/run/incidencias/admin-two.json:ro backend seed
# No master/admin password files remain on the application host after bootstrap.
rm -f secrets/rds.json secrets/admin-one.json secrets/admin-two.json

cat > /etc/systemd/system/incidencias.service <<'SERVICE'
[Unit]
Description=Incidencias web application
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target
RequiresMountsFor=/srv/incidencias

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/incidencias
ExecStartPre=/usr/bin/mountpoint -q /srv/incidencias
ExecStart=/usr/bin/docker compose -f compose.production.json up -d --wait --wait-timeout 180
ExecStop=/usr/bin/docker compose -f compose.production.json stop
TimeoutStartSec=240
TimeoutStopSec=90

[Install]
WantedBy=multi-user.target
SERVICE
systemctl daemon-reload
systemctl enable --now incidencias
curl --fail --retry 12 --retry-delay 5 --retry-all-errors http://127.0.0.1:8080/ready
echo 'Incidencias preparada; confirma HTTPS y DNS antes de abrir el sitio.'
