# SIMITI — Click Area → LLM Mitigation Recommendation

## 1. Frontend
Replace `kerawanan.tsx` with `kerawanan_ai_mitigation.tsx`.

Behavior:
- User selects an administrative area.
- The AI panel opens automatically.
- Hazard is inferred from active layers; default is `banjir`.
- The frontend sends summarized SIMITI evidence to `/api/ai/mitigation-recommendation`.
- The panel shows diagnosis, primary drivers, top 3 interventions, priority, evidence, implementation note, and verification needs.

## 2. Backend
Copy `aiMitigationRecommendation.js` next to `server.js`.

Add near the existing AI router imports:

```js
const { createAiMitigationRecommendationRouter } = require("./aiMitigationRecommendation");
```

Add after `app` and `pool` are initialized:

```js
app.use("/api/ai", createAiMitigationRecommendationRouter(pool));
```

The router does not need the pool yet; it is intentionally ready to receive the already-structured SIMITI evidence from the frontend.

## 3. OpenAI
Install the official SDK:

```bash
npm install openai
```

Set:

```env
OPENAI_API_KEY=YOUR_KEY
OPENAI_MODEL=gpt-5.6-luna
```

The key stays server-side; it is never put in the browser bundle.

## 4. Endpoint

```text
POST /api/ai/mitigation-recommendation
```

The route uses the OpenAI Responses API and asks the model for strict JSON containing diagnosis + up to 3 mitigation recommendations.

## 5. Important design rule
The LLM is a recommendation/reasoning layer over SIMITI evidence. It is explicitly instructed not to invent local facts or pretend to produce a final engineering design. Field verification remains required before construction decisions.
