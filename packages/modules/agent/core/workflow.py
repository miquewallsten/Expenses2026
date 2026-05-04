"""Workflow state machine service for multi-step workflows.

This service manages the state machine for guided workflows like onboarding,
data import, and other multi-step processes. All operations are company-scoped
for tenant isolation.
"""

import json
from typing import Any

from sqlalchemy.orm import Session

from packages.modules.agent.models_tenant import TenantWorkflowProgress


class WorkflowService:
    """Service for managing workflow state machine operations.

    Provides methods to start, advance, skip, rollback, and complete
    multi-step workflows with tenant isolation.
    """

    def start(
        self,
        db: Session,
        *,
        company_id: int,
        workflow_key: str,
        total_steps: int,
        context: dict[str, Any] | None = None,
    ) -> TenantWorkflowProgress:
        """Start a new workflow.

        Args:
            db: Database session
            company_id: Company ID for tenant isolation
            workflow_key: Unique identifier for the workflow type
            total_steps: Total number of steps in the workflow
            context: Optional initial context data

        Returns:
            Created workflow progress record

        Raises:
            ValueError: If workflow already exists for this company+workflow_key
        """
        # Check if workflow already exists
        existing = (
            db.query(TenantWorkflowProgress)
            .filter(
                TenantWorkflowProgress.company_id == company_id,
                TenantWorkflowProgress.workflow_key == workflow_key,
            )
            .first()
        )
        if existing:
            raise ValueError(f"Workflow '{workflow_key}' already exists for company {company_id}")

        progress = TenantWorkflowProgress(
            company_id=company_id,
            workflow_key=workflow_key,
            current_step="step_0",
            total_steps=total_steps,
            completed_steps=0,
            context=json.dumps(context) if context else None,
        )
        db.add(progress)
        db.commit()
        db.refresh(progress)
        return progress

    def get(
        self,
        db: Session,
        *,
        company_id: int,
        workflow_key: str,
    ) -> TenantWorkflowProgress | None:
        """Retrieve an existing workflow.

        Args:
            db: Database session
            company_id: Company ID for tenant isolation
            workflow_key: Unique identifier for the workflow type

        Returns:
            Workflow progress record or None if not found
        """
        return (
            db.query(TenantWorkflowProgress)
            .filter(
                TenantWorkflowProgress.company_id == company_id,
                TenantWorkflowProgress.workflow_key == workflow_key,
            )
            .first()
        )

    def advance(
        self,
        db: Session,
        *,
        company_id: int,
        workflow_key: str,
    ) -> TenantWorkflowProgress:
        """Advance workflow to the next step.

        Args:
            db: Database session
            company_id: Company ID for tenant isolation
            workflow_key: Unique identifier for the workflow type

        Returns:
            Updated workflow progress record

        Raises:
            ValueError: If workflow not found or already at final step
        """
        progress = self.get(db, company_id=company_id, workflow_key=workflow_key)
        if not progress:
            raise ValueError(f"Workflow '{workflow_key}' not found for company {company_id}")

        if progress.completed_steps >= progress.total_steps:
            raise ValueError("Cannot advance beyond total steps")

        progress.completed_steps += 1
        progress.current_step = f"step_{progress.completed_steps}"
        db.commit()
        db.refresh(progress)
        return progress

    def skip(
        self,
        db: Session,
        *,
        company_id: int,
        workflow_key: str,
        step_id: str,
        reason: str | None = None,
    ) -> TenantWorkflowProgress:
        """Skip an optional workflow step.

        Args:
            db: Database session
            company_id: Company ID for tenant isolation
            workflow_key: Unique identifier for the workflow type
            step_id: Step identifier to skip
            reason: Optional reason for skipping

        Returns:
            Updated workflow progress record

        Raises:
            ValueError: If workflow not found or step_id is not the current step
        """
        progress = self.get(db, company_id=company_id, workflow_key=workflow_key)
        if not progress:
            raise ValueError(f"Workflow '{workflow_key}' not found for company {company_id}")

        if progress.current_step != step_id:
            raise ValueError(f"Can only skip the current step. Current: {progress.current_step}, Requested: {step_id}")

        # Add skip reason to context if provided
        if reason:
            context = json.loads(progress.context) if progress.context else {}
            skip_key = f"skipped_{step_id}"
            context[skip_key] = reason
            progress.context = json.dumps(context)

        progress.completed_steps += 1
        progress.current_step = f"step_{progress.completed_steps}"
        db.commit()
        db.refresh(progress)
        return progress

    def rollback(
        self,
        db: Session,
        *,
        company_id: int,
        workflow_key: str,
        step_id: str,
    ) -> TenantWorkflowProgress:
        """Rollback workflow to a previous step.

        Args:
            db: Database session
            company_id: Company ID for tenant isolation
            workflow_key: Unique identifier for the workflow type
            step_id: Step identifier to rollback to

        Returns:
            Updated workflow progress record

        Raises:
            ValueError: If workflow not found or step_id is not a previous step
        """
        progress = self.get(db, company_id=company_id, workflow_key=workflow_key)
        if not progress:
            raise ValueError(f"Workflow '{workflow_key}' not found for company {company_id}")

        # Extract step number from step_id (e.g., "step_1" -> 1)
        try:
            target_step_num = int(step_id.split("_")[1])
        except (IndexError, ValueError):
            raise ValueError(f"Invalid step_id format: {step_id}")

        current_step_num = progress.completed_steps

        if target_step_num >= current_step_num:
            raise ValueError(f"Can only rollback to a previous step. Current: {current_step_num}, Target: {target_step_num}")

        progress.completed_steps = target_step_num
        progress.current_step = step_id
        db.commit()
        db.refresh(progress)
        return progress

    def update_context(
        self,
        db: Session,
        *,
        company_id: int,
        workflow_key: str,
        key: str,
        value: Any,
    ) -> TenantWorkflowProgress:
        """Update workflow context with a key-value pair.

        Args:
            db: Database session
            company_id: Company ID for tenant isolation
            workflow_key: Unique identifier for the workflow type
            key: Context key to update
            value: Value to set

        Returns:
            Updated workflow progress record

        Raises:
            ValueError: If workflow not found
        """
        progress = self.get(db, company_id=company_id, workflow_key=workflow_key)
        if not progress:
            raise ValueError(f"Workflow '{workflow_key}' not found for company {company_id}")

        context = json.loads(progress.context) if progress.context else {}
        context[key] = value
        progress.context = json.dumps(context)
        db.commit()
        db.refresh(progress)
        return progress

    def complete(
        self,
        db: Session,
        *,
        company_id: int,
        workflow_key: str,
    ) -> TenantWorkflowProgress:
        """Mark workflow as complete by advancing to final step.

        Args:
            db: Database session
            company_id: Company ID for tenant isolation
            workflow_key: Unique identifier for the workflow type

        Returns:
            Updated workflow progress record

        Raises:
            ValueError: If workflow not found
        """
        progress = self.get(db, company_id=company_id, workflow_key=workflow_key)
        if not progress:
            raise ValueError(f"Workflow '{workflow_key}' not found for company {company_id}")

        # Set completed_steps to total_steps and current_step to final
        progress.completed_steps = progress.total_steps
        progress.current_step = f"step_{progress.total_steps}"
        db.commit()
        db.refresh(progress)
        return progress


# Singleton instance for dependency injection
WORKFLOW_SERVICE = WorkflowService()