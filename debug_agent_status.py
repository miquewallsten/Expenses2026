#!/usr/bin/env python3
"""Debug script to check agent status format."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from packages.modules.agent.core.orchestrator import ORCHESTRATOR

def debug_agent_status():
    """Debug agent status format."""
    print("Debugging agent status format...")
    
    try:
        status = ORCHESTRATOR.get_team_status()
        print(f"Raw status: {status}")
        
        for team_name, team_status in status.items():
            print(f"Team {team_name}: {team_status}")
            print(f"  - Keys: {list(team_status.keys())}")
            
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_agent_status()