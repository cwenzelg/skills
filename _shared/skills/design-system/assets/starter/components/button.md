# Button

<!-- Template for every component spec. The six "##" sections are checked by check-system.mjs. -->

## Purpose

The one primary action of a screen. A screen has at most one.

## Anatomy

- Container (pill), label, optional leading icon.

## Tokens

| Part | Token |
|---|---|
| background | `button.bg` |
| label | `button.text` |
| corner | `button.radius` |
| disabled background | `button.disabled.bg` |

## States

| State | What changes |
|---|---|
| default | as specified |
| disabled | `button.disabled.bg`, label unchanged, no pointer |

## Do

- One per screen, at the bottom within thumb reach.

## Don't

- Never a second filled button next to it - use a quiet text button.
