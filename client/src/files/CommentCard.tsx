import { Show, createMemo, onSettled } from 'solid-js';

import { comments, editComment, removeComment, saveComment } from './review';
import { Button, IconButton } from '../ui/Button';
import Kbd from '../ui/Kbd';
import { CommentIcon, DeleteIcon, PencilIcon } from '../ui/icons';

/**
 * Prototype: a comment under diff lines, rendered by Pierre into its
 * annotation slot. While a draft, a box to write it; then the comment with
 * its lines, to edit or delete. Comments go to the agent from the review bar.
 */
export default function CommentCard(props: { id: string }) {
  const c = createMemo(() => comments().find((x) => x.id === props.id));
  const lines = () => {
    const x = c();
    if (!x) return '';
    return x.start === x.end ? `Line ${x.end}` : `Lines ${x.start}–${x.end}`;
  };
  let box: HTMLTextAreaElement | undefined;
  const save = () => {
    const text = box?.value.trim() ?? '';
    if (text) saveComment(props.id, text);
    else removeComment(props.id);
  };
  const cancel = () => {
    const x = c();
    // A comment being edited keeps its text; a new empty one goes.
    if (x?.text) saveComment(props.id, x.text);
    else removeComment(props.id);
  };

  return (
    <Show when={c()}>
      {(x) => (
        <div class="px-3 py-2 font-ui text-ui whitespace-normal">
          <div class="max-w-xl rounded-card border border-line bg-surface p-1 shadow-raised motion-safe:animate-chip-in">
            <Show
              when={x().draft}
              fallback={
                <div class="group/comment flex gap-2.5 px-2 py-1.5">
                  <span class="mt-0.5 shrink-0 text-accent">
                    <CommentIcon />
                  </span>
                  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="text-meta text-muted">
                      {lines()} · for the agent
                    </span>
                    <p class="text-pretty break-words whitespace-pre-wrap">
                      {x().text}
                    </p>
                  </div>
                  <div class="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity group-hover/comment:opacity-100 group-focus-within/comment:opacity-100 touch:opacity-100">
                    <IconButton
                      size="sm"
                      title="Edit"
                      onClick={() => editComment(props.id)}
                    >
                      <PencilIcon />
                    </IconButton>
                    <IconButton
                      size="sm"
                      title="Delete"
                      onClick={() => removeComment(props.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </div>
                </div>
              }
            >
              <Draft
                lines={lines()}
                text={x().text}
                ref={(el) => (box = el)}
                onSave={save}
                onCancel={cancel}
              />
            </Show>
          </div>
        </div>
      )}
    </Show>
  );
}

function Draft(props: {
  lines: string;
  text: string;
  ref: (el: HTMLTextAreaElement) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  let el!: HTMLTextAreaElement;
  // Pierre attaches the slot after render; focus once it's in the page.
  onSettled(() => {
    requestAnimationFrame(() => el.focus({ preventScroll: true }));
  });
  return (
    <form
      class="flex flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSave();
      }}
    >
      <textarea
        ref={(t) => {
          el = t;
          props.ref(t);
        }}
        rows="2"
        aria-label={`Comment on ${props.lines.toLowerCase()}`}
        placeholder={`Comment on ${props.lines.toLowerCase()} for the agent…`}
        class="max-h-48 min-h-14 resize-none bg-transparent px-2.5 pt-2 pb-1 leading-snug outline-none [field-sizing:content] placeholder:text-muted touch:text-read"
        value={props.text}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            props.onSave();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            props.onCancel();
          }
        }}
      />
      <div class="flex items-center justify-end gap-1 px-1 pb-0.5">
        <Button size="sm" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" type="submit">
          Comment <Kbd class="bg-bg/15 text-bg/70">⌘↵</Kbd>
        </Button>
      </div>
    </form>
  );
}
