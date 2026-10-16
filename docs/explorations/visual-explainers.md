# Visual explainers

Research into tools and agent skills that turn Bica's code and docs into diagrams, posters, and animated videos. The goal is content for social media and for understanding the architecture: how a prompt travels, how assistant mode works, how the front end keeps data, how tool calls run.

The filter was real use. Star counts come from the GitHub API on 2026-10-12. Many skills with near-zero stars came up in searches and were dropped.

## Diagrams and posters

| Tool | Stars | Output |
| --- | --- | --- |
| [Archify](https://github.com/tt-a1i/archify) | 82k | Interactive HTML diagram of a repo or idea |
| [diagram-design](https://github.com/cathrynlavery/diagram-design) | 50k | HTML and SVG diagrams, 44 types, in your brand |
| [visual-explainer](https://github.com/nicobailon/visual-explainer) | 10k | HTML explainer pages and slide decks |
| [drawio-skill](https://github.com/Agents365-ai/drawio-skill) | 10k | Editable draw.io diagrams from code |
| [architecture-diagram-generator](https://github.com/Cocoon-AI/architecture-diagram-generator) | 7k | Dark HTML architecture diagrams with PNG export |
| [excalidraw-diagram-skill](https://github.com/coleam00/excalidraw-diagram-skill) | 5k | Hand-drawn Excalidraw diagrams, checks its own render |

Archify maps a codebase, links nodes to source, and traces paths, which makes it the best for personal understanding. It is interactive, so for social media it needs a screen recording.

diagram-design looks the most finished and can pull a palette and fonts from a site. It is the best fit for a poster. Its output is mostly static.

visual-explainer is by nicobailon, who works in the Pi world. It is good for reading architecture and diffs, less for posting.

The Excalidraw skill gives a friendly hand-drawn look that does well on social media. It renders with Playwright and fixes its own layout.

## Video

| Tool | Stars | Output |
| --- | --- | --- |
| [Remotion](https://github.com/remotion-dev/remotion) with [its skills](https://github.com/remotion-dev/skills) | 63k / 5k | MP4 from React components |
| [HyperFrames](https://github.com/heygen-com/hyperframes) | 61k | MP4 from HTML compositions |
| [/brag](https://github.com/latent-spaces/brag) | 15k | 20 second launch video, built on HyperFrames |
| [video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) | 11k | Product promo films on Remotion |
| [anything2explainer](https://github.com/Vincentwei1021/anything2explainer) | 2.4k | Narrated 2 to 8 minute explainers on Remotion |

Remotion is the most mature and the one people mean by "React into videos". Every frame is a React component, so Bica's own look can be rebuilt in it. It is free for individuals and small companies only.

HyperFrames, from HeyGen, renders video from plain HTML with timing in data attributes. Its skills top the skills.sh leaderboard right now. It is newer and company-owned.

/brag and video-shotcraft make promos, not architecture explainers. anything2explainer makes full narrated explainers with voiceover and subtitles, but a video takes one to three hours and about 2 GB.

## Engines without a strong skill

- [Motion Canvas](https://github.com/motion-canvas/motion-canvas) (19k) makes TypeScript animations with good code highlighting and transitions.
- [Manim](https://github.com/ManimCommunity/manim) (41k) makes 3Blue1Brown-style videos, best for math.
- [Code Hike](https://github.com/code-hike/codehike) (5k) and [shiki-magic-move](https://github.com/shikijs/shiki-magic-move) (1.5k) animate code changing between steps. Both can go inside a Remotion video.
- [Excalidraw](https://github.com/excalidraw/excalidraw), [tldraw](https://github.com/tldraw/tldraw), [Mermaid](https://github.com/mermaid-js/mermaid), and [D2](https://github.com/d2lang/d2) are the diagram engines most skills build on.
- [ByteDiagram](https://bytediagram.com) makes ByteByteGo-style animated diagrams without code.

## Catalogs

- [awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) (35k), a curated list of over 1000 skills.
- [skills.sh](https://skills.sh), the skills leaderboard, which shows installs.
- GitHub topic searches such as `topic:agent-skills diagram` sorted by stars found most of the tools above.
- [How I vibe code technical videos with Claude Code and Remotion](https://www.youtube.com/watch?v=z7Bkf3Vc63U), a walkthrough on YouTube.

## Trial

Three sessions each explain assistant mode with one tool, so the results can be compared side by side: Archify, diagram-design, and Remotion. Their output went to `~/tau-visuals/`, outside the repo.

- diagram-design made the best still: a dark poster in Bica's tokens and fonts, ready to post. The skill is a design spec with no layout engine, so the agent places every coordinate by hand, and PNG export needs a browser screenshot.
- Archify made the best map for understanding: 14 nodes linked to source on GitHub, with a clickable path trace. It reads as a busy dashboard in a still, its edge labels are tiny, and its finalize step needed manual Chrome setup.
- Remotion made a 50 second 1080x1080 video in 9 scenes that animates the context bar, the cache clock, and memory files. It is the most shareable of the three. Text layout is by hand and needed frame checks, and the first render tried a slow Chrome download.

None of the three lays out a diagram on its own. Each needs an agent that checks rendered images and fixes overlaps.
