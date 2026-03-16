#!/bin/bash
# ============================================
# CocoCash Wallet MS - API Testing Commands
# ============================================
# Uses the ECS service endpoint

# Get the task's public IP
# Run: aws ecs list-tasks --cluster cococash-wallet-cluster --service-name cococash-wallet
# Then: aws ecs describe-tasks --cluster cococash-wallet-cluster --tasks <task-arn>
# Get the networkInterfaceId, then:
# aws ec2 describe-network-interfaces --network-interface-ids <eni-id>
# The publicIp will be your API_URL

# SET THIS TO YOUR ECS TASK PUBLIC IP
API_URL="${WALLET_API_URL:-http://52.3.131.223:3000}"

echo "Using API URL: $API_URL"
echo ""

# ============================================
# Health Check
# ============================================
echo "=== Health Check ==="
curl -s "$API_URL/health"
echo -e "\n"

# ============================================
# RF-04: Create Account
# ============================================
echo "=== Create Account (RF-04) ==="
ACCOUNT=$(curl -s -X POST "$API_URL/accounts" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "'$(uuidgen | tr '[:upper:]' '[:lower:]')'",
    "initialBalance": 1000
  }')
echo $ACCOUNT
ACCOUNT_ID=$(echo $ACCOUNT | grep -oP '"id":"[^"]+' | cut -d'"' -f4 || echo "")
echo -e "\n"

# ============================================
# RF-06: Query Balance
# ============================================
if [ -n "$ACCOUNT_ID" ]; then
  echo "=== Query Balance (RF-06) ==="
  curl -s "$API_URL/accounts/$ACCOUNT_ID/balance"
  echo -e "\n"
fi

# ============================================
# Complete Transfer Flow Demo
# ============================================
demo_transfer() {
  echo "=== COMPLETE TRANSFER FLOW DEMO ==="
  
  echo "Creating source account..."
  SOURCE=$(curl -s -X POST "$API_URL/accounts" \
    -H "Content-Type: application/json" \
    -d '{"userId": "'$(uuidgen | tr '[:upper:]' '[:lower:]')'", "initialBalance": 5000}')
  SOURCE_ID=$(echo $SOURCE | grep -oP '"id":"[^"]+' | cut -d'"' -f4)
  echo "Source: $SOURCE_ID"
  
  echo "Creating destination account..."
  DEST=$(curl -s -X POST "$API_URL/accounts" \
    -H "Content-Type: application/json" \
    -d '{"userId": "'$(uuidgen | tr '[:upper:]' '[:lower:]')'", "initialBalance": 100}')
  DEST_ID=$(echo $DEST | grep -oP '"id":"[^"]+' | cut -d'"' -f4)
  echo "Destination: $DEST_ID"
  
  echo "Initiating transfer (RF-07)..."
  TRANSFER=$(curl -s -X POST "$API_URL/transfers" \
    -H "Content-Type: application/json" \
    -d '{
      "sourceAccountId": "'$SOURCE_ID'",
      "destinationAccountId": "'$DEST_ID'",
      "amount": 250
    }')
  echo $TRANSFER
  TRANSFER_ID=$(echo $TRANSFER | grep -oP '"transferId":"[^"]+' | cut -d'"' -f4)
  
  echo "Waiting for async processing..."
  sleep 3
  
  echo "Checking transfer status..."
  curl -s "$API_URL/transfers/$TRANSFER_ID"
  echo -e "\n"
  
  echo "Source balance after transfer:"
  curl -s "$API_URL/accounts/$SOURCE_ID/balance"
  echo -e "\n"
  
  echo "Destination balance after transfer:"
  curl -s "$API_URL/accounts/$DEST_ID/balance"
  echo -e "\n"
}

# ============================================
# DB Verification (SSH Tunnel)
# ============================================
verify_db_persistence() {
    echo "=== DB Persistence Verification (via SSH) ==="
    
    # Extract IP from API_URL
    EC2_IP=$(echo $API_URL | sed -E 's/http:\/\/([^:]+):.*/\1/')
    PEM_FILE="../../cococash.pem"
    
    if [ ! -f "$PEM_FILE" ]; then
        echo "Warning: $PEM_FILE not found. Skipping DB verification."
        echo "Run this script from cococash-wallet-ms/ directory."
        return
    fi

    echo "Connecting to $EC2_IP to query RDS..."
    ssh -o StrictHostKeyChecking=no -i "$PEM_FILE" ec2-user@$EC2_IP \
        "psql -h cococash-wallet-db.cgjqgakoy1si.us-east-1.rds.amazonaws.com \
        -U cococash_admin -d cococash_wallet \
        -c 'SELECT id, user_id, balance, status FROM accounts ORDER BY created_at DESC LIMIT 5;'"
}

# Uncomment to run full demo:
demo_transfer
verify_db_persistence
