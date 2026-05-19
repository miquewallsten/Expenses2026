# Onboarding Agent Integration Plan

> **Goal:** Connect the onboarding wizard to the admin copilot agent, creating an intelligent, personalized first-time experience that learns user preferences and guides configuration.

> **Architecture:** The onboarding wizard will use the existing agent infrastructure to provide real-time AI assistance. The AI will learn about the company during onboarding and persist those learnings to agent memory.

> **Tech Stack:** React, TypeScript, FastAPI, SQLAlchemy, existing agent infrastructure

---

## Current State

- **OnboardingWizard**: 6-step wizard with static AI assistant rail
- **AgentContext/useAgent**: Hook for agent chat, already working
- **TenantMemoryService**: Per-company agent memory, fully implemented
- **WorkflowService**: Multi-step workflow state machine, ready to use
- **Agent Definitions**: Admin copilot agent seeded and ready

## What's Missing

1. **Agent connection** in OnboardingAssistant (currently static)
2. **Workflow persistence** when onboarding completes
3. **Memory creation** for learned preferences during onboarding
4. **First-login detection** to show onboarding automatically
5. **Onboarding progress tracking** in database

---

## Task 1: Connect OnboardingAssistant to Admin Copilot

**Files:**
- Modify: `web/components/onboarding/OnboardingAssistant.tsx`
- Modify: `web/hooks/useOnboarding.ts`

**Step 1: Add agent connection to OnboardingAssistant**

```typescript
// web/components/onboarding/OnboardingAssistant.tsx
"use client";

import { Sparkles, ChevronRight, Loader2 } from "lucide-react";
import { useAgent } from "@/hooks/useAgent";
import { useEffect, useRef } from "react";
import type { AIContext, OnboardingStep } from "@/types/onboarding";

interface OnboardingAssistantProps {
  currentStep: OnboardingStep;
  aiContext: AIContext;
  completedSteps: OnboardingStep[];
  companyType?: string;
}

export function OnboardingAssistant({
  currentStep,
  aiContext,
  completedSteps,
}: OnboardingAssistantProps) {
  const { messages, chat, isTyping } = useAgent("admin-copilot");
  const hasIntroduced = useRef(false);
  
  // Send contextual introduction when component mounts
  useEffect(() => {
    if (!hasIntroduced.current && messages.length === 0) {
      hasIntroduced.current = true;
      chat("User is starting the onboarding wizard. Introduce yourself as their setup assistant and help them choose the right company type. Be brief and friendly.");
    }
  }, []);

  // Send step context when step changes
  useEffect(() => {
    if (currentStep === "company-type") {
      // Already introduced
    } else if (currentStep === "company-basics") {
      chat("The user has selected their company type. They're now entering basic company info. Help if they have questions about currency or timezone.");
    } else if (currentStep === "recommendations") {
      chat("Explain why these modules are recommended for their company type. Be concise.");
    } else if (currentStep === "smart-config") {
      chat("The configuration is ready. Offer to customize any settings if they want.");
    }
  }, [currentStep, chat]);

  const handleQuestionClick = (question: string) => {
    chat(question);
  };

  // ... rest of component renders messages and input
}
```

**Step 2: Add message rendering and chat input**

Replace the static content with real message rendering and a chat input field.

**Step 3: Add step-specific quick action buttons**

Each step has relevant quick questions that send pre-crafted messages to the agent.

---

## Task 2: Create Onboarding Completion Backend

**Files:**
- Create: `packages/modules/admin/api/onboarding_router.py`
- Modify: `apps/api/main.py` (mount router)

**Step 1: Create onboarding completion endpoint**

```python
# packages/modules/admin/api/onboarding_router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from packages.core.platform.models import Company
from packages.modules.agent.core.memory import TenantMemoryService, remember
from packages.modules.agent.core.workflow import WORKFLOW_SERVICE
from packages.modules.agent.models import AgentMemory

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

class OnboardingCompleteRequest(BaseModel):
    company_type: str
    selected_modules: list[str]
    module_configs: dict[str, Any]

@router.post("/{company_id}/complete")
def complete_onboarding(
    company_id: int,
    body: OnboardingCompleteRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Complete onboarding and save learned preferences to agent memory."""
    
    # Verify company access
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company or company.id != user.company_id:
        raise HTTPException(403, "Access denied")
    
    # Save company type to memory
    memory = TenantMemoryService(db)
    memory.save(
        company_id=company_id,
        agent_key="admin",
        key="company_type",
        value=body.company_type,
        confidence=1.0,
    )
    
    # Save selected modules
    memory.save(
        company_id=company_id,
        agent_key="admin",
        key="enabled_modules",
        value=",".join(body.selected_modules),
        confidence=1.0,
    )
    
    # Save module configurations
    for module, config in body.module_configs.items():
        memory.save(
            company_id=company_id,
            agent_key="admin",
            key=f"module_config_{module}",
            value=json.dumps(config),
            confidence=1.0,
        )
    
    # Mark onboarding complete in workflow
    try:
        WORKFLOW_SERVICE.complete(db, company_id=company_id, workflow_key="onboarding")
    except ValueError:
        # Workflow doesn't exist, that's okay
        pass
    
    # Update company onboarding flag
    company.onboarding_completed_at = datetime.utcnow()
    db.commit()
    
    return {"ok": True, "message": "Onboarding complete"}
```

