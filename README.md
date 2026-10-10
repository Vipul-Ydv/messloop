# MessLoop

A web app for a college hostel mess that records leftover food, finds dishes that are
repeatedly wasted, gets an AI to explain the evidence and suggest a change, lets a human
approve it, and then measures whether the change actually reduced waste.

> **AI recommends. Humans decide. Measured outcomes determine what works.**

**Status:** hackathon MVP for Environmental Hacks 2026 (Waste & Energy). All data is
**simulated** and labelled as such in the app.

## Run the tests

```
npm test
```

The golden numbers from the spec (baseline 18.23 per 100 servings, post 11.25,
change −6.98, reduction 38.29%) are reproduced exactly in `packages/core/*.test.ts`.

## Layout

```
packages/core   pure TypeScript: metrics, rules, evidence, validation, fallback
backend         Lambda (one function, internal router), DynamoDB access, AI call
infra           our own model server on EC2
frontend        React + Vite
```

See `DECISIONS.md` for every choice made along the way.
