# Providers and accounts

Providers are where models come from. Bica uses pi-ai's list, so any provider it knows can be connected in Settings → Providers, and its models then show in the [picker](./models.md).

Connect one with a plan sign-in, such as Claude Max or ChatGPT Plus, or with an API key. Plans are meant for the provider's own apps, so it may refuse Bica at any time. OpenRouter gets a cap on answer length, since it holds back credit for the longest possible answer and a low balance would refuse every turn. Each row shows the plan and email, or the key's last four characters.

## More than one account

Add provider lists a signed-in plan again as Another account. Each request goes to the first account not near its limits, and moves to the next if it fails for lack of room or a lost sign-in. Use first sets which account goes first. Switching costs one resend of the conversation, since accounts don't share a prompt cache. The code is `src/server/providers/plans.ts`.

The foot of the sidebar shows each account's usage for the open session's model.

## Exa

Exa runs the agent's web search and fetch ([tools.md](./tools.md)). Add its key under Add provider. The free plan is enough.

## Sources

- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) and [opencode-auth-load-balancer](https://github.com/owjs3901/opencode-auth-load-balancer) for accounts that take turns.
- [LobeHub Icons](https://github.com/lobehub/lobe-icons) for the logos, loaded from unpkg.
- affectUI's [Usage Meter](https://www.affectui.com/components/usage-meter) for the meters.
