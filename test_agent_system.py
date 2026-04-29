#!/usr/bin/env python3
"""
Test script to verify the agent system is working properly.
This script tests the core components without requiring authentication.
"""

import os
import sys
import json
from pathlib import Path

# Add the project root to Python path
sys.path.insert(0, str(Path(__file__).parent))

def test_orchestrator():
    """Test that the orchestrator can be imported and initialized."""
    try:
        from packages.modules.agent.core.orchestrator import ORCHESTRATOR
        print("✓ Orchestrator imported successfully")
        
        # Check teams
        teams = ORCHESTRATOR.teams
        print(f"✓ Found {len(teams)} agent teams:")
        for team_name, team in teams.items():
            print(f"  - {team_name}: {team.description}")
        
        # Test performance report
        report = ORCHESTRATOR.get_performance_report()
        print(f"✓ Performance report generated: {report['total_requests']} total requests")
        
        # Test team status
        status = ORCHESTRATOR.get_team_status()
        print(f"✓ Team status retrieved for {len(status)} teams")
        
        return True
        
    except Exception as e:
        print(f"✗ Error testing orchestrator: {e}")
        return False

def test_skill_files():
    """Test that all skill files exist."""
    skill_dir = Path(".claude/skills")
    skills = [
        "expense-agent", "accounting-agent", "configuration-agent",
        "financial-ops-superadmin", "integration-agent", "compliance-agent"
    ]
    
    all_exist = True
    for skill in skills:
        skill_path = skill_dir / skill / "SKILL.md"
        if skill_path.exists():
            print(f"✓ {skill} skill file exists")
        else:
            print(f"✗ {skill} skill file missing")
            all_exist = False
    
    return all_exist

def test_agent_files():
    """Test that agent definition files exist."""
    agent_dir = Path(".github/agents")
    agents = [
        "ExpenseAgent.agent.md", "AccountingAgent.agent.md",
        "ConfigurationAgent.agent.md", "FinancialOpsSuperAdmin.agent.md"
    ]
    
    all_exist = True
    for agent_file in agents:
        agent_path = agent_dir / agent_file
        if agent_path.exists():
            print(f"✓ {agent_file} agent definition exists")
        else:
            print(f"✗ {agent_file} agent definition missing")
            all_exist = False
    
    return all_exist

def main():
    """Run all tests."""
    print("Testing Financial Ops Agent System...")
    print("=" * 50)
    
    tests = [
        ("Orchestrator Test", test_orchestrator),
        ("Skill Files Test", test_skill_files),
        ("Agent Files Test", test_agent_files),
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n{test_name}:")
        result = test_func()
        results.append((test_name, result))
    
    print("\n" + "=" * 50)
    print("Test Results:")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "PASS" if result else "FAIL"
        print(f"  {test_name}: {status}")
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All agent system tests passed! The system is ready for use.")
        return 0
    else:
        print("❌ Some tests failed. Check the output above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())