# Elevation, lines and shape

<!-- Template. Fixed grid: What · Scale · Do · Don't · CSS. Corners, lines, shadows, overlays - whatever separates one layer from the next. -->

## What

<One paragraph: how layers are told apart - e.g. "lines, not shadows; only floating layers get one".>

## Scale

| Role | Value | Use |
|---|---|---|
| `shape.container` | | card, panel, dialog |
| `shape.inner` | | field, chip, list item |
| `elevation.popover` | | menus, popovers |

## Do

- <...>

## Don't

- <...>

## CSS

```css
.card { border-radius: var(--shape-container); }
```
