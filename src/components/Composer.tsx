import type { JSX } from '@solidjs/web';
import { For, Show, createEffect, createSignal, untrack } from 'solid-js';

import { imageUrl, toPromptImage } from '#lib/images';
import type { PromptImage } from '#lib/protocol';
import Alert from './ui/Alert';
import { openContextMenu } from './ui/ContextMenu';
import { createDropZone } from './ui/DropZone';
import { Button, IconButton } from './ui/Button';
import {
  ArrowUpIcon,
  ChevronIcon,
  CloseIcon,
  ImageIcon,
  QueueIcon,
  SpinnerIcon,
  StopIcon,
} from './ui/icons';

type Attached = PromptImage & { id: number };
let nextId = 0;

// Prompts sent from this browser, oldest first, shared by every composer.
const HISTORY_KEY = 'prompt-history';
const readHistory = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
};
const remember = (prompt: string) => {
  // Huge prompts would fill localStorage's few megabytes.
  if (prompt.length > 20_000) return;
  const list = readHistory().filter((p) => p !== prompt);
  list.push(prompt);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-200)));
  } catch {}
};

// What's typed, kept per session so it neither follows you to the next one
// nor dies with a reload. Images stay in memory, since they're too big.
type Draft = { text: string; pastes: [number, string][] };
const draftKey = (key: string) => `draft:${key}`;
const readDraft = (key: string): Draft => {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey(key)) ?? 'null');
    if (draft) return draft;
  } catch {}
  return { text: '', pastes: [] };
};
const writeDraft = (key: string, draft: Draft) => {
  try {
    if (draft.text.trim())
      localStorage.setItem(draftKey(key), JSON.stringify(draft));
    else localStorage.removeItem(draftKey(key));
  } catch {}
};
const draftImages = new Map<string, Attached[]>();

