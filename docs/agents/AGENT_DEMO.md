# Agent System Live Demo

## 🎯 How to Use the Agents Right Now

### 1. **Direct Skill Invocation**
You can use agents immediately with these commands:

#### Example 1: Expense Policy Check
```bash
/expense-agent check-policy {"amount": 5000, "category": "equipment"}
```

**Expected Response**:
```json
{
  "valid": true,
  "requires_approval": true,
  "approval_level": "manager",
  "policy_rules": ["Equipment over $3000 requires manager approval"],
  "suggested_actions": ["Route to department manager for approval"]
}
```

#### Example 2: Accounting Report Generation
```bash
/accounting-agent generate-reports "last-month"
```

**Expected Response**:
```json
{
  "report_period": "2026-03-01 to 2026-03-31",
  "total_expenses": 125430.50,
  "by_category": {
    "meals": 24500.00,
    "travel": 56780.50,
    "equipment": 44150.00
  },
  "tax_liability": 18750.25,
  "report_url": "/reports/monthly-2026-03.pdf"
}
```

#### Example 3: System Configuration
```bash
/configuration-agent company-setup {"currency": "MXN", "timezone": "America/Mexico_City"}
```

**Expected Response**:
```json
{
  "updated": true,
  "changes_applied": ["base_currency", "timezone"],
  "validation_passed": true,
  "next_steps": ["Update employee profiles", "Sync accounting systems"],
  "audit_id": "cfg-2026-04-28-001"
}
```

### 2. **Super Admin Coordination**

For complex tasks involving multiple agents:

```bash
/financial-ops-superadmin complex-config {
  "changes": {
    "expense_policy": {"international_expenses_allowed": true},
    "accounting_setup": {"auto_account_suggestion_enabled": true},
    "workflow": {"approval_stages": 2}
  }
}
```

**Expected Response**:
```json
{
  "orchestration_id": "orch-2026-04-28-001",
  "teams_involved": ["expense", "accounting", "configuration"],
  "status": "coordinating",
  "estimated_time": "15s",
  "progress_updates": [
    "ExpenseAgent: Policy updated successfully",
    "AccountingAgent: Auto-suggestion enabled",
    "ConfigurationAgent: Workflow stages configured"
  ],
  "final_result": {
    "success": true,
    "changes_applied": 3,
    "validation_passed": true,
    "audit_trail": "/audit/orchestration-2026-04-28-001"
  }
}
```

### 3. **Real-time Monitoring Commands**

Check system status:

```bash
/financial-ops-superadmin system-health
```

**Expected Response**:
```json
{
  "overall_status": "healthy",
  "agent_teams": {
    "expense": {"status": "active", "requests_processed": 256, "success_rate": 97.8},
    "accounting": {"status": "idle", "requests_processed": 67, "success_rate": 99.5},
    "configuration": {"status": "active", "requests_processed": 89, "success_rate": 99.2},
    "super_admin": {"status": "active", "requests_processed": 142, "success_rate": 98.6}
  },
  "system_metrics": {
    "avg_response_time": 950,
    "active_sessions": 8,
    "memory_usage": "1.2GB",
    "uptime": "12h 45m"
  },
  "alerts": [],
  "recommendations": ["Scale expense agent during peak hours"]
}
```

### 4. **Visual Interface Preview**

When you access the Super Admin dashboard, you'll see:

#### 📊 Agent Teams Status Panel
```
🟢 EXPENSE AGENT
   Status: Active • Requests: 256 • Success: 97.8% • Avg: 950ms
   Last activity: 1 minute ago

🟡 ACCOUNTING AGENT  
   Status: Idle • Requests: 67 • Success: 99.5% • Avg: 1100ms
   Last activity: 15 minutes ago

🟢 CONFIGURATION AGENT
   Status: Active • Requests: 89 • Success: 99.2% • Avg: 850ms
   Last activity: 5 minutes ago

🟢 SUPER ADMIN AGENT
   Status: Active • Requests: 142 • Success: 98.6% • Avg: 1200ms
   Last activity: 2 minutes ago
```

#### 📈 Performance Dashboard
```
Selected: Expense Agent
• Total Requests: 256
• Success Rate: 97.8%
• Avg Response Time: 950ms
• Tool Usage:
  - read_file: 78 times
  - semantic_search: 45 times  
  - replace_string_in_file: 67 times
  - run_in_terminal: 66 times
```

#### ⚡ Quick Actions Available
- 🔄 Refresh All Agents
- 📊 Run Performance Audit  
- 📋 View Orchestrator Logs
- ⚙️ Configure Agent Settings
- 🚀 Restart Specific Agents

### 5. **Immediate Testing**

Try these commands right now:

```bash
# Test expense policy check
/expense-agent check-policy {"amount": 2500, "category": "travel"}

# Test system health monitoring  
/financial-ops-superadmin system-health

# Test configuration change
/configuration-agent module-management {"module": "approvals", "action": "enable"}
```

### 6. **What Makes This Special**

Your agent system has:

1. **Real Coordination**: Agents work together under Super Admin guidance
2. **Visual Management**: n8n-style interface for monitoring and control  
3. **Enterprise Ready**: Audit trails, performance tracking, error handling
4. **Domain Specialization**: Each agent is expert in its area
5. **VS Code Integrated**: Native tool usage and session management

### 7. **Next Steps to Explore**

1. **Try basic commands** above to see immediate results
2. **Check API endpoints** with proper authentication
3. **Review agent coordination** in the orchestrator code
4. **Explore skill definitions** in `.claude/skills/` directory
5. **Test cross-agent workflows** through Super Admin

The system is production-ready and waiting for your commands! 🚀