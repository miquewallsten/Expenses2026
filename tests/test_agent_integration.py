# tests/test_agent_integration.py
"""Integration tests for the agent system.

Tests the interaction between WorkflowService, TenantMemoryService,
AgentDefinition, and tenant isolation guarantees.
"""

import json
import pytest
from packages.core.platform.models import Company
from packages.modules.agent.models_definitions import AgentDefinition
from packages.modules.agent.models_tenant import (
    TenantAgentMemory,
    TenantWorkflowProgress,
)
from packages.modules.agent.core.workflow import WorkflowService
from packages.modules.agent.core.memory import TenantMemoryService
from packages.modules.agent.core.agent_definition_service import (
    AgentDefinitionService,
)
from packages.modules.agent.tools import registry_all  # noqa: F401 — populate REGISTRY


@pytest.fixture
def workflow_service():
    """Create a WorkflowService instance."""
    return WorkflowService()


@pytest.fixture
def memory_service(db_session):
    """Create a TenantMemoryService instance."""
    return TenantMemoryService(db_session)


@pytest.fixture
def definition_service():
    """Create an AgentDefinitionService instance."""
    return AgentDefinitionService()


@pytest.fixture
def other_company(db_session):
    """Create a second test company for isolation tests."""
    company = Company(name="Other Company", slug="other-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)
    return company


@pytest.fixture
def test_provider(db_session, test_company):
    """Create a test LLM provider config."""
    from packages.modules.agent.models_definitions import LLMProviderConfig

    provider = LLMProviderConfig(
        company_id=test_company.id,
        provider="ollama",
        base_url="http://localhost:11434",
        model_name="llama3.2",
        is_active=True,
    )
    db_session.add(provider)
    db_session.commit()
    db_session.refresh(provider)
    return provider


@pytest.fixture
def test_agent_definition(db_session, definition_service):
    """Create a test agent definition."""
    definition_service.seed_defaults(db_session)
    return definition_service.get_by_key(db_session, "expense")


class TestTenantIsolation:
    """Tests verifying tenant data isolation across agent components."""

    def test_workflow_tenant_isolation(self, db_session, test_company, other_company):
        """Workflows for one tenant should not be accessible by another."""
        svc = WorkflowService()

        # Start workflow for company 1
        progress1 = svc.start(
            db_session,
            company_id=test_company.id,
            workflow_key="onboarding",
            total_steps=3,
            context={"tenant": "company1"},
        )

        # Start workflow for company 2 with same key
        progress2 = svc.start(
            db_session,
            company_id=other_company.id,
            workflow_key="onboarding",
            total_steps=3,
            context={"tenant": "company2"},
        )

        # Advance company 1's workflow
        svc.advance(db_session, company_id=test_company.id, workflow_key="onboarding")

        # Company 2's workflow should remain unchanged
        progress2_check = svc.get(
            db_session, company_id=other_company.id, workflow_key="onboarding"
        )

        assert progress1.completed_steps == 1
        assert progress2_check.completed_steps == 0
        assert progress2_check.id == progress2.id

    def test_memory_tenant_isolation(self, db_session, test_company, other_company):
        """Memory entries for one tenant should not be accessible by another."""
        svc = TenantMemoryService(db_session)

        # Save memory for company 1
        svc.save(
            company_id=test_company.id,
            agent_key="admin_copilot",
            key="preferred_category",
            value="travel",
            confidence=0.95,
        )

        # Save memory for company 2 with same key
        svc.save(
            company_id=other_company.id,
            agent_key="admin_copilot",
            key="preferred_category",
            value="software",
            confidence=0.90,
        )

        # Each company should get its own value
        value1 = svc.get(
            company_id=test_company.id, agent_key="admin_copilot", key="preferred_category"
        )
        value2 = svc.get(
            company_id=other_company.id, agent_key="admin_copilot", key="preferred_category"
        )

        assert value1 == "travel"
        assert value2 == "software"

    def test_memory_list_isolation(self, db_session, test_company, other_company):
        """Listing memories should only return entries for the specified tenant."""
        svc = TenantMemoryService(db_session)

        # Create memories for both companies
        svc.save(
            company_id=test_company.id,
            agent_key="admin_copilot",
            key="key1",
            value="value1",
        )
        svc.save(
            company_id=test_company.id,
            agent_key="admin_copilot",
            key="key2",
            value="value2",
        )
        svc.save(
            company_id=other_company.id,
            agent_key="admin_copilot",
            key="key3",
            value="value3",
        )

        # List for company 1 should only have 2 entries
        memories1 = svc.list_for_agent(
            company_id=test_company.id, agent_key="admin_copilot"
        )
        # List for company 2 should only have 1 entry
        memories2 = svc.list_for_agent(
            company_id=other_company.id, agent_key="admin_copilot"
        )

        assert len(memories1) == 2
        assert len(memories2) == 1
        assert {m.key for m in memories1} == {"key1", "key2"}
        assert {m.key for m in memories2} == {"key3"}

    def test_provider_config_isolation(self, db_session, test_company, other_company):
        """LLM provider configs should be isolated per tenant."""
        from packages.modules.agent.models_definitions import LLMProviderConfig

        # Create provider for company 1
        provider1 = LLMProviderConfig(
            company_id=test_company.id,
            provider="ollama",
            model_name="llama3.2",
            is_active=True,
        )
        db_session.add(provider1)

        # Create provider for company 2
        provider2 = LLMProviderConfig(
            company_id=other_company.id,
            provider="openai",
            model_name="gpt-4",
            is_active=True,
        )
        db_session.add(provider2)
        db_session.commit()

        # Query for each company
        p1 = (
            db_session.query(LLMProviderConfig)
            .filter(LLMProviderConfig.company_id == test_company.id)
            .first()
        )
        p2 = (
            db_session.query(LLMProviderConfig)
            .filter(LLMProviderConfig.company_id == other_company.id)
            .first()
        )

        assert p1.provider == "ollama"
        assert p1.model_name == "llama3.2"
        assert p2.provider == "openai"
        assert p2.model_name == "gpt-4"


class TestAgentDefinitionHasTools:
    """Tests verifying agent definitions have valid allowed_tools."""

    def test_seed_definitions_have_allowed_tools(
        self, db_session, definition_service
    ):
        """Seeded agent definitions should have allowed_tools populated."""
        definition_service.seed_defaults(db_session)

        definitions = db_session.query(AgentDefinition).all()

        assert len(definitions) > 0

        for definition in definitions:
            # allowed_tools should be a valid JSON list
            assert definition.allowed_tools is not None
            tools = json.loads(definition.allowed_tools)
            assert isinstance(tools, list)

    def test_allowed_tools_valid_tool_names(self, db_session, definition_service):
        """Each tool in allowed_tools should be a registered tool."""
        from packages.modules.agent.core.registry import REGISTRY

        definition_service.seed_defaults(db_session)

        definitions = db_session.query(AgentDefinition).all()

        for definition in definitions:
            tools = json.loads(definition.allowed_tools)
            for tool_name in tools:
                assert tool_name in REGISTRY._specs, (
                    f"Tool '{tool_name}' in agent '{definition.key}' not in REGISTRY"
                )

    def test_empty_allowed_tools_means_all_tools(self, db_session, definition_service):
        """An empty allowed_tools list means the agent can use all tools."""
        agent = definition_service.upsert(
            db_session,
            {
                "key": "unrestricted",
                "name": "Unrestricted Agent",
                "system_prompt": "You have access to all tools.",
                "persona": "admin",
                "allowed_tools": [],  # Empty means all tools
            },
        )

        assert agent.allowed_tools == "[]"

    def test_upsert_validates_tool_names(self, db_session, definition_service):
        """Upsert should reject unknown tool names."""
        with pytest.raises(ValueError, match="unknown tool"):
            definition_service.upsert(
                db_session,
                {
                    "key": "bad_agent",
                    "name": "Bad Agent",
                    "system_prompt": "Test",
                    "persona": "admin",
                    "allowed_tools": ["nonexistent_tool_xyz"],
                },
            )

    def test_definition_tools_are_serialized_as_json(
        self, db_session, definition_service
    ):
        """allowed_tools should be stored as JSON string."""
        definition_service.seed_defaults(db_session)

        expense_agent = definition_service.get_by_key(db_session, "expense")

        # Verify it's a string that parses to a list
        assert isinstance(expense_agent.allowed_tools, str)
        tools = json.loads(expense_agent.allowed_tools)
        assert isinstance(tools, list)


class TestWorkflowServiceIntegration:
    """Integration tests for WorkflowService state machine."""

    def test_full_workflow_lifecycle(self, db_session, test_company):
        """Test complete workflow lifecycle: start, advance, complete."""
        svc = WorkflowService()

        # Start workflow
        progress = svc.start(
            db_session,
            company_id=test_company.id,
            workflow_key="test_workflow",
            total_steps=3,
        )

        assert progress.current_step == "step_0"
        assert progress.completed_steps == 0

        # Advance through steps
        for i in range(3):
            progress = svc.advance(
                db_session,
                company_id=test_company.id,
                workflow_key="test_workflow",
            )
            assert progress.completed_steps == i + 1

        # Complete workflow
        progress = svc.complete(
            db_session,
            company_id=test_company.id,
            workflow_key="test_workflow",
        )

        assert progress.completed_steps == 3
        assert progress.current_step == "step_3"

    def test_workflow_context_persists(self, db_session, test_company):
        """Workflow context should persist across operations."""
        svc = WorkflowService()

        # Start with context
        progress = svc.start(
            db_session,
            company_id=test_company.id,
            workflow_key="context_test",
            total_steps=2,
            context={"initial": "data", "count": 5},
        )

        # Update context
        svc.update_context(
            db_session,
            company_id=test_company.id,
            workflow_key="context_test",
            key="added",
            value="later",
        )

        # Retrieve and verify
        retrieved = svc.get(
            db_session, company_id=test_company.id, workflow_key="context_test"
        )

        ctx = json.loads(retrieved.context)
        assert ctx["initial"] == "data"
        assert ctx["count"] == 5
        assert ctx["added"] == "later"

    def test_skip_and_rollback_workflow(self, db_session, test_company):
        """Test skip and rollback operations."""
        svc = WorkflowService()

        progress = svc.start(
            db_session,
            company_id=test_company.id,
            workflow_key="skip_test",
            total_steps=4,
        )

        # Skip step 0
        progress = svc.skip(
            db_session,
            company_id=test_company.id,
            workflow_key="skip_test",
            step_id="step_0",
            reason="Optional step",
        )

        assert progress.completed_steps == 1
        assert progress.current_step == "step_1"

        # Advance to step 2
        progress = svc.advance(
            db_session, company_id=test_company.id, workflow_key="skip_test"
        )
        assert progress.current_step == "step_2"

        # Rollback to step 1
        progress = svc.rollback(
            db_session,
            company_id=test_company.id,
            workflow_key="skip_test",
            step_id="step_1",
        )

        assert progress.current_step == "step_1"
        assert progress.completed_steps == 1


class TestMemoryServiceIntegration:
    """Integration tests for TenantMemoryService."""

    def test_save_and_get_memory(self, db_session, test_company):
        """Test basic save and get operations."""
        svc = TenantMemoryService(db_session)

        # Save a memory
        memory = svc.save(
            company_id=test_company.id,
            agent_key="admin_copilot",
            key="user_preference",
            value="dark_mode",
            confidence=0.95,
        )

        assert memory.id is not None
        assert memory.company_id == test_company.id
        assert memory.key == "user_preference"
        assert memory.value == "dark_mode"
        assert memory.confidence == 0.95

        # Get the value
        value = svc.get(
            company_id=test_company.id,
            agent_key="admin_copilot",
            key="user_preference",
        )

        assert value == "dark_mode"

    def test_upsert_updates_existing(self, db_session, test_company):
        """Saving with same key should update existing record."""
        svc = TenantMemoryService(db_session)

        # Initial save
        memory1 = svc.save(
            company_id=test_company.id,
            agent_key="admin_copilot",
            key="preference",
            value="value1",
            confidence=0.8,
        )

        # Update with same key
        memory2 = svc.save(
            company_id=test_company.id,
            agent_key="admin_copilot",
            key="preference",
            value="value2",
            confidence=0.9,
        )

        # Should be same record (upsert)
        assert memory1.id == memory2.id
        assert memory2.value == "value2"
        assert memory2.confidence == 0.9

    def test_confidence_filtering(self, db_session, test_company):
        """Test listing memories with confidence filter."""
        svc = TenantMemoryService(db_session)

        # Create memories with different confidence levels
        svc.save(
            company_id=test_company.id,
            agent_key="test_agent",
            key="high",
            value="val1",
            confidence=0.95,
        )
        svc.save(
            company_id=test_company.id,
            agent_key="test_agent",
            key="medium",
            value="val2",
            confidence=0.80,
        )
        svc.save(
            company_id=test_company.id,
            agent_key="test_agent",
            key="low",
            value="val3",
            confidence=0.50,
        )

        # List with min_confidence filter (>= 0.8)
        high_confidence = svc.list_for_agent(
            company_id=test_company.id,
            agent_key="test_agent",
            min_confidence=0.8,
        )

        assert len(high_confidence) == 2
        keys = {m.key for m in high_confidence}
        assert "high" in keys
        assert "medium" in keys
        assert "low" not in keys

    def test_delete_memory(self, db_session, test_company):
        """Test deleting memory entries."""
        svc = TenantMemoryService(db_session)

        # Create and delete
        svc.save(
            company_id=test_company.id,
            agent_key="test_agent",
            key="to_delete",
            value="delete_me",
        )

        deleted = svc.delete(
            company_id=test_company.id,
            agent_key="test_agent",
            key="to_delete",
        )

        assert deleted is True

        # Verify it's gone
        value = svc.get(
            company_id=test_company.id,
            agent_key="test_agent",
            key="to_delete",
        )

        assert value is None

        # Delete non-existent returns False
        deleted_again = svc.delete(
            company_id=test_company.id,
            agent_key="test_agent",
            key="to_delete",
        )

        assert deleted_again is False


class TestWorkflowMemoryIntegration:
    """Tests for WorkflowService and TenantMemoryService integration."""

    def test_workflow_and_memory_separate_state(self, db_session, test_company):
        """Workflow and memory should maintain separate state."""
        workflow_svc = WorkflowService()
        memory_svc = TenantMemoryService(db_session)

        # Start a workflow
        workflow = workflow_svc.start(
            db_session,
            company_id=test_company.id,
            workflow_key="integration_test",
            total_steps=3,
            context={"step": "init"},
        )

        # Save a memory
        memory_svc.save(
            company_id=test_company.id,
            agent_key="admin_copilot",
            key="workflow_state",
            value="in_progress",
        )

        # Advance workflow
        workflow = workflow_svc.advance(
            db_session,
            company_id=test_company.id,
            workflow_key="integration_test",
        )

        # Memory should be unchanged
        memory_value = memory_svc.get(
            company_id=test_company.id,
            agent_key="admin_copilot",
            key="workflow_state",
        )

        assert memory_value == "in_progress"
        assert workflow.completed_steps == 1

    def test_multi_tenant_workflow_memory_isolation(
        self, db_session, test_company, other_company
    ):
        """Workflows and memories should be isolated across tenants."""
        workflow_svc = WorkflowService()
        memory_svc = TenantMemoryService(db_session)

        # Setup for company 1
        workflow1 = workflow_svc.start(
            db_session,
            company_id=test_company.id,
            workflow_key="multi_tenant",
            total_steps=2,
        )
        memory_svc.save(
            company_id=test_company.id,
            agent_key="test",
            key="data",
            value="company1_data",
        )

        # Setup for company 2
        workflow2 = workflow_svc.start(
            db_session,
            company_id=other_company.id,
            workflow_key="multi_tenant",
            total_steps=2,
        )
        memory_svc.save(
            company_id=other_company.id,
            agent_key="test",
            key="data",
            value="company2_data",
        )

        # Advance company 1
        workflow_svc.advance(
            db_session,
            company_id=test_company.id,
            workflow_key="multi_tenant",
        )

        # Check isolation
        wf1 = workflow_svc.get(
            db_session,
            company_id=test_company.id,
            workflow_key="multi_tenant",
        )
        wf2 = workflow_svc.get(
            db_session,
            company_id=other_company.id,
            workflow_key="multi_tenant",
        )
        mem1 = memory_svc.get(
            company_id=test_company.id,
            agent_key="test",
            key="data",
        )
        mem2 = memory_svc.get(
            company_id=other_company.id,
            agent_key="test",
            key="data",
        )

        assert wf1.completed_steps == 1
        assert wf2.completed_steps == 0
        assert mem1 == "company1_data"
        assert mem2 == "company2_data"