const foldedPaste = /\[Pasted text #(\d+) · \d+ lines\]/g;

export interface ComposerApi {
  // Puts a prompt taken back from the queue into the box, after what's typed.
  restore: (prompt: string, images: PromptImage[]) => void;
  problem: (message: string) => void;
}

export default function Composer(props: {
  // steer: join the current run after its step, instead of queuing.
  // alternate: sent with the `alternate` send instead of the main one.
  onSend: (
    prompt: string,
    images: PromptImage[],
    steer: boolean,
    alternate: boolean,
  ) => Promise<unknown>;
  // Words on the send button, when sending does more than send.
  sendLabel?: string;
  // A second way to send, in a menu on the send button's side.
  alternate?: string;
  // Where the draft is kept, e.g. the session id.
  draft: string;
  placeholder?: string;
  // Next to attach, e.g. the model picker.
  controls?: JSX.Element;
  // Just left of stop and send, e.g. the voice call button.
  actions?: JSX.Element;
  // Above the text, inside the box, e.g. the queued prompts.
  top?: JSX.Element;
  // A run is working: sending queues, and a stop button shows.
  busy?: boolean;
  onStop?: () => Promise<unknown>;
  ref?: (api: ComposerApi) => void;
}) {
  const [images, setImages] = createSignal<Attached[]>([]);
  const [problem, setProblem] = createSignal('');
  const [stopping, setStopping] = createSignal(false);
  // Whether there's anything to send: the send button wakes up when there is.
  const [typed, setTyped] = createSignal(false, { name: 'composerTyped' });
  const empty = () => !typed() && !images().length;
  // The arrow swaps back in only after it was the queue icon, not on load.
  let queued = false;
  createEffect(
    () => props.busy && !empty(),
    (on) => {
      if (on) queued = true;
    },
  );
  let picker!: HTMLInputElement;
  let textarea!: HTMLTextAreaElement;
  // Long pastes show as a short marker and go out in full.
  const pastes = new Map<number, string>();
  const unfold = (text: string) =>
    text.replace(foldedPaste, (marker, n) => pastes.get(Number(n)) ?? marker);
  // Where ↑/↓ is in the history, and what was typed before; null while typing.
  let browsing: { list: string[]; index: number; draft: string } | null = null;
  let lastEscape = 0;
  // What a held ↑/↓ is doing, so holding never crosses from lines into history.
  let hold: 'caret' | 'history' = 'caret';

  // The caret lands where the same key goes on through the history.
  const showText = (text: string, caret: 'start' | 'end') => {
    textarea.value = text;
    const at = caret === 'start' ? 0 : text.length;
    textarea.setSelectionRange(at, at);
    save();
  };

  const save = (key = props.draft) => {
    setTyped(!!textarea.value.trim());
    writeDraft(key, { text: textarea.value, pastes: [...pastes] });
  };

  createEffect(
    () => props.draft,
    (key, previous) => {
      if (previous !== undefined) {
        save(previous);
        draftImages.set(previous, untrack(images));
      }
      const draft = readDraft(key);
      textarea.value = draft.text;
      setTyped(!!draft.text.trim());
      pastes.clear();
      for (const [n, text] of draft.pastes) pastes.set(n, text);
      browsing = null;
      setImages(draftImages.get(key) ?? []);
      draftImages.delete(key);
      setProblem('');
    },
  );

  const api: ComposerApi = {
    restore(prompt, restored) {
      if (prompt)
        textarea.value = textarea.value.trim()
          ? `${textarea.value.trimEnd()}\n\n${prompt}`
          : prompt;
      if (restored.length)
        setImages((list) => [
          ...list,
          ...restored.map((i) => ({ ...i, id: ++nextId })),
        ]);
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      save();
    },
    problem: setProblem,
  };

  const stop = async () => {
    if (!props.onStop || stopping()) return;
    setStopping(true);
    setProblem('');
    try {
      await props.onStop();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setStopping(false);
    }
  };

  const drop = createDropZone({
    accept: 'image/',
    noun: 'image',
    onFiles: (files) => void attach(files),
  });

  const attach = async (files: File[]) => {
    setProblem('');
    for (const file of files) {
      try {
        const image = { ...(await toPromptImage(file)), id: ++nextId };
        setImages((list) => [...list, image]);
      } catch (error) {
        setProblem(error instanceof Error ? error.message : String(error));
      }
    }
  };

  const send = async (steer: boolean, alternate = false) => {
    const key = props.draft;
    const typed = textarea.value.trim();
    const sentPastes = [...pastes];
    const prompt = unfold(typed);
    const sent = images();
    if (!prompt && !sent.length) return;
    // Cleared up front so typing can go on; put back if it fails.
    textarea.value = '';
    save();
    browsing = null;
    setImages([]);
    setProblem('');
    try {
      await props.onSend(
        prompt,
        sent.map(({ mimeType, data }) => ({ mimeType, data })),
        steer,
        alternate,
      );
      if (prompt) remember(prompt);
      if (props.draft === key && !textarea.value.includes('[Pasted text #'))
        pastes.clear();
    } catch (error) {
      console.error(error);
      if (props.draft !== key) {
        // Moved on to another session meanwhile: back into its own draft.
        if (!readDraft(key).text)
          writeDraft(key, { text: typed, pastes: sentPastes });
        return;
      }
      if (!textarea.value) textarea.value = typed;
      save();
      setImages((list) => [...sent, ...list]);
    }
  };

  return (
    // A tray behind the card, after affectUI's Chat Composer: queued prompts
    // and warnings sit on it, above the box. It reaches 4px past the card,
    // so the card stays where it was. It only shows with something on it:
    // everything that turns up there enters with `appear`.
    <div class="-m-1 flex flex-col rounded-tray p-1 transition-colors duration-200 has-[[data-tray]_.appear]:bg-panel">
      <div data-tray class="flex flex-col px-1">
        {props.top}
      </div>
      <form
        ref={() => props.ref?.(api)}
        {...drop.handlers}
        class="relative flex flex-col gap-1 rounded-sheet border border-line bg-surface py-2.5 pr-2.5 pl-4 shadow-raised transition-[border-color,box-shadow] duration-200 ease-out focus-within:border-line-strong focus-within:ring-3 focus-within:ring-accent/12"
        onSubmit={(e) => {
          e.preventDefault();
          void send(false);
        }}
      >
        <Show when={images().length}>
          <div class="flex flex-wrap gap-2 pt-1.5">
            <For each={images()} keyed={(i) => i.id}>
              {(image) => (
                <div class="group/img appear relative">
                  <img
                    src={imageUrl(image())}
                    alt=""
                    class="size-14 rounded-lg border border-line object-cover"
                  />
                  <button
                    type="button"
                    class="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border border-line bg-surface text-muted shadow-thumb transition-[color,scale,opacity] duration-150 ease-out hover:text-fg motion-safe:active:scale-90 touch:size-7 [&_svg]:size-3"
                    title="Remove image"
                    onClick={() =>
                      setImages((list) =>
                        list.filter((i) => i.id !== image().id),
                      )
                    }
                  >
                    <CloseIcon />
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
        <textarea
          ref={(el) => (textarea = el)}
          name="prompt"
          rows="1"
          class="max-h-[40vh] min-h-8 resize-none bg-transparent py-1 text-read outline-none [field-sizing:content] placeholder:text-muted"
          placeholder={
            props.busy
              ? 'Queue a follow-up…'
              : (props.placeholder ?? 'Ask anything…')
          }
          onInput={() => {
            browsing = null;
            save();
          }}
          onPaste={(e) => {
            // Screenshots and copied images arrive as files.
            const files = [...(e.clipboardData?.items ?? [])].flatMap(
              (item) => {
                const file =
                  item.kind === 'file' && item.type.startsWith('image/')
                    ? item.getAsFile()
                    : null;
                return file ? [file] : [];
              },
            );
            if (files.length) {
              e.preventDefault();
              void attach(files);
              return;
            }
            const text = e.clipboardData?.getData('text/plain') ?? '';
            const lines = text.split('\n').length;
            if (lines <= 15 && text.length <= 2000) return;
            e.preventDefault();
            const n = pastes.size + 1;
            pastes.set(n, text);
            const marker = `[Pasted text #${n} · ${lines} lines]`;
            // execCommand keeps the paste in the undo history; setRangeText doesn't.
            if (!document.execCommand('insertText', false, marker))
              textarea.setRangeText(
                marker,
                textarea.selectionStart,
                textarea.selectionEnd,
                'end',
              );
            save();
          }}
          onKeyDown={(e) => {
            if (e.isComposing) return;
            if (e.key === 'Escape' && props.busy && props.onStop) {
              // Twice, so closing something with Esc can't stop a run by accident.
              if (e.timeStamp - lastEscape < 500) {
                lastEscape = 0;
                void stop();
              } else lastEscape = e.timeStamp;
              return;
            }
            const box = e.currentTarget;
            const caret = box.selectionStart;
            const noSelection = caret === box.selectionEnd;
            const plain = !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey;
            // History only from the very start or end, so ↑/↓ elsewhere moves lines.
            const arrow = e.key === 'ArrowUp' || e.key === 'ArrowDown';
            const canSwitch = !e.repeat || hold === 'history';
            if (arrow) hold = 'caret';
            if (
              e.key === 'ArrowUp' &&
              plain &&
              noSelection &&
              canSwitch &&
              caret === 0
            ) {
              browsing ??= {
                list: readHistory(),
                index: -1,
                draft: box.value,
              };
              const index =
                (browsing.index === -1
                  ? browsing.list.length
                  : browsing.index) - 1;
              if (index < 0) return;
              e.preventDefault();
              hold = 'history';
              browsing.index = index;
              showText(browsing.list[index]!, 'start');
              return;
            }
            if (
              e.key === 'ArrowDown' &&
              plain &&
              noSelection &&
              browsing &&
              canSwitch &&
              caret === box.value.length
            ) {
              e.preventDefault();
              hold = 'history';
              const index = browsing.index + 1;
              if (index >= browsing.list.length) {
                showText(browsing.draft, 'end');
                browsing = null;
              } else {
                browsing.index = index;
                showText(browsing.list[index]!, 'end');
              }
              return;
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send(!!props.busy);
              return;
            }
            // On touch keyboards Enter is the only way to add a newline.
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !matchMedia('(pointer: coarse)').matches
            ) {
              e.preventDefault();
              void send(false);
            }
          }}
        />
        <Show when={problem()}>
          <Alert>{problem()}</Alert>
        </Show>
        <div class="-ml-1.5 flex items-center gap-0.5">
          <IconButton
            size="md"
            title="Attach images"
            onClick={() => picker.click()}
          >
            <ImageIcon />
          </IconButton>
          <input
            ref={(el) => (picker = el)}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.currentTarget.files ?? [])];
              // Cleared so picking the same file again still fires.
              e.currentTarget.value = '';
              void attach(files);
            }}
          />
          {props.controls}
          <div class="ml-auto" />
          {props.actions}
          <Show when={props.busy && props.onStop}>
            <IconButton
              class="ml-1 bg-active text-fg [&_svg]:size-3"
              size="md"
              round
              title="Stop (Esc twice)"
              disabled={stopping()}
              onClick={() => void stop()}
            >
              <Show when={stopping()} fallback={<StopIcon />}>
                <SpinnerIcon />
              </Show>
            </IconButton>
          </Show>
          <Show when={props.sendLabel}>
            {(label) => (
              <Button
                class={[
                  'ml-1 pr-2.5 pl-3 [&_svg]:size-3.5 [&_svg]:stroke-[2.5]',
                  props.alternate && 'rounded-r-none pr-2',
                  empty() && 'opacity-30',
                ]}
                variant="primary"
                size="md"
                round
                type="submit"
                title={props.busy ? `${label()}, after this run` : label()}
                aria-disabled={empty() ? 'true' : undefined}
              >
                {label()}
                <Show when={props.busy && !empty()} fallback={<ArrowUpIcon />}>
                  <QueueIcon />
                </Show>
              </Button>
            )}
          </Show>
          <Show when={props.sendLabel && props.alternate}>
            <IconButton
              class={[
                'rounded-l-none border-l border-bg/25 [&_svg]:size-3.5 [&_svg]:rotate-90',
                empty() && 'opacity-30',
              ]}
              variant="primary"
              size="md"
              round
              title="More ways to send"
              aria-haspopup="menu"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                openContextMenu(r.right - 240, r.top - 52, [
                  {
                    label: props.alternate!,
                    icon: <ArrowUpIcon />,
                    disabled: empty() ? 'Type a message first' : undefined,
                    onSelect: () => void send(false, true),
                  },
                ]);
              }}
            >
              <ChevronIcon />
            </IconButton>
          </Show>
          {/* Faded while there's nothing to send, solid once there is; while
            the agent works, the arrow turns into "queue". */}
          <IconButton
            hidden={!!props.sendLabel}
            class={[
              'ml-1 [&_svg]:size-3.5 [&_svg]:stroke-[2.5]',
              empty() && 'opacity-30 motion-safe:scale-90',
            ]}
            variant="primary"
            size="md"
            round
            type="submit"
            title={props.busy ? 'Queue (⌘Enter joins the run now)' : 'Send'}
            aria-disabled={empty() ? 'true' : undefined}
          >
            <Show
              when={props.busy && !empty()}
              fallback={
                <span class={queued ? 'swap-in' : 'inline-flex'}>
                  <ArrowUpIcon />
                </span>
              }
            >
              <span class="swap-in">
                <QueueIcon />
              </span>
            </Show>
          </IconButton>
        </div>
        <drop.Overlay />
      </form>
    </div>
  );
}
