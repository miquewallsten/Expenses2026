# Financial Ops Platform — Master Onboarding & Institutional Setup Flow

This document serves as the canonical sequence for "Starting from Zero." No features (Expenses, Requests, etc.) are to be tested or accessed until the following sequence is completed and verified.

## Phase 1: Platform Birth (Super-Admin)
1. **Tenant Provisioning**: 
    * The Platform Master creates the **Tenant Container**.
    * The system initializes empty configuration rows (`CompanySetup`, `ChannelConfig`, `AuthSettings`).
    * Modules are **OFF** by default (Blank Cockpit state).
2. **First Key**:
    * System generates a **Magic Link Token** for the initial Tenant Administrator.
    * Master hands off the key to the Tenant Admin.

## Phase 2: Institutional Setup (Tenant Admin)
*Crucial: The Admin enters a Blank Slate. Lola (Admin Persona) leads the Discovery Phase.*

1. **Identity & Branding**: 
    * Name, Logos, Primary Language, Base Currency.
2. **Legal Entity Framework**: 
    * Define one or more Legal Entities (RFCs, Fiscal Addresses).
3. **Executive Governance (Policy)**: 
    * Central Policy Definition: Spending limits, receipt strictness (e.g., "Manual expenses allowed?"), and approval hierarchy.
4. **Communication & Auth Strategy (Channels)**:
    * Configuration of SMTP/SendGrid and WhatsApp (Twilio/Meta).
    * Integration of authentication policies (Magic Link settings).
    * *Verification: The Admin sends a test notification to ensure the firm's infra is used.*
5. **Capability Marketplace (Add-On Activation)**:
    * Admin explicitly enables "Add-Ons": Requests, Time Allocation, Amex Reconciliation.
    * *UI Result: Dashboard portal shortcuts only appear after this step.*

## Phase 3: The Organization (Jobs & Roles)
1. **Job Positions**: 
    * Define the "Seats" in the company (e.g., Project Manager, Controller, Secretary).
2. **Responsibility Tags**: 
    * Build the "Badge" system. Assign tags like `[PAYMENT_STUMP]`, `[SAT_RECONCILER]`, `[COST_CENTER_ADMIN]`.
    * Lola learns how to map these tags to Tool Access in the chat.

## Phase 4: User Enrollment
1. **Team Roster**:
    * Enroll users via email/Magic Link.
2. **Assignment**:
    * Map users to the **Job Positions** and **Responsibility Tags** created in Phase 3.
3. **Verification**:
    * Log in as different users (Employee, Accountant, Secretary) to verify their personal dashboards show only the activated modules and tools.

## Phase 5: Functional Operations
*Only now are we ready for the data intake workflows.*
1. **Lola Ingestion**: XML/PDF pairing engine tests.
2. **SAT Sync**: Real-time validation against the tax authority.
3. **Report Cycles**: Automating the bundling of the Bucket into Expense Reports.
