# Agent Command Center

A professional, unified interface for managing all AI agents across tenants in the Financial Operations Platform.

## Overview

The Agent Command Center provides a centralized dashboard for:
- Monitoring agent health and performance
- Managing agent templates and deployments
- Mapping agents to business workflows
- Tracking CFDI pairing operations
- Configuring agent settings

## Features

### 1. Dashboard
- Real-time agent health statistics
- Deployment overview
- CFDI pairing integration status
- Health trend visualization

### 2. Templates
- Create, edit, and delete agent templates
- Configure system prompts and allowed tools
- Set workflow mappings
- Manage template categories (worker, config_helper, platform)

### 3. Deployments
- Deploy agents to tenant companies
- Activate/deactivate agent deployments
- Filter deployments by template, company, or status
- View deployment statistics

### 4. Workflows
- Map agents to specific business processes
- Visual workflow representation
- Matrix view of agent-to-workflow assignments
- Role-based agent assignments (primary, backup, assistant)

### 5. Monitoring
- Real-time health monitoring
- Heartbeat tracking
- Performance metrics
- Auto-refresh capabilities

### 6. CFDI Pairing
- Monitor CFDI XML/PDF pairing operations
- Retry failed pairings
- Track pairing success rates
- Integration with Validation Agent

## Architecture

The Agent Command Center integrates with the existing agent lifecycle management system:

```
Agent Templates → Tenant Deployments → Workflow Mapping → Health Monitoring
```

### Key Components

1. **Agent Templates** - Reusable agent configurations
2. **Tenant Deployments** - Instantiated agents for specific companies
3. **Workflow Mapping** - Connection between agents and business processes
4. **Health Monitoring** - Real-time agent status tracking
5. **CFDI Pairing** - Specialized monitoring for Mexican invoice processing

## Specialized Agents

### CFDI Validation Worker
Manages the pairing of CFDI XML documents with their corresponding PDFs using:
- SAT QR code matching
- UUID verification
- RFC validation
- Field comparison algorithms

Integrated as part of the Validation Agent through the `expense_validation` tool.

### Expense Bundler
Automatically groups validated expenses into reports for accounting processing.

### Notification Managers
Handle email and WhatsApp communications throughout the expense workflow.

## API Integration

The frontend connects to backend services through typed API clients:
- `agent_lifecycle.ts` - Template, deployment, and workflow management
- `cfdi_pairing.ts` - CFDI pairing monitoring and control

## Workflow Mapping

Standard financial operations workflow steps:
1. `expense.intake` - User submits expense
2. `expense.validation` - Agent validates expense (CFDI, SAT, policies)
3. `expense.bundling` - Agent bundles expenses into reports
4. `expense.approval` - Manager approval (human)
5. `expense.accounting` - Agent posts to accounting
6. `notification.email` - Agent sends email notifications
7. `notification.whatsapp` - Agent sends WhatsApp notifications
8. `user.access_control` - Agent monitors user permissions

## Getting Started

1. Navigate to `/super-admin/agent-command-center`
2. Use the sidebar to access different sections
3. Create templates before deploying agents
4. Map agents to workflows for proper orchestration
5. Monitor agent health in real-time

## Permissions

Access restricted to Super Admin users only.