"""Modern agent orchestrator for VS Code agent system integration.

This orchestrator coordinates specialized agent teams and provides
Super Admin with centralized management capabilities.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from .context import AgentContext, Persona
from .engine import run_turn
from .registry import REGISTRY, ToolResult
from .routing import scoped_model, select_model
from ..models_definitions import AgentDefinition
from .agent_definition_service import AGENT_DEF_SERVICE

_log = logging.getLogger(__name__)


@dataclass
class AgentTeam:
    """Represents a specialized agent team with domain expertise."""
    name: str
    description: str
    personas: List[Persona]
    capabilities: List[str]
    priority: int = 1
    

class AgentOrchestrator:
    """Coordinates specialized agent teams for Financial Ops platform."""
    
    def __init__(self):
        self.def_svc = AGENT_DEF_SERVICE
        self.active_sessions: Dict[str, Any] = {}
        self.performance_metrics: Dict[str, Dict] = {}
        self.teams: Dict[str, AgentTeam] = {}

        # Real-time tracking for Super Admin
        self.total_requests = 0
        self.successful_requests = 0
        self.failed_requests = 0
        self.active_requests: Dict[str, Dict] = {}
        self.request_history: List[Dict] = []
        self._max_history = 500
        self.start_time = time.time()

    def get_team_performance(self) -> Dict[str, Any]:
        """Per-team breakdown for the Super Admin dashboard."""
        out: Dict[str, Any] = {}
        for name, team in self.teams.items():
            m = self.performance_metrics.get(name, {})
            total = m.get("total_requests", 0)
            ok = m.get("successful_requests", 0)
            out[name] = {
                "team": name,
                "description": team.description,
                "total_requests": total,
                "successful_requests": ok,
                "failed_requests": total - ok,
                "success_rate": ok / total if total else 0.0,
                "avg_duration": 0.0,
            }
        return out
    
    async def route_request(self, ctx: AgentContext, user_message: str) -> Dict[str, Any]:
        """Route requests to appropriate agent teams using the Orchestrator Agent.
        
        The process is:
        1. Call run_turn() using the 'orchestrator' agent definition.
        2. Parse the JSON response to get the target agent_key and confidence.
        3. If confidence is high enough, call run_turn() again with the target agent.
        4. Otherwise, fallback to the 'config' agent.
        """
        request_id = f"req_{int(time.time() * 1000)}_{self.total_requests}"
        
        # Track request start
        self.total_requests += 1
        self.active_requests[request_id] = {
            "team": "orchestrating",
            "start_time": time.time(),
            "status": "processing",
            "user_message": user_message[:100]
        }
        
        try:
            # 1. Get the orchestrator definition
            orch_def = self.def_svc.get_by_key(ctx.db, "orchestrator")
            if not orch_def:
                # Critical failure: orchestrator not seeded
                raise RuntimeError("Orchestrator agent definition missing from DB")

            base_kwargs = {
                "db": ctx.db,
                "user": ctx.user_id,
                "company_id": ctx.company_id,
                "persona": ctx.persona,
                "user_message": user_message,
                "locale": ctx.locale,
            }
            routing_result = run_turn(**base_kwargs, agent_definition=orch_def)
            
            content = routing_result.get("content", "").strip()
            
            # Parse JSON response: {"agent_key": "...", "confidence": 0.9}
            try:
                routing_data = json.loads(content)
                target_key = routing_data.get("agent_key", "config")
                confidence = routing_data.get("confidence", 0.0)
            except json.JSONDecodeError:
                _log.warning("Orchestrator failed to emit JSON: %s", content)
                target_key = "config"
                confidence = 0.0

            # 3. Confidence threshold check
            if confidence < 0.6:
                _log.info("Low confidence routing (%s), falling back to config agent", confidence)
                target_key = "config"

            # 4. Get the target agent definition
            target_def = self.def_svc.get_by_key(ctx.db, target_key)
            if not target_def:
                _log.error("Target agent %s not found, falling back to config", target_key)
                target_def = self.def_svc.get_by_key(ctx.db, "config")

            # Update active request with target team
            self.active_requests[request_id]["team"] = target_key
            
            result = run_turn(**base_kwargs, agent_definition=target_def)
            
            # Track successful completion
            self.successful_requests += 1
            self.active_requests[request_id]["status"] = "completed"
            self.active_requests[request_id]["end_time"] = time.time()
            self.active_requests[request_id]["duration"] = time.time() - self.active_requests[request_id]["start_time"]
            
            # Add to history
            self.request_history.append({
                **self.active_requests[request_id],
                "result": "success"
            })
            if len(self.request_history) > self._max_history:
                self.request_history = self.request_history[-self._max_history:]
            
            return result
            
        except Exception as e:
            # Track failure
            self.failed_requests += 1
            self.active_requests[request_id]["status"] = "failed"
            self.active_requests[request_id]["end_time"] = time.time()
            self.active_requests[request_id]["error"] = str(e)
            
            # Add to history
            self.request_history.append({
                **self.active_requests[request_id],
                "result": "error"
            })
            if len(self.request_history) > self._max_history:
                self.request_history = self.request_history[-self._max_history:]
            
            raise
        
        finally:
            # Clean up active request after short delay
            async def cleanup_request():
                await asyncio.sleep(30)
                if request_id in self.active_requests:
                    del self.active_requests[request_id]

            asyncio.create_task(cleanup_request())
    
    async def _handle_single_team(self, team: AgentTeam, ctx: AgentContext, user_message: str) -> Dict[str, Any]:
        """Handle request with a single agent team."""
        # Use existing engine for single-team requests
        result = run_turn(
            db=ctx.db,
            user=ctx.user,
            company_id=ctx.company_id,
            persona=ctx.persona,
            user_message=user_message,
            session_id=ctx.session_id,
            locale=ctx.locale
        )
        
        # Track performance metrics
        self._track_performance(team.name, result)
        
        return result
    
    async def _handle_multi_team(self, teams: List[AgentTeam], ctx: AgentContext, user_message: str) -> Dict[str, Any]:
        """Coordinate multiple agent teams for complex requests."""
        # For multi-team coordination, we need to:
        # 1. Break down the complex request into sub-tasks
        # 2. Assign tasks to appropriate teams
        # 3. Coordinate execution and collect results
        # 4. Synthesize final response
        
        # Placeholder for complex coordination logic
        # This would involve task decomposition, parallel execution, and result synthesis
        
        # For now, default to the highest priority team
        primary_team = max(teams, key=lambda t: t.priority)
        return await self._handle_single_team(primary_team, ctx, user_message)
    
    def _track_performance(self, team_name: str, result: Dict[str, Any]) -> None:
        """Track performance metrics for agent teams."""
        if team_name not in self.performance_metrics:
            self.performance_metrics[team_name] = {
                "total_requests": 0,
                "successful_requests": 0,
                "average_response_time": 0,
                "tool_usage": {}
            }
        
        metrics = self.performance_metrics[team_name]
        metrics["total_requests"] += 1
        
        if result.get("ok", False):
            metrics["successful_requests"] += 1
        
        # Track tool usage
        for tool_call in result.get("tool_calls", []):
            tool_name = tool_call.get("tool", "unknown")
            metrics["tool_usage"][tool_name] = metrics["tool_usage"].get(tool_name, 0) + 1
    
    def get_performance_report(self) -> Dict[str, Any]:
        """Get performance report for Super Admin."""
        return {
            "teams": self.performance_metrics,
            "total_requests": sum(team["total_requests"] for team in self.performance_metrics.values()),
            "success_rate": (
                sum(team["successful_requests"] for team in self.performance_metrics.values()) /
                sum(team["total_requests"] for team in self.performance_metrics.values())
                if sum(team["total_requests"] for team in self.performance_metrics.values()) > 0
                else 0
            )
        }
    
    def get_team_status(self) -> Dict[str, Any]:
        """Get current status of all agent teams."""
        status = {}
        for team_name, team in self.teams.items():
            status[team_name] = {
                "name": team.name,
                "description": team.description,
                "active": team_name in self.performance_metrics,
                "request_count": self.performance_metrics.get(team_name, {}).get("total_requests", 0),
                "success_rate": (
                    self.performance_metrics.get(team_name, {}).get("successful_requests", 0) /
                    self.performance_metrics.get(team_name, {}).get("total_requests", 1)
                    if self.performance_metrics.get(team_name, {}).get("total_requests", 0) > 0
                    else 0
                )
            }
        return status

    def get_real_time_metrics(self) -> Dict[str, Any]:
        """Get real-time metrics for Super Admin dashboard."""
        import time
        return {
            "total_requests": self.total_requests,
            "successful_requests": self.successful_requests,
            "failed_requests": self.failed_requests,
            "success_rate": (
                self.successful_requests / self.total_requests 
                if self.total_requests > 0 else 0
            ),
            "active_requests": len(self.active_requests),
            "active_requests_details": list(self.active_requests.values()),
            "uptime": time.time() - self.start_time,
            "request_history": self.request_history[-50:] # Last 50 requests
        }

    def update_team_config(self, team_name: str, config: Dict[str, Any]) -> bool:
        """Update a team's configuration globally."""
        if team_name not in self.teams:
            return False
        
        team = self.teams[team_name]
        if "description" in config:
            team.description = config["description"]
        if "priority" in config:
            team.priority = config["priority"]
        if "capabilities" in config:
            team.capabilities = config["capabilities"]
            
        return True

    def add_new_team(self, name: str, description: str, personas: List[Persona], capabilities: List[str]) -> str:
        """Provision a new specialized agent team."""
        team_id = name.lower().replace(" ", "_")
        self.teams[team_id] = AgentTeam(
            name=name,
            description=description,
            personas=personas,
            capabilities=capabilities
        )
        return team_id


# Global orchestrator instance
ORCHESTRATOR = AgentOrchestrator()