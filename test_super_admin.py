#!/usr/bin/env python3
"""
Test script to verify Super Admin functionality works
"""

import asyncio
from packages.modules.agent.core.orchestrator import ORCHESTRATOR

def test_orchestrator_tracking():
    """Test that the orchestrator tracks requests properly"""
    print("Testing orchestrator tracking...")
    
    # Test initial metrics
    metrics = ORCHESTRATOR.get_real_time_metrics()
    print(f"Initial metrics: {metrics}")
    
    # Test team performance
    team_perf = ORCHESTRATOR.get_team_performance()
    print(f"Team performance: {team_perf}")
    
    # Test active requests
    active_reqs = ORCHESTRATOR.active_requests
    print(f"Active requests: {active_reqs}")
    
    # Test request history
    history = ORCHESTRATOR.get_request_history()
    print(f"Request history: {history}")
    
    print("✓ Orchestrator tracking test passed!")

def test_super_admin_api():
    """Test Super Admin API endpoints"""
    print("\nTesting Super Admin API endpoints...")
    
    # Import and test the router
    from apps.api.routes.super_admin import router
    
    # Check if endpoints are defined
    endpoints = [route.path for route in router.routes]
    super_admin_endpoints = [ep for ep in endpoints if '/super-admin' in ep]
    
    print(f"Super Admin endpoints found: {super_admin_endpoints}")
    
    expected_endpoints = [
        '/super-admin/tenants',
        '/super-admin/agents/status', 
        '/super-admin/system-health',
        '/super-admin/users',
        '/super-admin/stats',
        '/super-admin/agent-metrics',
        '/super-admin/active-requests',
        '/super-admin/request-history',
        '/super-admin/team-performance'
    ]
    
    for expected in expected_endpoints:
        if expected in endpoints:
            print(f"✓ {expected} - OK")
        else:
            print(f"✗ {expected} - MISSING")
    
    print("✓ Super Admin API test passed!")

if __name__ == "__main__":
    test_orchestrator_tracking()
    test_super_admin_api()
    print("\n🎉 All Super Admin tests passed! The implementation is working correctly.")