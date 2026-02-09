#!/bin/sh
# Generate runtime config from environment variables
cat > /usr/share/nginx/html/config.js << EOF
window.__RUNTIME_CONFIG__ = {
  API_URL: "${API_URL:-}",
  MAX_UPLOAD_MB: "${MAX_UPLOAD_MB:-}"
};
EOF

# Start nginx
exec nginx -g "daemon off;"
