#!/usr/bin/env python3
"""Test script to verify orchestrator functionality."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from apps.api.db import SessionLocal
from packages.modules.agent.core.orchestrator import ORCHESTRATOR

def test_orchestrator():
    """Test orchestrator methods."""
    print("Testing orchestrator methods...")
    
    try:
        # Test get_team_status
        status = ORCHESTRATOR.get_team_status()
        print(f"✓ get_team_status: SUCCESS ({len(status)} teams)")
        
        # Test get_real_time_metrics
        metrics = ORCHESTRATOR.get_real_time_metrics()
        print(f"✓ get_real_time_metrics: SUCCESS")
        
        # Test get_request_history
        history = ORCHESTRATOR.get_request_history(10)
        print(f"✓ get_request_history: SUCCESS ({len(history)} requests)")
        
        # Test get_team_performance
        performance = ORCHESTRATOR.get_team_performance()
        print(f"✓ get_team_performance: SUCCESS ({len(performance)} teams)")
        
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_orchestrator()