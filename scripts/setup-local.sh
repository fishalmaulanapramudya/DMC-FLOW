#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
ENV_FILE="$BACKEND_DIR/.env"

printf '\nDMC FLOW / D-PAY local setup — PostgreSQL existing database\n'
printf 'This script does not create or drop a database and does not alter public.users.\n'
printf 'D-Pay tables will be created in the isolated schema: dpay\n\n'

read -r -p 'PostgreSQL host [127.0.0.1]: ' DB_HOST
DB_HOST="${DB_HOST:-127.0.0.1}"
read -r -p 'PostgreSQL port [5432]: ' DB_PORT
DB_PORT="${DB_PORT:-5432}"
read -r -p 'PostgreSQL user [fishal]: ' DB_USER
DB_USER="${DB_USER:-fishal}"
read -r -p 'Existing database [lms_fishal]: ' DB_NAME
DB_NAME="${DB_NAME:-lms_fishal}"
read -r -s -p 'Password for PostgreSQL user: ' DB_PASSWORD
printf '\n'
if [[ -z "$DB_PASSWORD" ]]; then
  printf 'Password cannot be empty.\n' >&2
  exit 1
fi

# URL-encode the password so characters such as @, :, /, and # remain valid.
ENCODED_PASSWORD="$(printf '%s' "$DB_PASSWORD" | node -e 'let value="";process.stdin.on("data",chunk=>value+=chunk);process.stdin.on("end",()=>process.stdout.write(encodeURIComponent(value)))')"
JWT_SECRET="$(openssl rand -hex 32 2>/dev/null || node -e 'process.stdout.write(require("node:crypto").randomBytes(48).toString("hex"))')"

umask 077
cat > "$ENV_FILE" <<ENV
NODE_ENV=development
PORT=8000
FRONTEND_URL=http://localhost:5173,http://127.0.0.1:5173
DATABASE_URL=postgresql://${DB_USER}:${ENCODED_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=8h
BCRYPT_ROUNDS=12
DATABASE_SSL=false
ENV
unset DB_PASSWORD ENCODED_PASSWORD JWT_SECRET
chmod 600 "$ENV_FILE"
cp "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env.local"

printf '\nCreated backend/.env with permissions 600 and frontend/.env.local. Secrets are not printed.\n'
printf 'Next, install dependencies in backend/ and frontend/, then run npm run db:init in backend/.\n'
printf 'Important: the PostgreSQL user must be allowed to create a schema in the existing database.\n\n'
