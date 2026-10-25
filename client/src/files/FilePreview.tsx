import { Loading, Match, Switch, createMemo, lazy } from 'solid-js';

import Markdown from './Markdown';
import { errorText } from '../ui/errors';

export type PreviewKind = 'markdown' | 'html' | 'mermaid';

/** What a file renders as in preview, or nothing when it only shows as code. */
export function previewKind(path: string): PreviewKind | undefined {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'md' || ext === 'markdown' || ext === 'mdx') return 'markdown';
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'mmd' || ext === 'mermaid') return 'mermaid';
  return undefined;
}

let count = 0;

// Loaded on first use: mermaid is large and most files never need it.
const Mermaid = lazy(async () => {
  const { default: mermaid } = await import('mermaid');
  return {
    default: (props: { text: string }) => {
      const svg = createMemo(
        async () => {
          mermaid.initialize({
            startOnLoad: false,
            theme: matchMedia('(prefers-color-scheme: dark)').matches
              ? 'dark'
              : 'default',
          });
          try {
            return (await mermaid.render(`mermaid-${++count}`, props.text)).svg;
          } catch (error) {
            const p = document.createElement('p');
            p.className = 'text-muted';
            p.textContent = errorText(error);
            return p.outerHTML;
          }
        },
        { name: 'mermaidSvg' },
      );
      return (
        <div
          class="flex justify-center p-6 [&_svg]:h-auto [&_svg]:max-w-full"
          // Mermaid's strict security level sanitizes labels in the SVG.
          // eslint-disable-next-line solid/no-innerhtml
          innerHTML={svg()}
        />
      );
    },
  };
});

/** A file shown as what it makes: formatted Markdown, a page, a diagram. */
export default function FilePreview(props: {
  kind: PreviewKind;
  text: string;
  path: string;
}) {
  return (
    <Switch>
      <Match when={props.kind === 'markdown'}>
        <div class="mx-auto max-w-3xl px-4 py-6">
          <Markdown text={props.text} />
        </div>
      </Match>
      <Match when={props.kind === 'html'}>
        {/* Scripts run, but in their own origin: no access to Bica. */}
        <iframe
          srcdoc={props.text}
          sandbox="allow-scripts allow-popups allow-forms"
          title={props.path}
          class="block h-full w-full bg-white"
        />
      </Match>
      <Match when={props.kind === 'mermaid'}>
        <Loading>
          <Mermaid text={props.text} />
        </Loading>
      </Match>
    </Switch>
  );
}
