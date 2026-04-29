#!/bin/bash
# Start Super Admin Server

echo "🚀 Starting Super Admin Server..."

# Kill any existing processes on port 8001
echo "🔄 Cleaning up existing processes..."
pkill -f "uvicorn.*8001" || true

# Wait a moment
sleep 2

echo "🔧 Starting backend server on port 8001..."
cd /Users/mikaelwallsten/Projects/financial-ops-platform

# Start the backend server in background
python3 -m uvicorn apps.api.main:app --reload --port 8001 &
BACKEND_PID=$!

echo "✅ Backend server started with PID: $BACKEND_PID"
echo "📊 API will be available at: http://localhost:8001"
echo "🔗 Super Admin Login: http://localhost:3000/api/auth/superadmin-direct?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJzdXBlcmFkbWluQGV4YW1wbGUuY29tIiwiY29tcGFueV9pZCI6MSwiZXhwIjoxNzc3NTEwMDA0LCJpc3MiOiJmaW5hbmNpYWwtb3BzLXBsYXRmb3JtIiwiYXVkIjoiZmluYW5jaWFsLW9wcy1wbGF0Zm9ybSJ9.ryFCMghn7XVXwU2PK7Ui6zwwKIT_H1d9mCHN-_YlAmQ"
echo "🌐 Open superadmin_immediate_access.html for easy access"

# Wait for server to start
sleep 3

echo ""
echo "🎯 Ready! You can now:"
echo "   1. Open superadmin_immediate_access.html in your browser"
echo "   2. Click the login button"
echo "   3. Access the Super Admin portal at http://localhost:3000/super-admin"

# Keep script running
echo ""
echo "Press Ctrl+C to stop the server"
wait $BACKEND_PID