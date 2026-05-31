#!/bin/bash

# Script to configure Goldsky Webhook programmatically
# Requires GOLDSKY_API_KEY to be set or `goldsky login` to have been run.

SUBGRAPH_NAME="dd-deposits-subgraph/v0.0.2" # Update version as needed, or use "current" if supported
WEBHOOK_NAME="supabase-deposits-test"
PROJECT_REF="<YOUR_SUPABASE_PROJECT_REF>" # Replace or pass as arg
WEBHOOK_URL="https://$PROJECT_REF.supabase.co/functions/v1/goldsky-deposits"
SECRET="<YOUR_SECRET>" # Replace or pass as arg

if [ -z "$1" ]; then
  echo "Usage: $0 <project_ref> <secret> [version]"
  echo "Example: $0 abcdefghijklm mysecret v0.0.2"
  exit 1
fi

PROJECT_REF=$1
SECRET=$2
VERSION=${3:-"v0.0.2"}
WEBHOOK_URL="https://$PROJECT_REF.supabase.co/functions/v1/goldsky-deposits"
SUBGRAPH_FULL_NAME="dd-deposits-subgraph/$VERSION"

echo "🔧 Configuring Goldsky Webhook..."
echo "   Subgraph: $SUBGRAPH_FULL_NAME"
echo "   URL:      $WEBHOOK_URL"
echo "   Name:     $WEBHOOK_NAME"

# Ensure CLI is installed
if ! command -v goldsky &> /dev/null; then
    echo "❌ goldsky CLI not found. Please run: npm install -g @goldskycom/cli"
    exit 1
fi

# Create/Update Webhook
# Note: Goldsky CLI syntax for webhooks is roughly:
# goldsky subgraph webhook create <name> --subgraph <subgraph> ...
# If it exists, we might need to delete or update.

echo "🚀 Creating webhook..."
goldsky subgraph webhook create "$WEBHOOK_NAME" \
  --subgraph "$SUBGRAPH_FULL_NAME" \
  --url "$WEBHOOK_URL" \
  --secret "$SECRET" \
  --entity "Deposit" \
  --op "INSERT" \
  --headers "Content-Type=application/json"

echo "✅ Done! Check Goldsky dashboard to verify."

