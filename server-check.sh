#!/bin/bash

echo "🔍 Server Diagnostic Check"
echo "=========================="

echo "📍 Checking if server is running on port 1999..."
netstat -tlnp | grep :1999 || echo "❌ No process listening on port 1999"

echo ""
echo "📍 Checking PM2 status..."
pm2 status

echo ""
echo "📍 Checking server health locally..."
curl -s http://localhost:1999/health || echo "❌ Local health check failed"

echo ""
echo "📍 Checking external access (if nginx configured)..."
curl -s http://$(hostname -I | awk '{print $1}'):1999/health || echo "❌ External access failed"

echo ""
echo "📍 Recent PM2 logs..."
pm2 logs gotchiverse-live --lines 10