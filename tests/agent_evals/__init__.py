"""Scenario-based agent evaluations.

Each scenario is a YAML file with:
    prompt:      str
    persona:     admin|employee|procurement
    expect_tools: list[str]    # tool names that MUST be called
    expect_no_filler: bool     # default true: voice compliance check
    expect_receipt_for: str    # optional tool name whose receipt must be created

Evals use a mocked ``chat_with_tools`` that replays a canned tool-call sequence
declared inside each scenario, so they run offline without Ollama.
"""
