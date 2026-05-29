# OpenAI API Build Guidance

Use this reference when the task involves OpenAI API integration, model choice, tool calling,
structured outputs, prompt upgrades, SDK migration, or production rollout of OpenAI-backed
features.

## Ownership

- `ai` owns product and system design for OpenAI-backed features: task framing, model selection,
  evals, tool authority, context strategy, guardrails, latency, cost, and fallback behavior.
- Do not create a duplicate `openai-docs` core route unless admission explicitly says the
  OpenAI-docs workflow is a durable standalone intent.
- Architecture, security, and devops remain owners for system topology, secrets, deployment,
  compliance, and release controls.

## Current-Fact Boundary

- Treat model names, pricing, SDK APIs, endpoint behavior, rate limits, and product availability
  as temporally unstable.
- Verify current OpenAI product/API facts from official OpenAI sources before making a precise
  recommendation.
- Cite official sources for factual claims when the answer depends on current API behavior.
- If official docs cannot be reached, say what is inferred from local project context and what
  remains unverified.

## Build Checklist

- Define the user-visible task and success metric before choosing a model.
- Choose the cheapest model path that satisfies measured quality, latency, and reliability.
- Prefer structured outputs or typed parsing contracts over free-form post-processing.
- Bound tool calls by authority, idempotency, timeout, retry budget, and audit logging.
- Keep prompts, schemas, retrieval policy, and eval cases versioned with the application code.
- Separate online behavior from offline evals so model or prompt changes can be regression tested.
- Plan graceful degradation for model outage, tool failure, context miss, and safety refusal.

## Output Contract

Leave behind:

- target task and quality bar
- model-selection rationale plus current-fact citations when needed
- prompt/schema/tool boundary
- eval cases and regression threshold
- latency, cost, and fallback plan
- open questions that still require official-doc verification
