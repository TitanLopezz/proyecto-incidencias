#!/bin/bash
# Run as root on the application EC2 through Session Manager.
set -euo pipefail
umask 077

region=${1:?Indica la región AWS}
secret_arn=${2:?Indica AppSecretArn}
cd /opt/incidencias

staged=$(mktemp secrets/.app.XXXXXX)
trap 'rm -f -- "$staged"' EXIT
aws secretsmanager get-secret-value --region "$region" --secret-id "$secret_arn" \
  --query SecretString --output text > "$staged"

jq -e '
  (.DB_PASSWORD | type == "string" and length > 0)
  and ((.TELEGRAM_INTEGRATION_KEY // "") | type == "string" and (length == 0 or utf8bytelength >= 32))
  and ((.TELEGRAM_BOT_TOKEN // "") | type == "string" and (length == 0 or test("^[0-9]+:[A-Za-z0-9_-]+$")))
  and ((.TELEGRAM_BOT_TOKEN // "") == "" or ((.TELEGRAM_INTEGRATION_KEY // "") | utf8bytelength >= 32))
' "$staged" >/dev/null

chown root:1000 "$staged"
chmod 640 "$staged"
mv -f -- "$staged" secrets/app.json
docker compose -f compose.production.json up -d --force-recreate --wait --wait-timeout 90 backend frontend
curl --fail --silent --show-error http://127.0.0.1:8080/ready
