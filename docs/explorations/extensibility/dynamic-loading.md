# Loading extension UI at runtime in Bica

Research for turning Bica's UI into slots that third-party code fills at runtime. It covers how to load the code, how it shares Solid and Bica's components, the styling contract, React vs Solid, testing the surface, and hot reload. It is grounded in `vite.config.ts`, `package.json`, `src/App.css`, `docs/UI.md`, `cli/build.ts`, and the installed Solid 2 RC.15 packages. Every claim marked **(tested)** was run in a throwaway experiment under throwaway folders that were not kept.

## Short answer

- Keep Solid. Share **one** Solid runtime by having the server bundle each extension with Bun and Solid's compiler, with `solid-js`, `@solidjs/web` and `bica:ui` rewritten to read the host's live modules from `globalThis.__bica.modules`. It works the same in `vite dev`, `bun start.js` and the compiled `bica` binary, and it automatically links whichever Solid build (dev, prod, observe) the host loaded. **(tested)**
- In development, load extension client code **through the host's Vite** (`/@fs/…`). You get one Solid, one Tailwind sheet and HMR that keeps state, for about 15 lines of config. **(tested)**
- The styling contract is the `@theme` tokens in `App.css` as CSS variables. Turn on `@theme static`, compile extension CSS with `@reference "App.css"`, and in production rebuild **one** combined sheet rather than appending a second one, because a second Tailwind sheet reorders the cascade for host elements.
- Wrap every slot entry in `<Errored>` + `<Loading>`. It catches render errors and lazy-import failures **(tested)**. Errors in event handlers escape, so attribute them by the `/ext/<name>.js` URL in the stack.
- Don't switch to React and don't support it as a first-class slot language. Offer a framework-neutral `mount(el, props) => dispose` slot kind as the escape hatch for React, Lit, canvas games, or vanilla code.

## What `docs/explorations/extensions.md` misses or gets wrong

The plan's direction is right: Obsidian's model, built-ins on the same API, `import()` of a server-compiled file, and a shared Solid like `require('obsidian')`. These are the gaps:

1. **"Share Bica's Solid through `window.__bica`" is the right idea but the wrong unit.** Compiled Solid JSX imports from `@solidjs/web`, not `solid-js`. `@solidjs/web` imports `solid-js` and `solid-js/internal`, and `solid-js` imports `@solidjs/signals` (checked in `node_modules`). If any of these is bundled into an extension, its signals silently stop connecting. The shared set has to be explicit, with a build guard that fails if a Solid package would be bundled.
2. **Solid ships three runtime builds**: `development`, `observe` and production, chosen by export conditions. An import map or a prebuilt "shared" bundle has to point at the _same_ build and URL the host loaded. Vite dev serves `/node_modules/.vite/deps/solid-js.js?v=<hash>`, and a different `?v` means a different instance. A shim that reads the host's live module objects avoids this whole class of bug.
3. **There is no dev story.** Running extensions through Vite in dev gives HMR, Solid's dev warnings, and Tailwind's own scanning for free. The server-compile path is only needed for `bun start` and the binary.
4. **The binary has no `node_modules`** (`docs/deploy.md`, `cli/build.ts`). The plan's "server compiles it with Solid's compiler and Tailwind" needs a toolchain inside the binary. `@solidjs/compiler` is a per-platform native addon (`compiler.darwin-arm64.node`), and Tailwind's scanner (`@tailwindcss/oxide`) is native too. Both break cross-compiled `--target` builds. There are pure-JS paths: `@solidjs/babel-plugin` (86 ms for one file **(tested)**), and Tailwind's JS `compile()` fed a regex-extracted candidate list **(tested)**.
5. **A per-extension `.css` file breaks the host's cascade.** Tailwind orders utilities so longhands beat shorthands (`px-2` after `p-1`). A second sheet that re-emits `.p-1` after the host's `.px-2`, in the same `utilities` layer, makes `p-1 px-2` on a _host_ element lose its `px-2`. See the styling section.
6. **Theme variables the host never uses are not emitted.** Tailwind v4 only writes the CSS variables that are used. `--color-merged` is absent from a host build that never uses `merged` **(tested)**. Any extension that writes `var(--color-merged)` by hand, or themes Pierre through variables, gets nothing.
7. **Server-side reload by re-`import()` is stale.** In Bun, `import('./entry.js?v=2')` re-evaluates only the entry. Its relative imports stay cached **(tested: `entry v2 | dep v1`)**. Bundle the server half into one file first. The same quirk made a naive "two copies" test pass, because the query-string copy still shared Solid's internal modules.
8. **Error boundaries don't cover everything.** `<Errored>` catches errors thrown while rendering and in computations. A throw inside an `onClick` or a `setTimeout` goes to `window.onerror`. Attribute those by stack URL.
9. **Unloading isn't specified for the UI.** Each extension's client activation should run inside its own `createRoot`, owned by the loader, so that disposing it runs every `onCleanup`, and each `slot().add()` should return a disposer. That is Obsidian's `register*` model mapped onto Solid ownership.

