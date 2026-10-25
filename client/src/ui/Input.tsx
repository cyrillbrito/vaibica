import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

/** A single-line text field. 16px on touch so iOS doesn't zoom. */
export default function Input(
  props: JSX.InputHTMLAttributes<HTMLInputElement>,
) {
  const rest = omit(props, 'class');
  return (
    <input
      {...rest}
      class={[
        'min-w-0 rounded-md border border-line bg-surface px-2 text-fg outline-none transition-colors placeholder:text-muted focus:border-line-strong touch:text-read',
        props.class,
      ]}
    />
  );
}
