import type { JSX } from '@solidjs/web';

/** The clickable row of a `<details>`, without the browser's marker. */
export default function Summary(props: {
  children: JSX.Element;
  class?: string;
}) {
  return (
    <summary
      class={[
        'flex h-7 list-none items-center gap-2 rounded-md px-1.5 text-muted transition-colors select-none hover:bg-hover hover:text-fg touch:h-11 [&::-webkit-details-marker]:hidden',
        props.class,
      ]}
    >
      {props.children}
    </summary>
  );
}