## 1. Loading extension code at runtime

### What Solid's compiler emits (tested)

`@solidjs/compiler` is Solid 2's native Oxc compiler. Its defaults are `moduleName: "@solidjs/web"` and `generate: "dom"`, and `For`, `Show`, `Loading`, `Errored` and `Dynamic` are auto-imported. A 12-line extension compiles to:

```js
import { template as _$template } from "@solidjs/web";
import { insert as _$insert } from "@solidjs/web";
import { createComponent as _$createComponent } from "@solidjs/web";
import { delegateEvents as _$delegateEvents } from "@solidjs/web";
import { createSignal, For } from "solid-js";
import { Button } from "bica:ui";
var _tmpl$ = _$template(`<div class="rounded-card bg-panel p-1 text-ui"><!><!>`);
...
_$delegateEvents(["click"]);
```

The compiler keeps TypeScript, so a bundler strips it afterwards. Bun.build with a 6-line `onLoad` plugin does the whole job:

```ts
const solid = { name: 'solid', setup(b) {
  b.onLoad({ filter: /\.tsx$/ }, async (a) => ({
    loader: 'ts',
    contents: transform(await Bun.file(a.path).text(), { filename: a.path, generate: 'dom' }).code,
  }));
}};
```

Two details matter for Bica:

- Bica renders an SSR shell (`ssr: true` in start mode). Extension UI arrives after the socket connects, so it never hydrates. Compile it with `hydratable: false` and mount slots only on the client.
- Class names stay as plain strings inside `template()` calls, even minified. That is what lets a regex find Tailwind candidates in the built JS.

### Why one runtime matters (tested)

Two separately bundled copies of `@solidjs/signals`:

```
one copy:    effect saw [ 0, 1, 2 ]
two copies:  effect saw [ 0 ]          <- the host effect never re-ran
one copy  - extension reads host context: provided
two copies - extension reads host context: throws
```

In the browser, an extension that bundled its own Solid rendered `ext sees 0` once and never updated, while the shared ones followed the host signal to `2`. Solid's dev build flagged it: `[NO_OWNER_EFFECT] Effects created outside a reactive context will never be disposed` and `[STRICT_READ_UNTRACKED]`. A loader can treat those warnings, raised while an extension mounts, as a duplicate-runtime canary.

### Option A: plain `import()` + a global shim (recommended)

This is Obsidian's model (`require('obsidian')`, with `obsidian`, `electron` and `@codemirror/*` marked external in the sample plugin's esbuild config), done in ESM.

The host publishes the live module objects once:

```ts
// in the client entry, before any extension loads
import * as solid from 'solid-js';
import * as web from '@solidjs/web';
import * as ui from '~/components/ui/extension-api';
globalThis.__bica = { modules: { 'solid-js': solid, '@solidjs/web': web, 'bica:ui': ui } };
```

The server's extension build rewrites those specifiers to a generated shim:

```ts
b.onResolve({ filter: /^(solid-js|@solidjs\/web|bica:ui)$/ }, (a) => ({ path: a.path, namespace: 'bica-shared' }));
b.onLoad({ filter: /.*/, namespace: 'bica-shared' }, (a) => ({ loader: 'js', contents:
  `const m = globalThis.__bica.modules[${JSON.stringify(a.path)}];\n` +
  exportNames[a.path].map((n) => `export const ${n} = m.${n};`).join('\n') }));
// and fail on anything Solid that slipped through:
b.onResolve({ filter: /^(solid-js\/|@solidjs\/(signals|web\/))/ }, (a) => ({ errors: [{ text: `${a.path} must come from Bica` }] }));
```

`exportNames` is `Object.keys(await import('solid-js'))` at build time. The tested bundle was 9 KB unminified, mostly unused `const x = m.x` lines that Bun can't tree-shake (property reads might have side effects). Generating only the names each file imports, or minifying, shrinks it.

- **Pros:** the same artifact works in dev, `bun start` and the binary. It links whatever Solid build the host runs, so there is no URL or hash to keep in sync. No browser feature is needed. The shared list is one object, which is also the API surface to review.
- **Cons:** no live bindings (irrelevant for these modules), and the export list has to be generated.
- **Gotcha (tested):** Vite's import analysis rewrites `import('/x.js')` to `/x.js?import`, even with `/* @vite-ignore */` and a variable, and then refuses files in `public/`. Import by full URL (`new URL('/ext/todos.js', location.href).href`), or serve `/ext/*` from a middleware outside Vite's transform.

