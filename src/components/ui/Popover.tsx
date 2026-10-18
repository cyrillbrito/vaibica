import type { JSX } from '@solidjs/web';

import Input from './Input';

/**
 * A menu panel under the button with `popovertarget={id}` and
 * `style={{ 'anchor-name': `--${id}` }}`, starting at its left edge and
 * flipping above when there's no room. A sheet from the bottom on phones.
 * The children sit in the white card, as in the model picker.
 */
export function Popover(props: {
  id: string;
  label: string;
  onToggle?: (open: boolean) => void;
  children: JSX.Element;
}) {
  return (
    <div
      id={props.id}
      popover="auto"
      role="dialog"
      aria-label={props.label}
      style={{ '--anchor': `--${props.id}` }}
      onToggle={(e) => props.onToggle?.(e.newState === 'open')}
      class={[
        'm-0 flex-col overflow-hidden bg-panel p-1 text-fg shadow-menu open:flex max-md:sheet max-md:shadow-sheet md:pop md:origin-top-left',
        'inset-x-0 top-auto bottom-0 w-full max-w-none rounded-t-tray pb-[env(safe-area-inset-bottom)] backdrop:bg-black/40',
        'md:inset-auto md:mt-1 md:w-80 md:rounded-tray md:pb-1 md:backdrop:bg-transparent md:[position-anchor:var(--anchor)] md:[position-area:bottom_span-right] md:[position-try-fallbacks:flip-block]',
      ]}
    >
      <div class="flex min-h-0 flex-col overflow-hidden rounded-sheet border border-line bg-surface">
        {props.children}
      </div>
    </div>
  );
}

/** The search field at the top of a Popover. */
export function PopoverSearch(props: {
  ref?: (el: HTMLInputElement) => void;
  label: string;
  value: string;
  onInput: (value: string) => void;
}) {
  return (
    <div class="border-b border-line p-1.5">
      <Input
        ref={props.ref}
        class="h-8 w-full touch:h-11"
        type="search"
        aria-label={props.label}
        placeholder={`${props.label}…`}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
    </div>
  );
}
