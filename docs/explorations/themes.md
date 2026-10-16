# Color themes

An idea, not built: pick Tau's colors from well-known editor themes. This doc records the plan so it can be picked up later.

## The idea

Today Tau has one light palette and one dark palette, written by hand in `src/App.css`, and one setting (System, Light, Dark) that picks between them.

The plan is to offer well-known editor themes instead, such as GitHub, Catppuccin, Rosé Pine, and Gruvbox. There are three reasons:

- The current dark palette is close to black, which is not to everyone's taste. Many existing themes are softer, such as GitHub Dark Dimmed, Rosé Pine Moon, and Catppuccin Frappé.
- These themes are tuned by their authors and tested by many users. Picking the one you already use in VS Code or your terminal makes Tau feel like part of the same setup.
- One choice colors everything. The app, syntax highlighting in diffs and code, and the terminal all take their colors from the same theme, where today they are three separate sets.

## Settings

There are three settings, all per device like the current theme setting:

- The light theme is used when the app is light, and only light themes are offered.
- The dark theme is used when the app is dark, and only dark themes are offered.
- Appearance is System, Light, or Dark. System follows the device and switches between the two themes on its own, and Light or Dark pins one.

Picking a theme and picking light or dark are separate decisions. Someone can pair GitHub Light with Rosé Pine Moon and still let the system switch between them at sunset. Ghostty works the same way, with `theme = light:X,dark:Y`.

Tau's own palette stays as a theme in both lists, and it is the default.

## Where the themes come from

The themes are VS Code themes, taken from the copies Shiki already ships in `@shikijs/themes`, which is installed with Pierre. There are about 65, light and dark.

A VS Code theme describes the whole editor, not only code. It has about 240 named colors for the editor background, sidebar, panels, borders, hover and selected rows, focus rings, buttons, input fields, git decorations, and the 16 terminal colors. That is enough to fill every Tau color token from the theme itself, without guessing.

Two alternatives were considered:

- Ghostty and iTerm2 color schemes (iTerm2-Color-Schemes, 450+ themes, which Ghostty bundles) have only a background, a foreground, a selection color, and the 16 terminal colors. They have no grays in between for panels, borders, or muted text, so most of the app's colors would have to be invented and would no longer match the source.
- Base16 and Tinted Theming have a gray scale plus eight accent colors, with hundreds of schemes. That is better than terminal schemes, but it has fewer roles than VS Code and is less familiar.

VS Code themes give the most to work with, and the same theme names already drive the code highlighting in Pierre.

## How a theme becomes Tau's colors

Each Tau token is read from the theme's VS Code colors, by role:

- Page, panel, and card backgrounds come from the editor, sidebar, and widget backgrounds.
- Lines come from the theme's border colors.
- Text and muted text come from the foreground colors.
- Hover and selected rows come from the list colors. Where a theme leaves them out, they are mixed from background and text.
- The accent comes from the theme's focus or button color.
- Running, warning, danger, and merged come from the theme's terminal green, yellow, red, and magenta.

Code views and diffs use the same theme by name for syntax colors, and the terminal uses the theme's terminal colors.

These rules hold whatever the theme:

- Diff colors stay blue and orange. The author can't tell reds from greens, so added and removed lines keep the colorblind palette (see `.code-view` in `src/App.css`).
- Status colors and muted text must stay readable (WCAG AA) on the theme's background. If they don't, they are adjusted toward the text color.
- Status is never shown by color alone. This is already a rule in `UI.md`, and it matters more when the colors change.

## Which themes

Tau will offer a short, tested list, not all 65. Some themes, such as Synthwave and Red, suit an editor but not an app's chrome. Each theme should look right on the main screens (session, project page, settings, phone) before it is added.

A starting set, in light and dark pairs where the theme has both:

- Tau, the current palette
- GitHub (Light; Dark Dimmed, Dark)
- Catppuccin (Latte; Frappé, Macchiato, Mocha)
- Rosé Pine (Dawn; Moon, Main)
- Gruvbox (Light Soft; Dark Soft, Dark Medium)
- Everforest, Solarized, Kanagawa, Tokyo Night, Nord, One Dark and One Light

## Open questions

- Should all themes load up front, or one when picked? The chosen theme must apply before first paint, like the current one, so it doesn't flash.
- Should the app's accent, Tau orange, override the theme's accent, or always follow the theme?
- Later, Tau could import a theme file, or follow the theme set in VS Code on the same machine.
