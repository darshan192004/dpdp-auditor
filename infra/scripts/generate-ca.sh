#!/usr/bin/env bash
# Generates the private CA and the internal-only TLS certificate for
# dpdpa.pride.improwised.dev, then creates/updates Secret dpdpa-tls in namespace
# dpdpa. Generated keys are gitignored and must never be committed.
#
# Usage:
#   KUBECONFIG=/etc/rancher/k3s/k3s.yaml bash infra/scripts/generate-ca.sh
#   FORCE=1 ...   # regenerate an existing CA (requires re-distribution)
set -euo pipefail

HOSTNAME="${DPDPA_HOSTNAME:-dpdpa.pride.improwised.dev}"
CERT_DIR="${DPDPA_CERT_DIR:-infra/certs}"
CA_SUBJECT="/CN=DPDPA Internal Pilot CA/O=Improwised/OU=Internal Platform"
SERVER_SUBJECT="/CN=${HOSTNAME}/O=Improwised/OU=Internal Platform"
CA_DAYS=3650
SERVER_DAYS=825
NAMESPACE="dpdpa"
SECRET_NAME="dpdpa-tls"

mkdir -p "$CERT_DIR"
chmod 700 "$CERT_DIR"

if [[ -f "$CERT_DIR/ca.crt" && "${FORCE:-0}" != "1" ]]; then
  echo "CA already exists at $CERT_DIR/ca.crt; set FORCE=1 to rotate."
else
  echo "==> Generating CA (RSA 4096, ${CA_DAYS} days)"
  openssl genrsa -out "$CERT_DIR/ca.key" 4096
  openssl req -x509 -new -nodes -key "$CERT_DIR/ca.key" -sha384 \
    -days "$CA_DAYS" -subj "$CA_SUBJECT" -out "$CERT_DIR/ca.crt"
fi

echo "==> Issuing server certificate for $HOSTNAME"
cat >"$CERT_DIR/server.ext" <<EOF
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:${HOSTNAME}
EOF
openssl genrsa -out "$CERT_DIR/dpdpa.key" 4096
openssl req -new -key "$CERT_DIR/dpdpa.key" -subj "$SERVER_SUBJECT" \
  -out "$CERT_DIR/dpdpa.csr"
openssl x509 -req -in "$CERT_DIR/dpdpa.csr" \
  -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" -CAcreateserial \
  -out "$CERT_DIR/dpdpa.crt" -days "$SERVER_DAYS" -sha384 \
  -extfile "$CERT_DIR/server.ext"
rm -f "$CERT_DIR/dpdpa.csr" "$CERT_DIR/ca.srl" "$CERT_DIR/server.ext"
chmod 600 "$CERT_DIR/ca.key" "$CERT_DIR/dpdpa.key"

echo "==> Creating Secret ${NAMESPACE}/${SECRET_NAME}"
kubectl -n "$NAMESPACE" create secret tls "$SECRET_NAME" \
  --cert="$CERT_DIR/dpdpa.crt" --key="$CERT_DIR/dpdpa.key" \
  --dry-run=client -o yaml | kubectl apply -f -

sha256sum "$CERT_DIR/ca.crt" | tee "$CERT_DIR/CA_FINGERPRINT.txt"
echo "Distribute $CERT_DIR/ca.crt to internal clients; it is the only trust anchor."
