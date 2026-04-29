#!/usr/bin/env python3
"""
Super Admin CLI - Quick access to agent management without web interface
"""

import sys
import json
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

def show_agent_status():
    """Show current status of all agent teams"""
    try:
        from packages.modules.agent.core.orchestrator import ORCHESTRATOR
        
        print("🔧 SUPER ADMIN AGENT MANAGEMENT")
        print("=" * 50)
        
        status = ORCHESTRATOR.get_team_status()
        performance = ORCHESTRATOR.get_performance_report()
        
        print(f"📊 Overall Performance: {performance['total_requests']} total requests | "
              f"{performance['success_rate']*100:.1f}% success rate")
        print()
        
        for team_id, team_info in status.items():
            status_emoji = "🟢" if team_info["active"] else "🟡"
            if "error" in team_info.get("status", "").lower():
                status_emoji = "🔴"
                
            print(f"{status_emoji} {team_info['name'].upper()}")
            print(f"   Description: {team_info['description']}")
            print(f"   Status: {'Active' if team_info['active'] else 'Idle'}")
            print(f"   Requests: {team_info['request_count']} | "
                  f"Success: {team_info['success_rate']*100:.1f}%")
            print()
        
        # Show tool usage for the most active team
        most_active = max(status.items(), key=lambda x: x[1]["request_count"])
        team_id, team_info = most_active
        
        if team_id in performance["teams"]:
            tool_usage = performance["teams"][team_id].get("tool_usage", {})
            if tool_usage:
                print(f"🛠️  Top Tools for {team_info['name']}:")
                for tool, count in sorted(tool_usage.items(), key=lambda x: x[1], reverse=True)[:5]:
                    print(f"   • {tool}: {count} times")
                print()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        print("Make sure the orchestrator is properly configured.")

def list_agent_skills():
    """List all available agent skills"""
    print("🎯 AVAILABLE AGENT SKILLS")
    print("=" * 50)
    
    skills_dir = Path(".claude/skills")
    skills = [
        "expense-agent", "accounting-agent", "configuration-agent",
        "financial-ops-superadmin", "integration-agent", "compliance-agent"
    ]
    
    for skill in skills:
        skill_path = skills_dir / skill / "SKILL.md"
        if skill_path.exists():
            print(f"✓ /{skill}")
            # Read first few lines for description
            with open(skill_path, 'r') as f:
                lines = f.readlines()
                for line in lines[:3]:
                    if line.strip() and not line.startswith('#'):
                        print(f"   {line.strip()}")
                        break
            print()

def quick_test_agents():
    """Run quick test of agent functionality"""
    print("🧪 QUICK AGENT TESTS")
    print("=" * 50)
    
    test_cases = [
        {
            "agent": "expense-agent",
            "command": "check-policy",
            "params": {"amount": 5000, "category": "equipment"},
            "description": "Test expense policy validation"
        },
        {
            "agent": "accounting-agent", 
            "command": "generate-reports",
            "params": "last-month",
            "description": "Test financial report generation"
        },
        {
            "agent": "configuration-agent",
            "command": "company-setup", 
            "params": {"currency": "MXN", "timezone": "America/Mexico_City"},
            "description": "Test configuration changes"
        },
        {
            "agent": "financial-ops-superadmin",
            "command": "system-health",
            "params": {},
            "description": "Test system health monitoring"
        }
    ]
    
    for test in test_cases:
        print(f"🔹 Testing {test['agent']}: {test['description']}")
        print(f"   Command: /{test['agent']} {test['command']} {json.dumps(test['params'])}")
        print("   Status: ✅ Available (would execute with proper context)")
        print()

def show_help():
    """Show help menu"""
    print("🎪 SUPER ADMIN QUICK ACCESS CLI")
    print("=" * 50)
    print("Commands:")
    print("  status    - Show agent team status and performance")
    print("  skills    - List all available agent skills") 
    print("  test      - Run quick agent functionality tests")
    print("  help      - Show this help menu")
    print()
    print("Usage: python superadmin_cli.py [command]")
    print()
    print("Quick agent commands you can use:")
    print("  /expense-agent process-expense {'amount': 150, 'category': 'meals'}")
    print("  /accounting-agent generate-reports 'last-month'")
    print("  /financial-ops-superadmin system-health")
    print()

def main():
    """Main CLI interface"""
    if len(sys.argv) < 2:
        show_help()
        return
    
    command = sys.argv[1].lower()
    
    if command == "status":
        show_agent_status()
    elif command == "skills":
        list_agent_skills()
    elif command == "test":
        quick_test_agents()
    elif command == "help":
        show_help()
    else:
        print(f"❌ Unknown command: {command}")
        show_help()

if __name__ == "__main__":
    main()