### Option B: dev through the host's Vite (recommended for development)

Vite will serve and transform any allowed file. An extension's `client.tsx` imported as `/@fs/<abs path>` goes through the Solid plugin, resolves `solid-js` to the same pre-bundled dep the app uses, and joins HMR.

```ts
// vite.config.ts additions
resolve: {
  alias: { 'bica:ui': '/src/components/ui/extension-api.ts' },
  // Resolve these from Bica's root even when the importer lives in ~/.bica/extensions.
  dedupe: ['solid-js', '@solidjs/web', '@solidjs/signals'],
},
server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), extensionsDir] } },
```

Tested: the host signal moved to 3, and the Vite-served extension showed `ext sees 3 doubled 6`. Editing the extension file hot-swapped it while the host count kept its value. Vite's `dedupe` docs: "force Vite to always resolve listed dependencies to the same copy (from project root)".

An extension can only import what Bica has installed, plus whatever it bundles itself through its own `node_modules`. That is the right default.

AGENTS.md says the dev server has "no live updates (`server.ws: false`)". `vite.config.ts` doesn't set that, and the 3142 page's console showed `[vite] connected`. Check which is true before relying on HMR.

### Option C: import maps

Map bare specifiers to the host's copies in a `<script type="importmap">` in `Document.tsx`. Extensions are then plain ESM with real `import 'solid-js'`.

