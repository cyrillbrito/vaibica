// Prototype: comments on diff lines, gathered per workspace and sent to an
// agent as one prompt. Kept in memory for the tab; a reload drops them.
import { createSignal } from 'solid-js';

import type { View } from './workspace';

export interface LineComment {
  id: string;
  // The workspace folder it belongs to.
  cwd: string;
  path: string;
  view: View;
  side: 'additions' | 'deletions';
  start: number;
  end: number;
  // The commented lines as they were, so the agent sees what you saw.
  code: string[];
  text: string;
  // Still being written: no text yet that counts.
  draft: boolean;
}

const [comments, setComments] = createSignal<LineComment[]>([], {
  name: 'reviewComments',
});
export { comments };

let next = 0;

/** A new comment box on lines of a diff; an open draft there is reused. */
export function startComment(c: Omit<LineComment, 'id' | 'text' | 'draft'>) {
  const open = comments().find(
    (x) =>
      x.draft &&
      x.cwd === c.cwd &&
      x.path === c.path &&
      x.side === c.side &&
      x.end === c.end,
  );
  if (open) return open.id;
  const id = `c${++next}`;
  setComments((all) => [...all, { ...c, id, text: '', draft: true }]);
  return id;
}

export function saveComment(id: string, text: string) {
  setComments((all) =>
    all.map((c) => (c.id === id ? { ...c, text, draft: false } : c)),
  );
}

export function editComment(id: string) {
  setComments((all) =>
    all.map((c) => (c.id === id ? { ...c, draft: true } : c)),
  );
}

export function removeComment(id: string) {
  setComments((all) => all.filter((c) => c.id !== id));
}

export const doneComments = (cwd: string) =>
  comments().filter((c) => c.cwd === cwd && !c.draft && c.text.trim());

export function clearComments(cwd: string) {
  setComments((all) => all.filter((c) => c.cwd !== cwd || c.draft));
}

const lines = (c: LineComment) =>
  c.start === c.end ? `${c.start}` : `${c.start}-${c.end}`;

/** The prompt for the agent: each comment with its file, lines, and code. */
export function reviewPrompt(list: LineComment[]) {
  const parts = list.map((c) => {
    const where = `${c.path}:${lines(c)}${c.side === 'deletions' ? ' (removed lines)' : ''}`;
    const code = c.code.length
      ? `\n\`\`\`\n${c.code.slice(0, 12).join('\n')}${c.code.length > 12 ? '\n…' : ''}\n\`\`\``
      : '';
    return `${where}${code}\n${c.text.trim()}`;
  });
  return `Review comments on your changes. Address each one:\n\n${parts.join('\n\n')}`;
}
