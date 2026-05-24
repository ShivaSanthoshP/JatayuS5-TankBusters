#!/usr/bin/env bash
# =============================================================================
# ITOps — One-time EC2 setup script (Amazon Linux 2023)
#
# Run this once on a fresh instance as ec2-user:
#   bash setup-ec2.sh
#
# After it completes:
#   1. Edit /opt/itops/backend/.env  (set GEMINI_API_KEY + CORS_ALLOW_ORIGINS)
#   2. Add GitHub Secrets (EC2_HOST, EC2_SSH_PRIVATE_KEY, EC2_USER)
#   3. Push to main → CI/CD deploys the code automatically
#   4. sudo systemctl start itops-backend
# =============================================================================
set -euo pipefail

APP_DIR="/opt/itops"
VENV_DIR="$APP_DIR/venv"
# Detect the calling user whether run with sudo or directly
EC2_USER="${SUDO_USER:-$(whoami)}"

echo "============================================="
echo " ITOps — EC2 Setup  (Amazon Linux 2023)"
echo "============================================="
echo " App directory : $APP_DIR"
echo " Virtualenv    : $VENV_DIR"
echo " Running as    : $EC2_USER"
echo ""

# ── 1. System packages ─────────────────────────────────────────────
echo "[1/7] Installing system packages..."
sudo dnf update -y -q
sudo dnf install -y -q python3.11 python3.11-pip python3.11-devel gcc git nginx \
                       postgresql16 postgresql16-server postgresql16-contrib

# ── 2. App directory structure ─────────────────────────────────────
echo "[2/7] Creating directory structure..."
sudo mkdir -p "$APP_DIR/backend" "$APP_DIR/frontend/dist"
sudo chown -R "$EC2_USER:$EC2_USER" "$APP_DIR"

# ── 3. Python virtual environment ──────────────────────────────────
echo "[3/7] Creating Python virtualenv..."
python3.11 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --quiet --upgrade pip
echo "      Virtualenv ready at $VENV_DIR"

# ── 4. PostgreSQL (local, loopback-only) ───────────────────────────
echo "[4/7] Initialising PostgreSQL..."
DB_USER="itops"
DB_NAME="itops"
DB_CRED_FILE="/etc/itops-db.env"

# Initialise the cluster on first run only.
if [ ! -d /var/lib/pgsql/data/base ]; then
    sudo postgresql-setup --initdb
fi
sudo systemctl enable --now postgresql

# Switch host auth from ident → scram-sha-256 so the app can connect over
# TCP with a password. Loopback only — Postgres still listens on localhost.
PG_HBA=$(sudo -u postgres psql -tAc "SHOW hba_file" | tr -d '[:space:]')
sudo sed -i \
    -e 's|^\(host[[:space:]]\+all[[:space:]]\+all[[:space:]]\+127\.0\.0\.1/32[[:space:]]\+\)ident|\1scram-sha-256|' \
    -e 's|^\(host[[:space:]]\+all[[:space:]]\+all[[:space:]]\+::1/128[[:space:]]\+\)ident|\1scram-sha-256|' \
    "$PG_HBA"
sudo systemctl reload postgresql

# Create role + database (idempotent). Generated password is written to a
# root-only file so re-runs don't rotate it from under a running service.
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
    DB_PASS=$(openssl rand -base64 24 | tr -d '+/=' | cut -c1-32)
    sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
    sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
    DB_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
    echo "DATABASE_URL=${DB_URL}" | sudo tee "$DB_CRED_FILE" > /dev/null
    sudo chmod 600 "$DB_CRED_FILE"
    echo "      Created role '${DB_USER}' and database '${DB_NAME}'."
    echo "      DATABASE_URL saved to $DB_CRED_FILE (root-only)."
else
    echo "      Role '${DB_USER}' already exists — leaving password unchanged."
fi

# ── 5. S3 Files mount for ChromaDB ────────────────────────────────
echo "[5/8] Mounting S3 bucket for ChromaDB storage (S3 Files)..."
CHROMA_S3_BUCKET="${CHROMA_S3_BUCKET:-itops-chromadb-storage}"
CHROMA_S3_REGION="${CHROMA_S3_REGION:-ap-south-1}"
CHROMA_MOUNT="/mnt/s3/itops"

