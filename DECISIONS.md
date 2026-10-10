# Decisions

One line each, as the brief asks (§0.1.5).

- **AI provider:** our own model — Qwen2.5-1.5B-Instruct (Apache-2.0) served by llama.cpp on Amazon EC2, called through its OpenAI-compatible API. Bedrock is `NOT_AUTHORIZED` on our account, so per R13 it is not claimed anywhere.
- **Tests:** Node's built-in runner with `--experimental-strip-types` — no test dependencies.
- **Validator constants:** the numbers 100 ("per 100 servings"), 5 ("out of 5") and 3 (the rules' minimum) may appear in model text without being in the evidence.
- **Validator tolerance:** a model number matches an evidence number if it is within 0.05, i.e. rounded to one decimal.
- **Model JSON:** if the reply wraps JSON in prose or code fences, the outermost `{...}` is parsed — then every check still applies.
- **Evidence package:** history is oldest-first; derived values are rounded to 2 decimals so the model restates readable numbers.
- **Seed:** `includeLatest=false` leaves out the 8 Oct Aloo Gobi record so the demo can log it live; the baseline still lands on 18.23 once it is in.
- **Seed data lives in `packages/core/seed-data.ts`**, shared by the tests and the backend seed, so the demo and the golden tests cannot drift.
- **Fallback template:** average rating shown to one decimal.
- **Scope cut for time:** no Analytics page and no P1 features; Dashboard carries the core charts.
