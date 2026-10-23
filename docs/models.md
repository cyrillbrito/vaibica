# Models

Settings → Models picks which model does what, from the connected [providers](./providers.md).

- The default model starts new sessions. `PI_MODEL` fills in until one is picked.
- The fast model writes session titles and [commit messages](./git.md#commit-messages). `PI_FAST_MODEL` fills in. Without one, titles are the prompt's first words.
- The decision model answers Bica's own yes or no questions, such as what [Clean up](./context-usage.md#compaction-and-clean-up) keeps. Decision models such as Jev are fastest and cheapest, and a chat model such as Haiku works too.

The Model picker card limits which models the picker offers. The picker shows each model's context size and price, and a Thinking switch where the model has one.

## Sources

- affectUI's [Model Picker](https://www.affectui.com/components/model-picker) for the picker.
