// The τ! mark. Same drawing as public/favicon.svg and public/apple-touch-icon.png.
export function Logo(props: { size?: number; class?: string }) {
  return (
    <svg
      width={props.size ?? 20}
      height={props.size ?? 20}
      viewBox="0 0 32 32"
      class={props.class}
      aria-hidden="true"
    >
      <path
        d="M16 0C28 0 32 4 32 16S28 32 16 32 0 28 0 16 4 0 16 0Z"
        fill="#2f5bd3"
      />
      <g transform="translate(15.1 16.4) skewX(-10) translate(-15.3 -16.2)">
        <g
          fill="none"
          stroke="#fff"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M5.5 12.5 Q6.3 9.5 9.5 9.5 H18.5 M13 9.5 V19.5 Q13 23.5 17 23.5 H17.5"
            stroke-width="3"
          />
          <path d="M24.5 9.5 V18.5" stroke-width="3.2" />
        </g>
        <circle cx="24.5" cy="23.4" r="2" fill="#fff" />
      </g>
    </svg>
  );
}
