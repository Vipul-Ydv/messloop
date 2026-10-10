# Decisions

One line each, as the brief asks (§0.1.5).

- **AI provider:** our own model — Qwen3-4B (Apache-2.0, Q4_K_M) served by llama.cpp on an Amazon EC2 c7i.2xlarge, called through its OpenAI-compatible API with a JSON-schema grammar. Bedrock is `NOT_AUTHORIZED` on our account, so per R13 it is not claimed anywhere.
- **Model size:** Qwen2.5-1.5B was tried first; it was fast enough but attributed vote shares to the wrong dish. Qwen3-4B gets the facts right at ~9 tokens/s on CPU.
- **Thinking off:** Qwen3's reasoning mode is disabled per request (`enable_thinking: false`); the evidence is already computed, so it only adds latency.
- **AI runs in the background:** a model answer takes ~25 s, close to API Gateway's 30 s cap. `generate` stores the recommendation at once with the deterministic template (`aiStatus: "running"`), then the Lambda invokes itself asynchronously to ask the model and swap in the validated text. Decisions are refused while it runs; after 2 minutes a run is treated as finished so it can never block the manager.
- **Extra validator checks:** a replace action must name a replacement (and only a replace may); a replacement needs at least 3 occurrences; a vote share must belong to the dish it is written next to; comparisons between candidates ("lower waste than", "most votes") must match their numbers, attributed to the dish named just before the claim.
- **Prompt shape guide:** the spec's system prompt stays verbatim; a placeholder template in the user message asks for each alternative's own numbers rather than comparisons, which a small model gets wrong.
- **Tests:** Node's built-in runner with `--experimental-strip-types` — no test dependencies.
- **Validator constants:** the numbers 100 ("per 100 servings"), 5 ("out of 5") and 3 (the rules' minimum) may appear in model text without being in the evidence.
- **Validator tolerance:** a model number matches an evidence number if it is within 0.05, i.e. rounded to one decimal.
- **Model JSON:** if the reply wraps JSON in prose or code fences, the outermost `{...}` is parsed — then every check still applies.
- **Evidence package:** history is oldest-first; derived values are rounded to 2 decimals so the model restates readable numbers.
- **Seed:** `includeLatest=false` leaves out the 8 Oct Aloo Gobi record so the demo can log it live; the baseline still lands on 18.23 once it is in.
- **Seed data lives in `packages/core/seed-data.ts`**, shared by the tests and the backend seed, so the demo and the golden tests cannot drift.
- **Fallback template:** average rating shown to one decimal.
- **Frontend hosting:** S3 static website, served over HTTPS from the bucket's S3 endpoint (`infra/frontend-hosting.yaml`). Amplify Hosting is at our account's one-app quota (used by another project) and CloudFront needs account verification, so neither is claimed (R13).
- **Routing:** hash routes (`#/dashboard`), so the static site needs no server rewrites.
- **Live preview uses `packages/core`:** the entry form imports `wastePct`/`wastePer100` directly, so the preview and the stored value come from the same code.
- **Student view:** students can read trials and their impact (`GET /interventions`, `/impact`); everything else stays manager-only.
- **CORS preflight:** the catch-all route also receives `OPTIONS`; the Lambda answers 204 and API Gateway adds the CORS headers.
- **Scope cut for time:** no Analytics page and no P1 features; Dashboard carries the core charts.
