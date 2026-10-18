# Providers, models, and usage

Bica reaches models and paid services through keys and sign-ins kept on the server. Settings → Providers manages them.

## Keys and sign-ins

A key never expires: API keys for Anthropic, OpenAI, OpenRouter, and Exa, and the year-long Claude token from `claude setup-token`. A sign-in gives short-lived tokens that someone has to renew, which is why a ChatGPT plan is signed into in the browser instead of set as an env var.

Settings saves both in `.data/auth.json`, readable only by the owner, and Bica renews sign-ins there. Bica never borrows another app's login, so nothing else can log it out by renewing first. Env vars such as `OPENAI_API_KEY` work too, and a key saved in Settings wins over them.

Sign-in flows are pi-ai's own, and every tab sees the same one, so a sign-in started on the laptop can finish on the phone. Away from the dev machine, Bica takes the flows' headless way, a code to copy or type, since their browser login sends you back to `localhost`. If a flow only has that, copy the address of the page that won't load and paste it into Settings.

Anthropic and OpenAI mean their plans for their own apps. Using them from Bica works, but could be refused at any time.

## What's listed

Settings opens with Appearance, the part changed most, then follows the order of setting up: providers, then the models they offer, then the hub and the rest.

Providers lists what's connected, one row each, with how: Signed in, API key, or From and the env var it came from. The CLI proxy is a row too. A key found in the environment connects with no setup, which is why Exa often just works. Add provider opens a menu of every way to connect what isn't yet, from every provider pi-ai knows: plans to sign in to, then API keys, then the CLI proxy and Exa. A provider connected from the environment stays in the menu, since a sign-in or key added in Settings wins over it.

A plan sign-in takes one pick in that menu. Bica picks the way to sign in, a browser login that calls back to `localhost` on the dev machine and a code to copy or type elsewhere, and opens the sign-in page in a new tab. If the browser blocks that tab, the Open the sign-in page button stays.

- ChatGPT plans sign in the way the Codex app does. Sessions get the Codex models, and voice calls use the same login.
- Exa isn't a model provider. It powers the agent's web search and fetch, and a new key needs no restart.
- A CLIProxyAPI server shows as one provider, see [proxy.md](./proxy.md).

## Models

Settings holds the default model for new sessions and the fast model for side jobs such as titles and [commit messages](./git.md#commit-messages). `PI_MODEL` and `PI_FAST_MODEL` only fill in until you pick one.

The decision model answers quick yes or no questions for Bica itself, such as which old tool output [Clean up](./context-usage.md#compaction-and-clean-up) keeps. Its picker lists the real decision models first, such as Jev, Clef, or Luna Decisions: they don't chat, answer in well under a second, cost a fraction of a cent, and return probabilities. Any chat model can stand in, such as Haiku: it gets the same questions and replies in JSON, in a second or two, at chat prices, with only yes or no and no probability. The code is `src/server/providers/decision-model.ts`.

The Model picker card lists the models the picker offers, and Add models opens a search with a check per model. With none chosen, the picker offers every model.

Each model in the picker shows two five-step bars from pi-ai's model data: its context window and its list price (input weighed over output, since an agent mostly reads). Pointing at a model fills its bars and the tray under the menu rolls to its price per million tokens and its window. There are no speed or quality bars: pi-ai has no such numbers. Models that can stop thinking get a Thinking switch, and the effort unfolds under it.

## Plan usage

The sidebar's foot shows how much is left on the plans serving the open session's model. Only CLI proxy sessions have these numbers: they come from the proxy's accounts ([proxy.md](./proxy.md)). Sessions on Bica's own sign-ins or API keys show none. Each window is a thin meter that warns near the cap and at it.

## Sources

- affectUI's [Usage Meter](https://www.affectui.com/components/usage-meter), [Compact Breakdown](https://www.affectui.com/components/compact-breakdown), [Model Picker](https://www.affectui.com/components/model-picker) and [Integration Settings](https://www.affectui.com/components/integration-settings) for the usage meters, the picker's bars, and the settings cards.
