#!/bin/bash
# Telegram bot liveness check — reads the token from the Hermes SoT.
EP=/home/avion/.hermes/profiles/prometheus/.env
T=$(grep '^TELEGRAM_BOT_TOKEN=' "$EP" | cut -d= -f2- | tr -d '\r\n')
echo "token length: ${#T}"
case "$T" in
  *:*) echo "format: has colon (looks like a bot token)";;
  *)   echo "format: NO colon (placeholder or invalid)";;
esac
echo "--- getMe ---"
curl -s "https://api.telegram.org/bot${T}/getMe"
echo ""
echo "--- allowed users / home channel (presence only) ---"
grep -E '^TELEGRAM_(ALLOWED_USERS|HOME_CHANNEL)=' "$EP" | sed 's/=.*/= (set)/'
