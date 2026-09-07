# design/PROJECT.md template

The project-specific half of the design process. Everything the shared `screen-design` skill
needs to know about *this* app. Keep it short; point at files rather than copying them.

```markdown
# Design: <project name>

## Repositories and branches
- Frontend: <repo, path>. Base branch for work: `<dev>`. Never commit to `<main>`.
- Backend: <repo, path> (if the design touches API shape)
- Design source of truth: this `design/` folder (in <which repo>)

## Stack
<framework, UI library, state library, i18n library, test runner and command, lint command>

## Design system sources (read these before drafting)
- Theme / tokens: `<path to theme file>`
- Global stylesheet and scale: `<path to main.css or equivalent>`
- Base components: `<folder>`: <Button, Table, Modal, ...>
- Layout components: `<folder>`: <Header, Sidebar, ...>
- Icons: `<component or set>`, names from `<file that lists them>`
- Brand assets: `design/draft/assets/` (extracted from `<source files>`)

## Component map (design pattern → real component)
| In the design | Build with |
|---|---|
| primary / secondary button | `<component>` with `<classes>` |
| table rows | `<component>` |
| pills / chips | `<component>` |
| cards | `<component>` |
| page header | `<component>` |
| modal | `<component>` |

## Copy
- Language: <e.g. German, `du`>; i18n files: `<paths>`; key convention: `<screen>.<element>`
- Tone: <one line>

## Screens
- Routes and where each page file lives: `<folder>`
- Which screens are out of scope for design (e.g. auth, billing) and why

## Local viewing
- Serve `design/handoff/<route>/` with: `<command>`

## Findings backlog
- Process/method findings (not this screen's issues) go to: `<Notion "Feature ideas · X" DB,
  BOARD.md, or whatever this project keeps>`, owner `design-agent`.
```