**Step 2: Mount router in main.py**

```python
# apps/api/main.py - add to imports and mounts
from packages.modules.admin.api.onboarding_router import router as onboarding_router
app.include_router(onboarding_router, prefix="/api")
```

---

## Task 3: Add Onboarding Progress Tracking

**Files:**
- Modify: `packages/core/platform/models.py`
- Create: migration for onboarding fields

**Step 1: Add onboarding fields to Company model**

```python
# Add to Company model
onboarding_started_at = Column(DateTime, nullable=True)
onboarding_completed_at = Column(DateTime, nullable=True)
onboarding_step = Column(String(50), nullable=True)  # Current step
onboarding_data = Column(JSON, nullable=True)  # Persisted wizard state
```

**Step 2: Create migration**

```bash
alembic revision -m "add_onboarding_fields_to_company"
```

---

## Task 4: Auto-Start Onboarding for New Users

**Files:**
- Create: `web/components/onboarding/OnboardingGuard.tsx`

**Step 1: Create guard component**

```typescript
// web/components/onboarding/OnboardingGuard.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingWizard } from "./OnboardingWizard";

interface OnboardingGuardProps {
  children: React.ReactNode;
  companyOnboardingCompleted: boolean | null;
}

export function OnboardingGuard({ children, companyOnboardingCompleted }: OnboardingGuardProps) {
  const router = useRouter();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user has completed onboarding
    if (companyOnboardingCompleted === null) {
      // Still loading
      return;
    }
    
    if (!companyOnboardingCompleted) {
      setShowOnboarding(true);
    }
    setLoading(false);
  }, [companyOnboardingCompleted]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <OnboardingWizard
        onComplete={() => {
          setShowOnboarding(false);
          router.refresh();
        }}
      />
    );
  }

  return <>{children}</>;
}
```

**Step 2: Wrap admin layout with guard**

```typescript
// web/app/admin/layout.tsx or similar
import { OnboardingGuard } from "@/components/onboarding/OnboardingGuard";

export default function AdminLayout({ children }) {
  const { company } = useCompany(); // Fetch company status
  
  return (
    <OnboardingGuard companyOnboardingCompleted={company?.onboardingCompletedAt}>
      {children}
    </OnboardingGuard>
  );
}
```

---

## Task 5: Persist Onboarding State to Backend

**Files:**
- Modify: `web/components/onboarding/OnboardingWizard.tsx`
- Modify: `web/hooks/useOnboarding.ts`

**Step 1: Save progress on each step**

```typescript
// In useOnboarding.ts, add:
const saveProgress = useCallback(async () => {
  await fetch(`/api/onboarding/${companyId}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      current_step: state.currentStep,
      company_type: state.companyProfile.companyType,
      company_profile: state.companyProfile,
      selected_modules: state.selectedModules,
      module_configs: state.moduleConfigs,
    }),
  });
}, [companyId, state]);
```

**Step 2: Save on navigation**

Call `saveProgress()` after each `nextStep()`.

---

## Task 6: Add Internationalization for Agent Messages

**Files:**
- Modify: `web/messages/en.json`
- Modify: `web/messages/es.json`

Add translations for:
- AI greeting messages per step
- Quick action button labels
- Error messages

---

## Task 7: Create Agent Prompts for Onboarding

**Files:**
- Create: `packages/modules/agent/prompts/onboarding.py`

**Step 1: Create onboarding-specific system prompt**

```python
# packages/modules/agent/prompts/onboarding.py
ONBOARDING_PROMPT_ES = """
Eres el asistente de configuración de Financial Ops. Estás guiando a un nuevo usuario a través del proceso de configuración inicial.

Tu trabajo es:
1. Explicar brevemente cada paso del proceso
2. Responder preguntas sobre módulos y configuración
3. Ofrecer recomendaciones personalizadas basadas en el tipo de empresa
4. Ser amigable pero conciso - el usuario quiere configurar rápidamente

Contexto actual:
- Paso actual: {current_step}
- Tipo de empresa: {company_type}
- Módulos seleccionados: {selected_modules}

ESTILO: Respuestas cortas, una pregunta a la vez, sin tecnicismos innecesarios.
Si el usuario parece confundido, ofrece ayuda específica.
Si todo está claro, confirma brevemente y deja que continue.
"""
```

---

## Execution Order

1. **Task 2** - Backend endpoint for completion (foundation)
2. **Task 1** - Connect frontend to agent (visible change)
3. **Task 5** - Persist progress (reliability)
4. **Task 3** - Database fields (persistence)
5. **Task 4** - Auto-start guard (UX)
6. **Task 7** - Agent prompts (intelligence)
7. **Task 6** - i18n (polish)

---

## Success Criteria

- [ ] Onboarding assistant shows real AI messages (not static)
- [ ] AI responds contextually to step changes
- [ ] User can ask questions and get helpful answers
- [ ] Onboarding completion saves preferences to agent memory
- [ ] Returning users see dashboard directly (no re-onboarding)
- [ ] New users see onboarding automatically on first login
- [ ] Progress is saved if user leaves mid-onboarding