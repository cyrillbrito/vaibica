import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import d2 from 'astro-d2';

export default defineConfig({
  // Bun's isolated install hides satteri's native package from the bundled
  // prerender chunks, so load it from node_modules instead.
  vite: {
    ssr: { external: ['satteri'] },
    server: { allowedHosts: ['.ts.net'] },
  },
  integrations: [
    // D2.js renders in JavaScript, so no D2 binary has to be installed.
    d2({
      experimental: { useD2js: true },
      layout: 'elk',
      pad: 40,
      inline: true,
    }),
    starlight({
      title: 'Bica',
      logo: { src: './public/favicon.svg' },
      favicon: '/favicon.svg',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/cyrillbrito/vaibica',
        },
      ],
      sidebar: [
        { label: 'Start', items: ['docs', 'docs/architecture'] },
        {
          label: 'Concepts',
          items: ['docs/how-a-prompt-travels', 'docs/sessions'],
        },
      ],
    }),
  ],
});
