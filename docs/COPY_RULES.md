# Copy rules

Enforced in part by `apps/web/tests/content.test.ts`.

1. A headline names a concrete result or action.
2. Every claim is checkable (number + source + date, in `facts.ts`) or marked target / planned. No superlatives.
3. Sentence ≤ 18 words. Paragraph ≤ 3 sentences. No "not just X, but Y".
4. Numbers carry a unit and a date. Numbers never live in JSX or copy: they come from `facts.ts` through `{{factKey}}`.
5. Buttons: verb + object (`Check a token`, `Read the risks`). Never `Learn more`, `Get started`.
6. Every tab and every layer page ends with "What can go wrong" (2–4 concrete items).
7. One tone: direct, second person, no exclamation marks, no emoji.
8. Never "audited", "insured", "guaranteed", "safe" about Corbel itself until a document exists. "Not audited" is allowed.
9. Read-aloud test: if the line fits any other project unchanged, rewrite it.

Banned words (test fails): revolutionary, seamless, cutting-edge, next-generation, unlock, empower, elevate, supercharge, game-changing, world-class, best-in-class, leverage, robust, holistic, ecosystem, journey (allowed only as the label of the steps block), in today's fast-paced, delve, tapestry, landscape, unparalleled, effortlessly. Em dash: at most 2 per page in copy (the `—` placeholder for a missing fact is rendered by code, not written in copy).

Decisions (2026-11-12): "Clawback" is not used on the site, the feature is called **refund window**. "Weekend-safe" is replaced by **stock tools for the weekend gap**.
