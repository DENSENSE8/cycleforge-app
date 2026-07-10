#!/bin/bash
# Send a message to the configured Telegram home channel via the Hermes-stored bot token.
EP=/home/avion/.hermes/profiles/prometheus/.env
T=$(grep '^TELEGRAM_BOT_TOKEN=' "$EP" | cut -d= -f2- | tr -d '\r\n')
CH=$(grep '^TELEGRAM_HOME_CHANNEL=' "$EP" | cut -d= -f2- | tr -d '\r\n')
MSG="$1"
echo "sending to chat_id=$CH ..."
curl -s "https://api.telegram.org/bot${T}/sendMessage" \
  --data-urlencode "chat_id=${CH}" \
  --data-urlencode "text=${MSG}" | head -c 500
echo ""
