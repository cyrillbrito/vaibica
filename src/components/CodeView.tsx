import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  getOwner,
  onSettled,
  runWithOwner,
  untrack,
} from 'solid-js';

import { render } from '@solidjs/web';

import type { FileText, WorkspaceRef } from '#lib/protocol';
import { comments, startComment } from '#lib/review';
import { readDiff, readFile, type View } from '#lib/workspace';
import CommentCard from './CommentCard';
import { THEME } from './DiffBlock';
import FilePreview, { previewKind, type PreviewKind } from './FilePreview';

type Diffs = typeof import('@pierre/diffs');
type Instance = InstanceType<Diffs['File']> | InstanceType<Diffs['FileDiff']>;

/** Why a side can't be shown as text, or nothing when it can. */
const problem = (t: FileText) =>
  t.text === null && t.reason !== 'missing' && t.reason !== 'media'
    ? `File is ${t.reason}`
    : '';

type Media = { label: string; mimeType: string; url: string };

const toMedia = (t: FileText, label: string): Media[] =>
  t.text === null && t.reason === 'media'
    ? [
        {
          label,
          mimeType: t.mimeType,
          url: URL.createObjectURL(
            new Blob([Uint8Array.from(atob(t.data), (c) => c.charCodeAt(0))], {
              type: t.mimeType,
            }),
          ),
        },
      ]
    : [];

// Pierre's scrollbars sit under the last line, out of reach in a long file.
// CodeView shows one pinned to the bottom of the view instead.
const SCROLLBAR_CSS = `
[data-code] { scrollbar-width: none; }
[data-code]::-webkit-scrollbar { display: none; }
`;

/**
 * One file or one diff, rendered by Pierre. Re-reads whenever `version`
 * changes; the old render stays on screen until the new one is ready.
 */