# Install the S3 Files mount helper (Amazon Linux 2023)
sudo dnf install -y -q amazon-s3-files 2>/dev/null || \
    echo "      WARNING: amazon-s3-files package not found — S3 mount skipped. Using local EBS."

if command -v mount.amazon-s3 &>/dev/null || grep -q amazon-s3 /proc/filesystems 2>/dev/null; then
    sudo mkdir -p "$CHROMA_MOUNT"

    if ! mountpoint -q "$CHROMA_MOUNT"; then
        sudo mount -t amazon-s3 "$CHROMA_S3_BUCKET" "$CHROMA_MOUNT" \
            -o "region=$CHROMA_S3_REGION" 2>/dev/null && \
            echo "      Mounted s3://$CHROMA_S3_BUCKET → $CHROMA_MOUNT" || \
            echo "      WARNING: S3 mount failed. Ensure the EC2 IAM role has s3:GetObject/PutObject on $CHROMA_S3_BUCKET. ChromaDB will fall back to local disk."
    else
        echo "      $CHROMA_MOUNT already mounted."
    fi

    # Persist across reboots
    if ! grep -q "$CHROMA_S3_BUCKET" /etc/fstab; then
        echo "$CHROMA_S3_BUCKET $CHROMA_MOUNT amazon-s3 _netdev,region=$CHROMA_S3_REGION 0 0" | \
            sudo tee -a /etc/fstab > /dev/null
        echo "      Added fstab entry for persistent mount."
    fi

    # Inject CHROMA_PERSIST_DIR into the app .env (idempotent)
    APP_ENV="$APP_DIR/backend/.env"
    CHROMA_DIR="$CHROMA_MOUNT/chroma_db"
    if [ -f "$APP_ENV" ] && ! grep -q "CHROMA_PERSIST_DIR" "$APP_ENV"; then
        echo "CHROMA_PERSIST_DIR=$CHROMA_DIR" >> "$APP_ENV"
        echo "      Set CHROMA_PERSIST_DIR=$CHROMA_DIR in .env"
    fi
fi

# ── 6. Nginx ───────────────────────────────────────────────────────
echo "[6/8] Configuring nginx..."

# Remove the default server block that ships with nginx on AL2023
sudo rm -f /etc/nginx/conf.d/default.conf

