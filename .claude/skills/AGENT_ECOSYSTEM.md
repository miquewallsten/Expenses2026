# Financial Ops Platform Agent Ecosystem

This document describes the complete agent ecosystem for the Financial Ops platform.

## Available Agent Skills

### Core Agent Skills

1. **/financial-ops-superadmin** - Central management agent
   - Manages all other agents and system health
   - Provides centralized control interface
   - Handles complex configuration changes
   - Coordinates inter-agent communication

2. **/expense-agent** - Expense processing specialist
   - Handles expense intake and validation
   - Manages receipt processing and OCR
   - Routes expenses through approval workflows
   - Enforces expense policies

3. **/accounting-agent** - Financial operations specialist
   - Manages accounting categories and bookkeeping
   - Handles tax compliance and reporting
   - Generates financial statements
   - Maintains audit trails

4. **/configuration-agent** - System configuration specialist
   - Manages company settings and preferences
   - Handles module activation and configuration
   - Sets up workflows and routing rules
   - Manages environment-specific settings

5. **/integration-agent** - External connectivity specialist
   - Handles API integrations and data exchange
   - Manages data synchronization with external systems
   - Processes webhook events
   - Handles external authentication

6. **/compliance-agent** - Governance and rules specialist
   - Enforces company policies and compliance rules
   - Handles regulatory requirements
   - Prepares for audits
   - Performs risk assessments

## Agent Coordination

The agents work in a coordinated hierarchy:

```
FinancialOpsSuperAdmin (Orchestrator)
├── ConfigurationAgent (System Settings)
├── ExpenseAgent (Expense Processing)
├── AccountingAgent (Financial Operations)
├── IntegrationAgent (External Connectivity)
└── ComplianceAgent (Governance & Rules)
```

## Usage Patterns

### Individual Agent Usage
Invoke specific agents for domain-specific tasks:
```
/expense-agent process-expense [data]
/accounting-agent generate-reports [period]
/configuration-agent company-setup [settings]
```

### Super Admin Coordination
Use the Super Admin for complex, cross-domain tasks:
```
/financial-ops-superadmin system-health
/financial-ops-superadmin complex-config [changes]
/financial-ops-superadmin agent-management
```

## Integration Points

Each agent integrates with specific parts of the codebase:

- **ExpenseAgent**: `packages/modules/expenses/`, `packages/modules/ai/`
- **AccountingAgent**: `packages/modules/accounting/`, `packages/modules/finance/`
- **ConfigurationAgent**: `packages/core/config_engine/`, `packages/core/platform/`
- **IntegrationAgent**: `packages/modules/integrations/`, `packages/core/auth/`
- **ComplianceAgent**: `packages/core/platform/`, `packages/core/audit/`

## Best Practices

1. **Delegate to Specialists**: Use the appropriate agent for each domain
2. **Coordinate through Super Admin**: For cross-domain tasks, use the Super Admin
3. **Maintain Separation**: Each agent should focus on its specialty
4. **Document Changes**: All agent operations should have audit trails
5. **Monitor Performance**: Use Super Admin to track agent health and performance

## Error Handling

- Each agent handles domain-specific errors
- Super Admin coordinates error resolution across agents
- All errors are logged with appropriate severity levels
- Critical errors are escalated to Super Admin for resolution

## Security Considerations

- Agents operate with principle of least privilege
- Sensitive operations require Super Admin approval
- All agent actions are audited and logged
- Data access follows strict compliance requirements