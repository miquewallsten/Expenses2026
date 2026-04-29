# How to Access and Use the Agent System Interfaces

## 🚀 Quick Start Guide

### 1. **Backend is Running** ✅
Your FastAPI backend is already running on `http://localhost:8000`

### 2. **Access Points Available**

#### 📊 Super Admin Agent Management API
**Endpoint**: `GET /agent/admin/status/{company_id}`
**Purpose**: Get status of all agent teams
**Example**: 
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8000/agent/admin/status/1
```

#### 📈 Agent Performance API  
**Endpoint**: `GET /agent/admin/performance/{company_id}`
**Purpose**: Get performance metrics for all agents
**Example**:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8000/agent/admin/performance/1
```

### 3. **Using the Agents Directly (No UI Needed)**

You can invoke agents directly using the skill commands:

#### 🎯 Expense Agent
```bash
/expense-agent process-expense {"amount": 150, "category": "meals", "description": "Team lunch"}
/expense-agent validate-receipt {"image_url": "receipt.jpg"}
/expense-agent route-approval {"amount": 5000, "approver": "manager@company.com"}
```

#### 📊 Accounting Agent
```bash
/accounting-agent generate-reports "last-month"
/accounting-agent tax-compliance {"period": "Q2-2026", "jurisdiction": "MX"}
/accounting-agent manage-categories {"action": "create", "code": "MEALS", "name": "Team Meals"}
```

#### ⚙️ Configuration Agent
```bash
/configuration-agent company-setup {"currency": "MXN", "timezone": "America/Mexico_City"}
/configuration-agent module-management {"module": "expenses", "action": "enable"}
/configuration-agent workflow-config {"approval_stages": 2, "escalation_time": "48h"}
```

#### 🤖 Super Admin Agent
```bash
/financial-ops-superadmin system-health
/financial-ops-superadmin agent-management
/financial-ops-superadmin complex-config {"changes": "multi-domain-update"}
```

### 4. **Visual Interface Setup (Optional)**

If you want the visual n8n-style interface:

#### Option A: Use Existing Build
```bash
# Try if there's a built version
cd /Users/mikaelwallsten/Projects/financial-ops-platform/web
npm run start  # Try to start production server
```

#### Option B: Build from Source
```bash
cd /Users/mikaelwallsten/Projects/financial-ops-platform/web
npm run build  # Build the application
npm run start  # Start production server
```

#### Access URLs:
- **Super Admin**: http://localhost:3000/super-admin/agent-management
- **Company Admin**: http://localhost:3000/admin (then navigate to Agent Management)

### 5. **Authentication Requirements**

All endpoints require JWT authentication. You can:

1. **Get a test token** from your auth system
2. **Use existing session** if logged in through browser
3. **Test with mock auth** in development mode

### 6. **Quick Test Without UI**

Test that agents are working:

```bash
# Test orchestrator is working
python3 test_agent_system.py

# Test API endpoints (with proper auth)
curl -H "Authorization: Bearer test" http://localhost:8000/agent/chat/1 -X POST -d '{"message":"test"}'
```

### 7. **What You'll See in the Visual Interface**

When you access the Super Admin interface, you'll see:

#### 🎯 Agent Teams Dashboard
- Real-time status of all agent teams (Active/Idle/Error)
- Request counts and success rates
- Performance metrics and response times
- Tool usage statistics

#### 📊 Performance Analytics
- per-agent performance breakdown
- historical trend data
- error rates and resolution tracking
- resource utilization

#### ⚡ Quick Actions
- Refresh agent status
- Run performance audits  
- View orchestrator logs
- Restart individual agents

### 8. **Immediate Next Steps**

1. **Test basic agent functionality**: Try the skill commands above
2. **Check API endpoints**: Verify the backend APIs work with proper auth
3. **Explore existing interfaces**: Check if any admin panels are already accessible
4. **Review agent coordination**: See how agents work together in the orchestrator

The agent system is fully functional - you can start using it immediately through the skill commands even without the visual interface!