export default function CodeView(props: {
  workspace: WorkspaceRef;
  path: string;
  view: View;
  oldPath?: string;
  // The submodule the change is in; absent, the workspace's own repo.
  repo?: string;
  version?: string;
  split: boolean;
  // Long lines wrap instead of scrolling sideways.
  wrap: boolean;
  // Markdown, HTML, and Mermaid files show rendered instead of as code.
  preview: boolean;
  // Prototype: a + in the gutter of diffs adds a comment for the agent.
  comment?: boolean;
}) {
  let host: HTMLDivElement | undefined;
  let scroller!: HTMLDivElement;
  let bar!: HTMLDivElement;
  let spacer!: HTMLDivElement;
  let instance: Instance | undefined;
  let kind: 'file' | 'diff' | undefined;
  const [note, setNote] = createSignal('');
  const [rendered, setRendered] = createSignal<
    { kind: PreviewKind; text: string } | undefined
  >(undefined, { name: 'codeViewPreview' });
  // Images, PDFs, audio, and video, shown in place of Pierre.
  const [media, setMedia] = createSignal<Media[]>([]);
  const showMedia = (next: Media[]) => {
    for (const m of untrack(media)) URL.revokeObjectURL(m.url);
    setMedia(next);
  };

  // Pierre's horizontal scrollers: one, or two in split view.
  const codes = () => [
    ...(host
      ?.querySelector('diffs-container')
      ?.shadowRoot?.querySelectorAll<HTMLElement>('[data-code]') ?? []),
  ];
  // The bar and the code columns follow whichever one the user scrolled.
  // Pierre's own split sync is off (see onPostRender): two syncs fought.
  const range = (c: HTMLElement) => c.scrollWidth - c.clientWidth;
  const measure = () => {
    const max = Math.max(0, ...codes().map(range));
    bar.hidden = max <= 0;
    spacer.style.width = `${bar.clientWidth + max}px`;
    // The bar holds the position: Pierre reuses its scrollers across files.
    follow(bar.scrollLeft);
  };
  // Scroll events land a frame late. The ones our own writes cause must be
  // skipped, or a stale position pulls everything back.
  const echo = new WeakMap<Element, number>();
  const follow = (x: number, source?: Element) => {
    for (const el of [bar, ...codes()]) {
      if (el === source || el.scrollLeft === x) continue;
      el.scrollLeft = x;
      echo.set(el, el.scrollLeft);
    }
  };
  const onScroll = (e: Event) => {
    const el = e.target as HTMLElement;
    if (el !== bar && !el.matches?.('[data-code]')) return;
    if (echo.get(el) === el.scrollLeft) return void echo.delete(el);
    echo.delete(el);
    follow(el.scrollLeft, el);
  };
  const watched = new WeakSet<ShadowRoot>();
  // Also runs after highlighting lands, which can change line widths.
  const onPostRender = (container: HTMLElement, diff: object) => {
    // Off: it raced with follow() and made the columns jump.
    (
      diff as { scrollSyncManager?: { cleanUp(): void } }
    ).scrollSyncManager?.cleanUp();
    const root = container.shadowRoot;
    if (root && !watched.has(root)) {
      watched.add(root);
      root.addEventListener('scroll', onScroll, {
        capture: true,
        passive: true,
      });
    }
    measure();
  };

  // The texts on screen, for the code a comment quotes.
  let sides = { deletions: [] as string[], additions: [] as string[] };
  // Comment cards live in Pierre's annotation slots, each its own Solid root.
  const cards = new Map<string, { el: HTMLElement; dispose: () => void }>();
  // Pierre asks for cards from inside effects, which have no owner of their own.
  const owner = getOwner();
  const card = (id: string) => {
    let c = cards.get(id);
    if (!c) {
      const el = document.createElement('div');
      const dispose = runWithOwner(owner, () =>
        render(() => <CommentCard id={id} />, el),
      );
      c = { el, dispose };
      cards.set(id, c);
    }
    return c.el;
  };
  const mine = createMemo(
    () =>
      props.comment && props.view !== 'file'
        ? comments().filter(
            (c) =>
              c.cwd === props.workspace.cwd &&
              c.path === props.path &&
              c.view === props.view,
          )
        : [],
    { name: 'codeViewComments' },
  );
  // Only when the set of comments changes; edits re-render inside the card.
  const placed = createMemo(
    () =>
      mine().map((c) => ({
        side: c.side,
        lineNumber: c.end,
        metadata: { id: c.id },
      })),
    {
      name: 'codeViewAnnotations',
      equals: (a, b) =>
        a.length === b.length &&
        a.every(
          (x, i) =>
            x.metadata.id === b[i]!.metadata.id &&
            x.side === b[i]!.side &&
            x.lineNumber === b[i]!.lineNumber,
        ),
    },
  );
  createEffect(placed, (annotations) => {
    const live = new Set(annotations.map((a) => a.metadata.id));
    for (const [id, c] of cards)
      if (!live.has(id)) {
        c.dispose();
        cards.delete(id);
      }
    if (kind !== 'diff' || !instance) return;
    const diff = instance as InstanceType<Diffs['FileDiff']>;
    diff.setLineAnnotations(annotations);
    diff.rerender();
  });

  const drop = () => {
    instance?.cleanUp();
    instance = undefined;
    host?.replaceChildren();
    if (bar) bar.hidden = true;
  };
  onSettled(() => {
    const resize = new ResizeObserver(measure);
    resize.observe(scroller);
    return () => {
      resize.disconnect();
      drop();
      showMedia([]);
      for (const c of cards.values()) c.dispose();
      cards.clear();
    };
  });

  // Loaded on first use: Shiki is heavy and the server never needs it.
  const loaded = createMemo(
    async () => {
      const { workspace: ref, path, view, oldPath, repo } = props;
      // A new version is a reason to read again.
      void props.version;
      const [diffs, data] = await Promise.all([
        import('@pierre/diffs'),
        view === 'file'
          ? readFile(ref, path)
          : readDiff(ref, path, view === 'staged', oldPath, repo),
      ]);
      return { diffs, data, path, view, oldPath };
    },
    { name: 'codeViewData' },
  );

  // A re-read of the same file (an agent editing it) keeps the position.
  let shown = '';
  createEffect(
    () => ({
      k: loaded(),
      split: props.split,
      wrap: props.wrap,
      preview: props.preview,
    }),
    {
      effect: ({ k, split, wrap, preview }) => {
        setRendered(undefined);
        const overflow = wrap ? ('wrap' as const) : ('scroll' as const);
        const { diffs, data } = k;
        if (shown !== `${k.view}:${k.path}`) {
          bar.scrollLeft = 0;
          scroller.scrollTop = 0;
        }
        shown = `${k.view}:${k.path}`;
        const want = k.view === 'file' ? 'file' : 'diff';
        if (kind !== want) drop();
        kind = want;
        const found =
          'old' in data
            ? [...toMedia(data.old, 'Before'), ...toMedia(data.new, 'After')]
            : toMedia(data, '');
        showMedia(found);
        if (found.length) {
          drop();
          setNote('');
          return;
        }
        if ('old' in data) {
          const why = problem(data.old) || problem(data.new);
          if (why) {
            drop();
            setNote(why);
            return;
          }
          const oldText = data.old.text ?? '';
          const newText = data.new.text ?? '';
          sides = {
            deletions: oldText.split('\n'),
            additions: newText.split('\n'),
          };
          const commenting = !!props.comment;
          setNote(oldText === newText ? 'No changes' : '');
          const options = {
            theme: THEME,
            themeType: 'system' as const,
            // Phones get unified; split needs the width.
            diffStyle:
              split && matchMedia('(min-width: 48rem)').matches
                ? ('split' as const)
                : ('unified' as const),
            disableFileHeader: true,
            overflow,
            unsafeCSS: SCROLLBAR_CSS,
            onPostRender,
            enableGutterUtility: commenting,
            onGutterUtilityClick: (range: {
              start: number;
              end: number;
              side?: 'additions' | 'deletions';
              endSide?: 'additions' | 'deletions';
            }) => {
              const side = range.endSide ?? range.side ?? 'additions';
              const [a, b] = [range.start, range.end].sort((x, y) => x - y);
              startComment({
                cwd: props.workspace.cwd,
                path: k.path,
                view: k.view,
                side,
                start: a!,
                end: b!,
                code: sides[side].slice(a! - 1, b!),
              });
            },
            renderAnnotation: (a: { metadata?: unknown }) => {
              const id = (a.metadata as { id?: string } | undefined)?.id;
              return id ? card(id) : undefined;
            },
          };
          const diff = (instance ??= new diffs.FileDiff(
            options,
          )) as InstanceType<Diffs['FileDiff']>;
          diff.setOptions(options);
          diff.render({
            oldFile: { name: k.oldPath ?? k.path, contents: oldText },
            newFile: { name: k.path, contents: newText },
            containerWrapper: host!,
            forceRender: true,
            lineAnnotations: untrack(placed),
          });
        } else {
          if (data.text === null) {
            drop();
            setNote(
              data.reason === 'missing' ? 'File not found' : problem(data),
            );
            return;
          }
          setNote('');
          const kind = preview && previewKind(k.path);
          if (kind) {
            drop();
            setRendered({ kind, text: data.text });
            return;
          }
          const options = {
            theme: THEME,
            themeType: 'system' as const,
            disableFileHeader: true,
            overflow,
            unsafeCSS: SCROLLBAR_CSS,
            onPostRender,
          };
          const file = (instance ??= new diffs.File(options)) as InstanceType<
            Diffs['File']
          >;
          file.setOptions(options);
          file.render({
            file: { name: k.path, contents: data.text },
            containerWrapper: host!,
            forceRender: true,
          });
        }
      },
      // A failed read is a note in place, not an error for the whole page.
      error: (error) => {
        drop();
        setRendered(undefined);
        showMedia([]);
        setNote(error instanceof Error ? error.message : String(error));
      },
    },
  );

  return (
    <div
      ref={(el) => (scroller = el)}
      class="relative min-h-0 flex-1 overflow-auto overscroll-contain"
    >
      <div ref={(el) => (host = el)} class="code-view" />
      <div
        ref={(el) => (bar = el)}
        hidden
        class="code-scrollbar sticky bottom-0 overflow-x-auto overflow-y-hidden bg-bg"
        onScroll={onScroll}
      >
        <div ref={(el) => (spacer = el)} class="h-px" />
      </div>
      <Show when={rendered()}>
        {(r) => (
          <div class="absolute inset-0 overflow-auto">
            <FilePreview kind={r().kind} text={r().text} path={props.path} />
          </div>
        )}
      </Show>
      <Show when={media().length}>
        <div class="flex min-h-full flex-wrap items-start justify-center gap-6 p-6">
          <For each={media()}>
            {(m) => (
              <figure
                class={[
                  'flex min-w-0 flex-col items-center gap-2',
                  {
                    'h-[80dvh] w-full max-w-4xl flex-1':
                      m.mimeType === 'application/pdf',
                  },
                ]}
              >
                <Show when={m.label}>
                  <figcaption class="text-meta text-muted">
                    {m.label}
                  </figcaption>
                </Show>
                <Switch>
                  <Match when={m.mimeType.startsWith('image/')}>
                    <img
                      src={m.url}
                      alt={props.path}
                      class="max-w-full rounded-card border border-line bg-panel"
                    />
                  </Match>
                  <Match when={m.mimeType.startsWith('video/')}>
                    <video
                      src={m.url}
                      controls
                      class="max-w-full rounded-card"
                    />
                  </Match>
                  <Match when={m.mimeType.startsWith('audio/')}>
                    <audio src={m.url} controls />
                  </Match>
                  <Match when={m.mimeType === 'application/pdf'}>
                    <iframe
                      src={m.url}
                      title={props.path}
                      class="w-full flex-1 rounded-card border border-line"
                    />
                  </Match>
                </Switch>
              </figure>
            )}
          </For>
        </div>
      </Show>
      <Show when={note()}>
        <p class="absolute inset-x-0 top-0 p-6 text-center text-muted">
          {note()}
        </p>
      </Show>
    </div>
  );
}
