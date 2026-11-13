#!/bin/bash

echo "🎯 REQUEST CORRELATION DEMO - Following a Request Through All Observability Layers"
echo "=================================================================================="

echo "📝 What we're demonstrating:"
echo "   - How OpenTelemetry automatically correlates metrics, logs, and traces"
echo "   - Following a request from API call → logs → traces → metrics"
echo "   - Real production-ready observability patterns"
echo ""

echo "1️⃣ Making a purchase request..."
echo "   curl -X POST http://localhost:8000/checkout \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{\"product_id\": 1, \"quantity\": 1}'"
echo ""

# Make the actual request (note: no correlation ID needed - OpenTelemetry handles this)
RESPONSE=$(curl -s -X POST http://localhost:8000/checkout \
  -H "Content-Type: application/json" \
  -d '{"product_id": 1, "quantity": 1}')

echo "✅ Response: $RESPONSE"
echo ""

echo "2️⃣ Extracting correlation data from response..."

# Extract order_id from the JSON response
ORDER_ID=$(echo "$RESPONSE" | grep -o '"order_id":[0-9]*' | cut -d':' -f2)
echo "   📦 Order ID: $ORDER_ID"
echo ""

# Wait a moment for logs to be written
sleep 2

echo "3️⃣ Finding correlated data in application logs..."
echo "   Searching for order_id: $ORDER_ID"
echo ""

# Search for the order in container logs and extract trace information
LOG_ENTRY=$(docker logs sre-grocery-store-api 2>&1 | grep "order_id.*$ORDER_ID" | tail -1)

if [ -n "$LOG_ENTRY" ]; then
    echo "📝 Found correlated log entry:"
    echo "   $LOG_ENTRY" | jq '.' 2>/dev/null || echo "   $LOG_ENTRY"
    
    # Extract trace_id if it exists
    TRACE_ID=$(echo "$LOG_ENTRY" | jq -r '.trace_id' 2>/dev/null)
    if [ -n "$TRACE_ID" ]; then
        echo ""
        echo "🔗 Extracted trace_id: $TRACE_ID"
    fi
else
    echo "   ⚠️  Log entry not found yet - logs may still be processing"
fi

echo ""
echo "4️⃣ Viewing traces in Jaeger:"
echo "   🔍 Open: http://localhost:16686"
echo "   🔍 Search for service: sre-grocery-store-api"
echo "   🔍 Look for recent traces with operation: 'POST /checkout'"
if [ -n "$TRACE_ID" ]; then
    echo "   🔍 Or search directly for trace_id: $TRACE_ID"
fi
echo "   🔍 The trace will show the complete request journey"

echo ""
echo "5️⃣ Viewing metrics in Grafana:"
echo "   📊 Open: http://localhost:3000"
echo "   📊 Navigate to: 'SRE Grocery Store - End-to-End Purchase Journey' dashboard"
echo "   📊 Look for the recent checkout request spike in the 🛒 Purchase Journey Overview panel"

echo ""
echo "6️⃣ What this demonstrates:"
echo "   ✅ Automatic correlation across all observability pillars"
echo "   ✅ No manual correlation ID management needed"
echo "   ✅ OpenTelemetry provides standard, robust tracing"
echo "   ✅ Production-ready observability patterns"

echo ""
echo "🎓 Key Learning: OpenTelemetry automatically correlates:"
echo "   📊 Metrics: Request counters and timing histograms"
echo "   📝 Logs: Structured JSON with trace_id and span_id"
echo "   🔍 Traces: Complete request journey with timing details"
echo "   🔗 All linked by the same trace_id: ${TRACE_ID:-'(see log output above)'}" 