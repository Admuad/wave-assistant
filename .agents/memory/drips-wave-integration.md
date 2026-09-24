---
name: Drips Wave integration
description: Durable constraints and live-feed details for the Wave Assistant.
---

The public Stellar Wave site exposes a live read-only issue feed through the Wave API, including issue assignment fields; use that feed for discovery and assignment checks rather than scraping rendered HTML.

**Why:** The contributor account's GitHub OAuth session is not available to the assistant backend, so private application state must not be assumed or impersonated.

**How to apply:** Keep issue submission as an explicit user action. Use the saved GitHub username only to compare against public assignment data for issues the user has intentionally tracked.

Drips contributors authenticate through Drips' own GitHub login flow, but the public Wave API does not expose a documented third-party OAuth grant or private application-status API for this assistant to consume.

**Why:** Redirecting users to Drips sign-in is safe, but claiming that the assistant is connected after that redirect would be misleading because Drips keeps the session on its own domain.

**How to apply:** Treat a Drips sign-in link as navigation only unless Drips provides an official integration contract; keep the UI explicit that private application history is not connected.