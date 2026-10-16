# Providers, models, and usage

Bica reaches models and paid services through keys and sign-ins kept on the server. Settings → Providers manages them.

## Keys and sign-ins

A key never expires: API keys for Anthropic, OpenAI, OpenRouter, and Exa, and the year-long Claude token from `claude setup-token`. A sign-in gives short-lived tokens that someone has to renew, which is why a ChatGPT plan is signed into in the browser instead of set as an env var.

Settings saves both in `.data/auth.json`, readable only by the owner, and Bica renews sign-ins there. Bica never borrows another app's login, so nothing else can log it out by renewing first. Env vars such as `OPENAI_API_KEY` work too, and a key saved in Settings wins over them.

Sign-in flows are pi-ai's own, and every tab sees the same one, so a sign-in started on the laptop can finish on the phone. Some send the browser back to `localhost` on the dev machine. From a phone that page won't load, so copy its address and paste it into Settings.

Anthropic and OpenAI mean their plans for their own apps. Using them from Bica works, but could be refused at any time.

## What's listed

Anthropic, ChatGPT, OpenAI, and Exa are always listed, each with a short guide. Any other provider shows once it has a key. Connected ones come first, with where their key comes from.

- ChatGPT plans sign in the way the Codex app does. Sessions get the Codex models, and voice calls use the same login.
- Exa isn't a model provider. It powers the agent's web search and fetch, and a new key needs no restart.
- A CLIProxyAPI server shows as one provider, see [proxy.md](./proxy.md).

## Models

Settings holds the default model for new sessions and the fast model for side jobs such as titles and [commit messages](./git.md#commit-messages). `PI_MODEL` and `PI_FAST_MODEL` only fill in until you pick one. The model pickers fold big catalogs per provider and show only your chosen models until you search.

Each model in the picker shows two five-step bars from pi-ai's model data: its context window and its list price (input weighed over output, since an agent mostly reads). Pointing at a model fills its bars and the tray under the menu rolls to its price per million tokens and its window. There are no speed or quality bars: pi-ai has no such numbers. Models that can stop thinking get a Thinking switch, and the effort unfolds under it.

## Plan usage

The sidebar's foot shows how much is left on the plans serving the open session's model. Only CLI proxy sessions have these numbers: they come from the proxy's accounts ([proxy.md](./proxy.md)). Sessions on Bica's own sign-ins or API keys show none. Each window is a thin meter that warns near the cap and at it.

## Sources

- affectUI's [Usage Meter](https://www.affectui.com/components/usage-meter), [Compact Breakdown](https://www.affectui.com/components/compact-breakdown), [Model Picker](https://www.affectui.com/components/model-picker) and [Integration Settings](https://www.affectui.com/components/integration-settings) for the usage meters, the picker's bars, and the settings cards.
