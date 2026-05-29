# Python Engineering Depth

Use this reference when Python work needs more than local syntax cleanup: service refactors,
library design, data-processing jobs, CLI tools, async code, packaging, or production hardening.

## Boundary Rules

- Put untrusted input parsing at the edge; keep domain logic free of framework request objects.
- Use explicit data shapes: dataclasses, typed dicts, pydantic-style validators, or small value
  objects when the boundary needs validation.
- Prefer narrow public APIs and private helper functions over broad utility modules.
- Keep IO, time, randomness, network, and filesystem dependencies injectable where tests need
  determinism.

## Type And Runtime Discipline

- Add type hints where they remove ambiguity at module boundaries, not as decoration.
- Use `Protocol` for behavior contracts and concrete classes for owned implementation details.
- Avoid `Any` leakage across public functions unless the boundary is intentionally dynamic.
- Treat exception types as part of the contract; do not hide recoverable failures behind broad
  `except Exception` blocks.

## Concurrency And Performance

- Choose async for high-concurrency IO, threads for blocking IO adapters, processes for CPU-bound
  work, and queues/workers for durable background execution.
- Put timeouts on network calls and bounded concurrency around fan-out work.
- Measure hot paths before tuning; inspect query shape, serialization, allocation, and lock
  contention before micro-optimizing Python code.

## Tests And Packaging

- Cover public behavior with focused pytest tests before broad snapshot or golden-file tests.
- Test failure paths, boundary validation, idempotency, and retry exhaustion.
- Keep package entry points, optional dependencies, and import-time side effects explicit.
- Prefer small fixtures and factories; avoid test suites that depend on global mutable state.

## Review Checklist

- Is the module boundary clear enough that a caller knows what is stable?
- Are data contracts typed and validated where data becomes trusted?
- Are side effects isolated and observable?
- Do tests prove the risky branch, not only the happy path?
- Is the packaging/import behavior safe for CLI, service, and test runners?