sudo tee /etc/nginx/conf.d/itops.conf > /dev/null << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    # Serve the built React app
    root /opt/itops/frontend/dist;
    index index.html;

    # gzip the chatty payloads — JS/CSS/JSON drop ~70% over the wire.
    gzip on;
    gzip_vary on;
    gzip_min_length 256;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_types
        application/javascript
        application/json
        application/xml
        application/xml+rss
        application/wasm
        image/svg+xml
        text/css
        text/javascript
        text/plain
        text/xml;

    # WebSocket — live metrics stream
    location /ws/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # REST API
    location /api/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout    120s;
        proxy_connect_timeout  10s;
        proxy_send_timeout    120s;
    }

    # FastAPI built-in endpoints
    location ~ ^/(docs|redoc|openapi\.json|health)$ {
        proxy_pass       http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }

    # Hashed Vite assets — Cache forever (filenames are content-hashed).
    location /assets/ {
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # React Router fallback — serve index.html for all client-side routes
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINXEOF

sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
echo "      Nginx configured and started."

# ── 6. systemd service ─────────────────────────────────────────────
echo "[7/8] Creating systemd service (itops-backend)..."

# The heredoc delimiter is unquoted so $APP_DIR/$VENV_DIR/$EC2_USER expand.
# Two EnvironmentFile lines: the second (DB creds) is required, but we mark
# it optional with a leading "-" so the unit still starts if it's missing
# (e.g. dev box). DATABASE_URL set there overrides the one in .env.
sudo tee /etc/systemd/system/itops-backend.service > /dev/null << SVCEOF
[Unit]
Description=ITOps Backend (FastAPI / Uvicorn)
After=network.target postgresql.service
Wants=postgresql.service
RequiresMountsFor=/mnt/s3/itops

[Service]
Type=simple
User=$EC2_USER
Group=$EC2_USER
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=$APP_DIR/backend/.env
EnvironmentFile=-$DB_CRED_FILE
Environment=PYTHONUNBUFFERED=1
Environment=PYTHONDONTWRITEBYTECODE=1
ExecStart=$VENV_DIR/bin/uvicorn app.main:app \\
    --host 127.0.0.1 \\
    --port 8000 \\
    --workers 1 \\
    --log-level info
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=itops-backend

[Install]
WantedBy=multi-user.target
SVCEOF

sudo systemctl daemon-reload
sudo systemctl enable itops-backend
echo "      Service registered. Will start after first deploy."

# ── 7. Sudoers — allow ec2-user to restart services without password
# GitHub Actions SSHs in as ec2-user and needs to restart services.
echo "[8/8] Configuring passwordless sudo for service management..."
sudo tee /etc/sudoers.d/itops > /dev/null << SUDOEOF
$EC2_USER ALL=(ALL) NOPASSWD: \
  /usr/bin/systemctl restart itops-backend, \
  /usr/bin/systemctl start itops-backend, \
  /usr/bin/systemctl stop itops-backend, \
  /usr/bin/systemctl status itops-backend, \
  /usr/bin/systemctl reload nginx, \
  /usr/bin/systemctl daemon-reload, \
  /usr/bin/nginx -t, \
  /usr/bin/cp /opt/itops/deployment/nginx.conf /etc/nginx/conf.d/itops.conf
SUDOEOF
sudo chmod 440 /etc/sudoers.d/itops
echo "      Sudoers rule written."

# ── Create .env from sample if it doesn't exist ────────────────────
# DATABASE_URL is intentionally NOT set here — it lives in /etc/itops-db.env
# (root-only) and is loaded by the systemd unit as a second EnvironmentFile.
if [ ! -f "$APP_DIR/backend/.env" ]; then
    cat > "$APP_DIR/backend/.env" << 'ENVEOF'
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key-here
GEMINI_MODEL=gemini-2.5-flash

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# Replace with your EC2 public IP or domain
CORS_ALLOW_ORIGINS=http://YOUR_EC2_PUBLIC_IP

# DATABASE_URL — leave commented; systemd loads it from /etc/itops-db.env.
# Override here only for ad-hoc dev runs (e.g. `python -m app.main`).
# DATABASE_URL=postgresql://itops:PASSWORD@localhost:5432/itops

SIMULATOR_INTERVAL_SECONDS=10
NUM_SIMULATED_SERVERS=6
ANOMALY_PROBABILITY=0.15
AGENT_TEMPERATURE=0.1
PIPELINE_MAX_CONCURRENT=4
ENVEOF
fi

# ── Done ───────────────────────────────────────────────────────────
PUBLIC_IP=$(curl -sf http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "<your-ec2-ip>")

echo ""
echo "============================================="
echo " Setup complete!"
echo "============================================="
echo ""
echo " NEXT STEPS:"
echo ""
echo " 1. Edit your .env file:"
echo "      nano $APP_DIR/backend/.env"
echo "    → Set GEMINI_API_KEY=<your key>"
echo "    → Set CORS_ALLOW_ORIGINS=http://$PUBLIC_IP"
echo ""
echo " 2. Add these 3 secrets to your GitHub repo:"
echo "    Settings → Secrets → Actions → New repository secret"
echo "      EC2_HOST              = $PUBLIC_IP"
echo "      EC2_USER              = $EC2_USER"
echo "      EC2_SSH_PRIVATE_KEY   = <contents of your .pem key file>"
echo ""
echo " 3. EC2 Security Group — ensure inbound rules allow:"
echo "      Port 22   (SSH)   — your IP"
echo "      Port 80   (HTTP)  — 0.0.0.0/0"
echo ""
echo " 4. (Optional) Migrate existing SQLite data into PostgreSQL:"
echo "      scp old-itops.db ec2-user@$PUBLIC_IP:/tmp/itops.db"
echo "      sudo -E env DATABASE_URL=\$(sudo cat /etc/itops-db.env | cut -d= -f2-) \\"
echo "          $VENV_DIR/bin/python -m scripts.migrate_sqlite_to_postgres \\"
echo "          --source sqlite:////tmp/itops.db"
echo ""
echo " 5. Push to main → GitHub Actions deploys the app."
echo ""
echo " 6. After the first deploy, the service starts automatically."
echo "    Check with: sudo systemctl status itops-backend"
echo "    Logs with:  sudo journalctl -u itops-backend -f"
echo "    Postgres:   sudo systemctl status postgresql"
echo ""
echo " App URL: http://$PUBLIC_IP"
echo " API docs: http://$PUBLIC_IP/docs"
echo "============================================="
