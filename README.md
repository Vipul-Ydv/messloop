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

## How the AI part works

Code finds the problem and computes every number. Our own model (Qwen3-4B on EC2,
see `infra/ai-server.yaml`) only turns that evidence into a short explanation. Its
answer is checked before it is stored: shape, names, every number, vote shares,
comparisons and certainty language. Anything that fails is replaced by a rule-based
template, so a wrong AI answer never reaches the manager. The model call runs in the
background, so `POST /recommendations/generate` returns at once; poll
`GET /recommendations` until `aiStatus` is `done`.

## Deploy

```
npm run build:backend
aws cloudformation package --template-file template.yaml --s3-bucket <bucket> --output-template-file .aws-sam/packaged.yaml
aws cloudformation deploy --stack-name messloop --template-file .aws-sam/packaged.yaml --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND --parameter-overrides AuthSecret=... RoleCodeStudent=... RoleCodeWorker=... RoleCodeManager=... AiBaseUrl=... AiApiKey=...
```

## Live

- App: https://messloop-web-sitebucket-agfku78revhs.s3.us-east-1.amazonaws.com/index.html
- API: https://e6rcj1pacc.execute-api.us-east-1.amazonaws.com

Role codes are shared privately with the team, never in this repo.

## Frontend

```
cd frontend
npm install
npm run dev        # http://localhost:5173, talks to the deployed API
npm run build
aws s3 sync dist s3://<BucketName from the messloop-web stack> --delete
```

Set `VITE_API_URL` to point at a different backend.

## Layout

```
packages/core   pure TypeScript: metrics, rules, evidence, validation, fallback
backend         Lambda (one function, internal router), DynamoDB access, AI call
infra           our own model server on EC2
frontend        React + Vite
```

See `DECISIONS.md` for every choice made along the way.