- Import maps are universal. Multiple import maps, added after modules load, shipped in Chrome 133 and Safari 18.4 (Shopify's "Resilient import maps" work). New rules can't change specifiers that were already resolved.
- In a production Vite/Rolldown build, `solid-js` lives in a hashed chunk with minified export names. You need one extra entry per shared key that re-exports it with `preserveEntrySignatures`, so Rolldown dedupes it with the app's own imports. Then you write the hashed URLs into the map. In dev the map must point at Vite's `.vite/deps/…?v=<browserHash>` URLs, which change on every re-optimize.
- `@module-federation/vite` productized exactly this as `experiments.hostProvidesAllShared`: "The host emits one re-export chunk per shared key, which the bundler dedupes with the host's own imports, and injects a `<script type="importmap">`… The dev server serves the same map, pointing shared keys at virtual modules that resolve to the host's pre-bundled dependencies." Its limits: "The import map is fixed when the host is built", and runtime-registered remotes are unsupported. It also needs `index.html`, which Bica doesn't have.
- **Verdict:** a sound standard, but it adds build plumbing in two modes to get what the shim gets for free. Revisit only if extensions must also run outside Bica.

### Option D: Module Federation

`@module-federation/vite` supports Vite 8 and Rolldown (PR #425, March 2026) and has a Solid host/remote example. Shared deps take `singleton`, `requiredVersion` and `strictVersion`, and the runtime negotiates versions ("a higher version will be loaded if the versions are inconsistent").

- **Real users:** Backstage's new frontend system (`yarn build --module-federation`, `mf-manifest.json`, `loadModuleFederationHostShared`), Red Hat Developer Hub's dynamic plugins (Scalprum over webpack MF, now migrating to Backstage's system), and JupyterLab's prebuilt extensions (Rspack MF, with `jupyterlab.sharedPackages` and `bundled`, `singleton` and `strictVersion` flags).
- **Why it fits them:** independent teams deploy remotes to independent CDNs against hosts they don't control, so version negotiation earns its keep.
- **Why not Bica:** Bica compiles every extension itself, against exactly one host version. MF adds a runtime, async `loadShare` wrappers (or eager bundling), a build plugin in both the host and every extension, and its code special-cases `react` and `react-dom` throughout.
- **Borrow:** JupyterLab's point that _service tokens must be deduplicated too_. Anything used as an identity (a context object, a slot key symbol) has to come from the shared module.

### Option E: SystemJS (Grafana)

Grafana loads plugin `module.js` files with SystemJS. It registers an import map from `sharedDependenciesMap` and hooks `fetch` and `resolve`. Plugins must externalize exactly those deps ("Customizing the build tool configuration to change the external dependencies is not supported").

The map itself is the lesson. It still exports `app/core/utils/kbn`, `app/core/time_series2`, jQuery Flot plugins, `react-router` aliased to `react-router-dom-v5-compat`, and `lodash` patched with a `move` function "for backward compatibility". **Every shared module becomes permanent API.** Grafana built Levitate just to detect breaking changes in it.

Avoid SystemJS: native ESM plus a shim does the same without a module loader. Borrow the discipline: keep `__bica.modules` tiny (`solid-js`, `@solidjs/web`, `bica:ui`, maybe `@solidjs/router`), and never expose internal paths.

## 2. How an extension uses Bica's components

| Approach | How | Double bundling | Types | Verdict |
| --- | --- | --- | --- | --- |
| Shared module `bica:ui` | Extension writes `import { Button } from 'bica:ui'`; the build rewrites it to the shim (prod) or Vite aliases it (dev) | None | `declare module 'bica:ui'` in a types-only package or file | **Use for components and primitives** |
| Host object | `export default (bica) => bica.ui.Button` | None | From the `activate` parameter type | Use for services, not components: JSX `<bica.ui.Button>` works but reads badly, and components can't be imported at module level |
| npm package with real code | `npm i @vaibica/ui` | Yes, unless externalized; then it's the shared module again | Free | Avoid as the runtime source |
| npm package with types only | Same import as the shared module, types only | None | Free, versioned | **Ship this** (as `@vaibica/extension-api`) once anyone else writes extensions |

Recommendation: `bica:ui` is a curated barrel of `src/components/ui/` (Button, Popover, Segmented, Tag, Empty, icons, `createHighlight`, toast…). It is never the whole folder, because each export is a promise (Grafana's lesson). Services and state go through the `bica` object passed to `activate` and through slot props (section 4).

## 3. Styling contract

Facts from `App.css` and `docs/UI.md` that shape it:

- Tokens are in `@theme`: colors with `light-dark()`, radii, shadows, type roles, easings. Tailwind's own sizes, radii, shadows and families are removed (`--text-*: initial`).
- There are custom `@utility` rules (`shimmer`, `pop`, `sheet`, `appear`, `fold`…), custom variants (`touch`, `motion-safe` and `motion-reduce` keyed to `data-motion`), and lint rules (`bica/radius-tokens`, `bica/type-tokens`).
- Third-party views (Pierre) are themed through CSS variables.

### The host's sheet won't contain an extension's classes

Tailwind generates CSS only for candidates it scanned. There are four ways out.

**(a) Compile per extension with `@reference` (tested).**

```css
@reference "/abs/path/to/bica/src/App.css";
@import "/abs/path/to/bica/node_modules/tailwindcss/utilities.css" layer(utilities) source(none);
@source "./client.tsx";
```

This compiled in 17 ms. It produced Bica's custom utilities (`pop`, `shimmer`), custom variants (`touch:`, `motion-safe:`), token utilities (`rounded-card`, `bg-merged/10`, `text-accent-ink`) and keyframes, without preflight or `:root` variables. Since Tailwind PR #16774, `@reference` emits `var(--color-panel, light-dark(#f4f4f2, #18181b))` with the value as a fallback, so it works even when the host never declared the variable. Paths must be absolute or resolved from Bica's install: the extension folder has no `node_modules`, and my first try failed with `Can't resolve 'tailwindcss/utilities.css'`.

There are two problems:

- **Cascade order.** The extension sheet loads after the host's, in the same `utilities` layer. If it re-emits a class the host also has, such as `.p-1`, that rule now comes after the host's `.px-2` and wins on host elements that use both. Putting extension utilities in a sub-layer (`utilities.ext`) flips the problem, since a layer's own rules beat its sub-layers, so an extension's `px-2` would lose to the host's `p-1`. Filtering out candidates the host already has still leaves shorthand-vs-longhand clashes across sheets.
- **Hand-written `var()` in custom utilities has no fallback.** `.shimmer` uses `var(--animate-shimmer)` raw, so it only works because the host happens to use `shimmer`.

**(b) One combined sheet (recommended).**

- **Dev:** add `@source "<extensions dir>"` to `App.css` (or a generated `@import` that lists enabled extension folders). The host's Tailwind Vite plugin scans the extensions and HMRs the one sheet.
- **Prod and binary:** at boot and whenever the enabled set changes, the server compiles `App.css` against host candidates plus extension candidates and serves it as the app's stylesheet (`/app.css?v=<hash>`). Host candidates can be extracted once at build time from `dist/client` with the same regex scan. Tailwind's `compile()` is pure JS; only the `Scanner` is native, and `build(candidates)` silently ignores tokens that aren't utilities. In the test, a crude `split(/[^\w:\-\/\[\]\.#%()!@]+/)` over the built JS found `rounded-card`, `bg-panel`, `p-1` and `text-ui` among 87 tokens. The result is one globally sorted sheet with no ordering bugs, and nothing native in the binary.

**(c) `@theme static` as the variable contract (tested).** Same `App.css`, two candidates:

```
default  16612 bytes | defines --color-merged: false | keyframes pulse-soft: false
static   18967 bytes | defines --color-merged: true  | keyframes pulse-soft: true
```

For about 2.3 KB, every token exists at runtime. Extensions, Pierre themes and inline styles can then rely on `var(--color-*)`, `var(--radius-*)` and `var(--ease-*)`. This is the real, framework-neutral contract: it also serves the `mount()` escape hatch and React islands.

**(d) The Tailwind browser build (`@tailwindcss/browser`, the "Play CDN").** Its docs say it is "designed for development purposes only, and is not intended for production". It scans the DOM with a MutationObserver at runtime, which costs every page, phone included. Skip it.

### Isolation options and their cost

- **Shadow DOM.** Full two-way isolation, but expensive here:
  - Tailwind v4 relies on `@property`, which only works when registered in the document. Tailwind issue #15005 needs a workaround that hoists `@property` rules out of the shadow root.
  - Host utilities don't reach inside, so each root needs `adoptedStyleSheets`.
  - CSS anchor-positioning names are tree-scoped, which matters for Bica's popovers.
  - Bica's single `ContextMenu`, the toasts, and the `context-target` class live in the light DOM.
  - CSS variables _do_ inherit through the boundary, so tokens would still work.
  - Not worth it when one person writes or reviews every extension.
- **`@scope`.** Baseline since Firefox 146 (December 2025). Good for an extension's hand-written CSS: `@scope ([data-ext="todos"]) to ([data-slot]) { … }` keeps rules inside its own subtree and out of host slots nested inside it (a donut scope). Cheap. The loader can wrap extension CSS this way automatically.
- **Cascade layers.** Unlayered CSS beats every layer. An extension that ships plain `.foo { color: red }` beats all Tailwind utilities everywhere. The loader should wrap extension CSS in `@layer ext { … }`, declared before `utilities` (`@layer theme, base, ext, components, utilities;`), so utilities always win and the extension can't override host base styles by accident.
- **Slot size contract.** Make each slot wrapper `min-w-0 overflow-hidden` with `container-type: inline-size`. Extensions then use Tailwind v4's built-in container variants (`@sm:`, `@md:`), not viewport breakpoints. A tab rendered in the side column and in a bottom sheet then adapts to its slot, not the window. This answers "slot space" in the author's notes.

## 4. React vs Solid for the plugin host

### Mechanics compared

| Need | Solid 2 (installed) | React 19 |
| --- | --- | --- |
| Mount a dynamic component in a named slot | `<Dynamic component={C} {...props} />` or `<For each={entries()}>{(e) => <e.component …/>}</For>`; components run once | `createElement(C, props)`; re-renders on prop change |
| Lazy code | `lazy(() => import(url))` under `<Loading>` **(tested)** | `lazy` + `<Suspense>` |
| Error boundary per slot | `<Errored fallback={(err, reset) => …}>`, an ordinary component **(tested)** | A class component or `react-error-boundary`; root-level `onCaughtError` and `onUncaughtError` |
| Typed props | `Component<P>`; slot map via declaration merging | Same |
| Giving the component app state | Pass accessors or stores; reads stay fine-grained, and only the text node that read `count()` updates | Each Bica store needs a `useSyncExternalStore` adapter, and changes re-render the subtree |
| Context across the boundary | Works only with one runtime **(tested: throws with two)** | Same rule: one React |
| Cleanup on unload | Dispose the extension's `createRoot`; every `onCleanup` runs | `root.unmount()` per island |

Neither framework is easier for mounting into slots. Solid's version is a few lines because Bica's state is already Solid stores and signals: passing them through needs no adapter.

### Context vs props for "the full session/app state"

- **Props** carry what the slot is about. A `transcript.tool` renderer gets `{ call, result, status }`, and `rightPanel.tab` gets `{ session, workspace }` as accessors. They are typed per slot, visible in the API report, and easy to fake in fixtures.
- **The `bica` host object** (passed to `activate`) carries services: `bica.sessions`, `bica.commands`, `bica.socket.request`, `bica.toast`. It works even inside a `mount()` escape hatch, where Solid context doesn't flow.
- **Avoid** a context that hands out Bica's whole internal store. Like Grafana's `app/core/*`, it becomes API you can never change. Backstage reached the same conclusion: extension data flows one way, child to parent, through typed `ExtensionDataRef`s with stable ids.

### Is there a reason to switch to React, or support both?

**Evidence on how LLMs write Solid vs React.** No benchmark compares Solid and React head-to-head; I searched and found none. What exists:

- **Popularity effect, general:** "The Matthew Effect of AI Programming Assistants" (ICLR 2026) measures higher success for mainstream languages and frameworks. "LLMs Love Python" (2025, and ACL Findings 2026) shows models over-pick popular libraries.
- **Popularity isn't everything:** DesignBench (2025) found React and Vue close, with Vue higher on some metrics, and Angular clearly lower.
- **A niche framework with a post-cutoff rewrite can reach parity on small tasks:** SvelteBench tests Svelte 5 runes, released after many models' training data. Current frontier models (Claude Opus 4.x, Sonnet 5, GPT-5.x, Gemini 3.x) score 100% pass@1 on its component tests. The harness can add `llms-small.txt` docs as context.
- **React is not "solved" either:** ReactBench (July 2026) gives the best model 54% pass@1 on realistic React tasks. Most failures are React-specific bugs its React Doctor flags: broken effects and unnecessary renders.
- **Solid-specific, qualitative:** practitioners report the same failures over and over: destructured props, React hooks, `.map()` instead of `<For>` (Ditto's migration post, RuleSync). For Solid 2, khmm12's skills repo says "LLM priors from React and Solid 1.x are the dominant bug source". Solid 2 hit RC in August 2026, so no model's training data has much of its API.
- **The one self-report "ranking"** (Medium, 2025: React 5/5, Solid 2/5) asks models to rate themselves. It measures nothing.
- **Bica itself** is a large Solid 2 app written mostly by agents, with `CHEATSHEET.md`, the shipped skills, and `/__solid/diagnostics`. In the test, Solid's dev warnings caught the broken extension in the browser. That makes the failure loop checkable, which matters more than first-try accuracy.

**Conclusion.** The gap is real for zero-context generation, and it closes with docs in context plus diagnostics. Bica already has both. Switching means rewriting every built-in on the new API. JupyterLab's rule, that built-ins use the extension API, makes the slot framework and the app framework the same choice. Supporting both means shipping roughly 60 KB gzipped of React and ReactDOM, a store adapter per Bica store, and a second UI kit, since `bica:ui` components are Solid. No.

**What to do instead:**

- Give slots two kinds: `component` (Solid, the default) and `mount: (el, props) => dispose` (any framework). A React island is then the author's choice and cost:

```ts
bica.slot('center.view').add({ id: 'game', mount: (el, p) => {
  const root = createRoot(el); root.render(<Game session={p.session()} />);
  return () => root.unmount();
}});
```

Props arrive as accessors. The host wraps the call in an effect, so a React author re-renders when they change. This also covers the plan's test case, "a game in the centre view".

- For agent-written extensions, put a one-page `extensions/CHEATSHEET.md` and the Solid skills in the extension project's `AGENTS.md`. Run `eslint-plugin-solid` (already a devDependency) with `solid/reactivity` and `solid/no-destructure` on extension source at build time in dev.

## 5. Testing the extension surface

- **Type surface report.** Put the whole public surface in one file, `src/extension-api.ts`: `bica:ui` exports, the `Bica` host type, and `interface Slots { 'rightPanel.tab': { session: Accessor<Session> }; … }`, which extensions extend by declaration merging for their own slots. Check in a generated declaration snapshot (`etc/extension-api.d.ts`) and fail `bun run checks` when it changes without being committed. That is API Extractor's `.api.md` workflow ("the PR validation will fail…"). API Extractor itself needs the `typescript` package, which Bica avoids. Oxc's isolated-declarations emit, or a script that prints the file's exported declarations, is enough. Grafana's Levitate (`is-compatible --path module.ts --target`) shows the next step: check each installed extension's actual imports against the new surface.
- **Fixture extensions.** `extensions/fixtures/` holds one extension per slot kind. Each renders worst-case content (long unbreakable strings, 500 rows, an image wider than the slot), one throws on render, one throws in a click handler, one loads slowly, one uses `mount()` with vanilla DOM, and one deliberately bundles its own Solid. They type-check with `bun check` and load through the real loader under `?data=worst` (Bica's existing test data). Asserting with `agent-browser`:
  - every slot rendered;
  - the throwing ones show the fallback and the built-in took over;
  - the duplicate-Solid one was rejected at build time;
  - no Solid warning codes appeared in `console` (reuse `/__solid/diagnostics`).
- **Visual checks per slot.** Screenshot each fixture slot at desktop and at `390x844`, light and dark. That catches token drift (a renamed `--color-*`) and slot-size regressions.
- **Load contract tests (no browser).** Build every fixture with the production pipeline and assert on the output: no Solid code bundled (grep for `@solidjs/signals` internals or check the shim namespace was used), and CSS with no unlayered rules and no `:root` variables.
- **Profiles.** If profiles become extensions, a fixture profile that adds one tool, one prompt section and one slot entry exercises both halves. A Bun test boots a Durable harness with it and checks `harness.listTools()`.
- **Version ranges.** Each extension declares `"engines": { "bica": "^1.4" }`, as VS Code does with `engines.vscode` ("Cannot be `*`") and Obsidian with `minAppVersion`. Version the _extension API_ separately from the app (`BICA_API = '1.4.0'`), because the app version is `0.0.0-dev` locally and moves for unrelated reasons. The loader refuses or warns on a mismatch and shows why in the extensions list.

## 6. Hot reload during development

- **Client, dev:** load through Vite (`/@fs/…`). HMR keeps host state **(tested: the edit swapped in while the host count stayed at 2)**, and the Tailwind plugin rescans through `@source`.
- **Client, prod or binary:** `fs.watch` the extension folder, debounce about 750 ms (pjeby's Obsidian hot-reload plugin waits "about three-quarters of a second"), rebuild with Bun.build (milliseconds), recompile the combined sheet (about 17 ms per extension measured), then push an `extensions` topic over the socket with the new hash. The client loader disposes the extension's root and its slot entries, then `import()`s `/ext/<name>.js?v=<hash>`. Old module instances are never freed. That is fine in development.
- **Server:** bundle the extension's server entry into one file with Bun.build, then `import(file + '?v=' + hash)`. Re-importing an unbundled entry leaves its relative imports stale **(tested)**. Hand the result to `registry.install()`. Durable's README: "Installing an extension with an installed name replaces it in place… a running tool call finishes under its old implementation… The next phase, request, or call uses the new code."
- **Server, shared modules:** the server half has the same "one copy" problem with `@earendil-works/pi-durable`, which the plan mentions. In the binary there is no `node_modules` to resolve it from. A Bun runtime plugin solves it with no build step **(tested: `same pi-durable instance`)**:

```ts
Bun.plugin({ name: 'bica-shared', setup(b) {
  b.module('@earendil-works/pi-durable', () => ({ exports: durable, loader: 'object' }));
  b.module('bica:server', () => ({ exports: hostApi, loader: 'object' }));
}});
```

- **Safe mode** (`BICA_SAFE=1`, already in the plan) should also skip the client loader and serve the plain host sheet.

## Ranked: what to borrow

1. **One Solid runtime through a generated shim (`globalThis.__bica.modules`) plus a build guard that rejects bundled Solid packages.** Same artifact in dev, `bun start` and the binary, and it follows the host's dev or prod build. _Cost: small, about 80 lines in the extension builder and 5 in the client entry._
2. **Run extension client code through the host's Vite in dev** (`/@fs/`, `fs.allow`, `resolve.dedupe`, a `bica:ui` alias, `@source` the extensions folder). HMR, Solid warnings and one stylesheet for free. _Cost: about 15 lines of `vite.config.ts` and `App.css`._
3. **CSS variables as the styling contract: `@theme static` in `App.css`.** Every token exists at runtime for extensions, Pierre and `mount()` islands. _Cost: one word, about 2.3 KB of CSS._
4. **A per-entry slot boundary: `<Errored>` + `<Loading>` + `Dynamic`, falling back to the built-in, with errors recorded per extension and global errors attributed by `/ext/<name>.js` in the stack.** _Cost: small, one `Slot` component and a `window` error listener._
5. **One combined Tailwind sheet in production** (`App.css` + host candidates + extension candidates, through Tailwind's JS `compile()` and regex candidates, nothing native). Extension hand-written CSS wrapped in `@layer ext` and `@scope`. _Cost: medium, about 100 lines in the server plus serving the sheet by hash._
6. **A framework-neutral `mount(el, props) => dispose` slot kind instead of React support.** It covers React islands, games and vanilla widgets, and keeps Solid as the only first-class language. _Cost: tiny._
7. **A curated `bica:ui` and a typed `Slots` map in one `src/extension-api.ts`, with a checked-in declaration snapshot** (the API Extractor and Levitate workflow without TypeScript). Keep the shared list tiny, since every entry is forever (Grafana). _Cost: small to medium._
8. **Fixture extensions per slot under `?data=worst`, checked with `agent-browser` and Solid diagnostics,** including a duplicate-Solid negative control. _Cost: medium, mostly writing fixtures once._
9. **Server hot reload by bundling the server half, cache-busting the import, and `registry.install()`; share `pi-durable` with `Bun.plugin().module()`.** _Cost: small._
10. **An `engines.bica` range against a separate extension-API version.** _Cost: tiny._

Not worth borrowing for Bica: Module Federation (a runtime and a build plugin per extension to negotiate versions Bica never has), SystemJS, the Tailwind browser build, shadow DOM isolation, and first-class React slots.

## Experiments (all under throwaway folders that were not kept)

- `solid-ext/compile.ts`: Solid compiler output and a Bun.build plugin; `babel.ts`: the pure-JS compiler path and regex candidate extraction.
- `two-copies/`: two Solid signal copies break effects and context.
- `vite-host/` + `ext-dev/`: Vite-served, shim-linked and self-bundled extensions side by side, an `<Errored>` boundary, HMR. `build-ext.ts` is the shim build, `build-dup.ts` the negative control.
- `tw-ext/`: per-extension Tailwind with `@reference` (`build.ts`), and theme-variable emission with and without `@theme static` (`host.ts`).
- `server-reload/`: Bun's stale relative imports on cache-busted re-import, and `Bun.plugin().module()` sharing `pi-durable`.

## Sources

- Solid 2 packages as installed: `node_modules/solid-js/CHEATSHEET.md`, `@solidjs/compiler` README (in `node_modules/.bun`), `@solidjs/vite-plugin` README. [Solid 2.0 RC announcement](https://www.solidjs.com/blog/solid-2-0-rc-the-big-reveal)
- Obsidian: [sample plugin esbuild config](https://github.com/obsidianmd/obsidian-sample-plugin/blob/master/esbuild.config.mjs), [pjeby/hot-reload](https://github.com/pjeby/hot-reload)
- Grafana: [NPM dependencies and SystemJS sharing](https://grafana.com/developers/plugin-tools/key-concepts/npm-dependencies), [sharedDependencies.ts](https://github.com/grafana/grafana/blob/main/public/app/features/plugins/loader/sharedDependencies.ts), [systemjsHooks.ts](https://github.com/grafana/grafana/blob/main/public/app/features/plugins/loader/systemjsHooks.ts), [Levitate](https://github.com/grafana/levitate), [breaking changes guide](https://github.com/grafana/grafana/blob/main/contribute/breaking-changes-guide/breaking-changes-guide.md)
- Module Federation: [@module-federation/vite](https://github.com/module-federation/vite) (`hostProvidesAllShared`), [Vite 8 / Rolldown support PR #425](https://github.com/module-federation/vite/pull/425), [shared config](https://module-federation.io/configure/shared), [runtime API](https://module-federation.io/guide/runtime/runtime-api)
- Backstage: [module federation](https://backstage.io/docs/frontend-system/building-apps/module-federation/), [extensions and extension data refs](https://backstage.io/docs/frontend-system/architecture/extensions/). Red Hat Developer Hub: [migrating dynamic plugins](https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins/migrating-plugins-to-new-frontend-system.md)
- JupyterLab: [prebuilt extensions and deduplication](https://jupyterlab.readthedocs.io/en/latest/extension/extension_dev.html)
- Import maps: [Shopify, Resilient import maps](https://shopify.engineering/resilient-import-maps). Vite: [resolve.dedupe](https://vite.dev/config/shared-options#resolve-dedupe)
- Tailwind: [theme variables and `@theme static`](https://tailwindcss.com/docs/theme), [`@reference`](https://tailwindcss.com/docs/functions-and-directives), [PR #16774, fallbacks under `@reference`](https://github.com/tailwindlabs/tailwindcss/pull/16774), [Play CDN](https://tailwindcss.com/docs/installation/play-cdn), [issue #15005, `@property` in shadow roots](https://github.com/tailwindlabs/tailwindcss/issues/15005)
- CSS: [`@scope` on caniuse](https://caniuse.com/css-cascade-scope), [web.dev, December 2025](https://web.dev/blog/web-platform-12-2025)
- LLMs and frameworks: [Matthew Effect, ICLR 2026](https://arxiv.org/pdf/2509.23261), [LLMs Love Python](https://arxiv.org/html/2503.17181v1), [DesignBench](https://arxiv.org/html/2506.06251v1), [SvelteBench](https://github.com/khromov/svelte-bench) and [results](https://khromov.github.io/svelte-bench/benchmark-results-merged.html), [ReactBench](https://www.reactbench.com/blog), [solidjs-v2-skills](https://github.com/khmm12/solidjs-v2-skills), [Ditto: SolidJS anti-patterns](https://heyditto.ai/blog/solidjs-anti-patterns-we-learned-the-hard-way/), [self-rated ranking (weak)](https://medium.com/@darrenaddy/what-ui-framework-do-llms-code-most-accurately-b343b8df0173), [React into Solid via `mount`](https://dev.to/tuannq/integrate-react-component-into-solid-js-with-typescript-part-1-2f66)
- Testing and versions: [API Extractor report](https://api-extractor.com/pages/overview/demo_api_report/), [VS Code `engines`](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- Pi Durable reload semantics: `node_modules/@earendil-works/pi-durable/README.md`, section "Reload".
