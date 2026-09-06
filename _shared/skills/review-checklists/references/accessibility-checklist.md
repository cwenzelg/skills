# Accessibility checklist (WCAG 2.1 AA)

Adapted from addyosmani/agent-skills (MIT), `references/accessibility-checklist.md` and the
accessibility section of `skills/frontend-ui-engineering`; rewritten for Vue / Nuxt templates and
our design process (the Designer's handoff, the Tester's Playwright run). Walk it whenever the
diff touches a screen, a form, a dialog, navigation, or implements a design handoff. A failed
item is a `[should-fix]` finding with file and line; a keyboard trap, a form without labels or
an unreachable primary action is `[blocking]`.

## Keyboard

- [ ] Every interactive element is reachable with Tab and operable with Enter / Space; native
      `<button>`, `<a href>`, `<input>`, `<select>` first, a `div` with `@click` never
- [ ] Focus order follows the visual order; no `tabindex` above `0`
- [ ] Focus is visible: outlines styled, never removed (`outline: none` without a replacement is
      a finding)
- [ ] Custom widgets have keyboard support (Enter activates, Escape closes, arrows move in a
      list or menu) and no keyboard trap
- [ ] Dialogs trap focus while open and return it to the opener on close (`<dialog>` or the
      design system's component, not a hand-rolled overlay)
- [ ] A skip-to-content link exists on multi-section pages, visible at least on focus

## Screen readers and semantics

- [ ] Every image has `alt`; decorative images `alt=""`; icons inside a labelled control are
      `aria-hidden="true"`
- [ ] Every form input has a label: `<label for="id">`, a wrapping `<label>`, or `aria-label`
      when no visible label exists (visible preferred)
- [ ] Icon-only buttons and links carry `aria-label`; link text says where it goes, not
      "click here" / "hier klicken"
- [ ] One `<h1>` per page; headings do not skip levels
- [ ] Landmarks used (`<nav aria-label>`, `<main>`, `<header>`, `<footer>`); several `<nav>`
      elements have different labels
- [ ] Dynamic changes are announced: `role="status"` / `aria-live="polite"` for saved
      confirmations and loading, `role="alert"` for errors
- [ ] Tables have `<th>` with `scope`; layout is not done with tables
- [ ] The page language is declared and correct: `<html lang="de">` on a German-first site,
      `lang="en"` on the English version, `lang` on any block in the other language

## Visual

- [ ] Text contrast at least 4.5:1, large text (18 px regular / 14 px bold and up) at least 3:1;
      UI components and focus indicators at least 3:1 against their background
- [ ] Colour is never the only carrier of meaning (status, required, error, link)
- [ ] Layout survives 200 % zoom and a 320 px viewport without horizontal scrolling or clipped
      controls
- [ ] Nothing flashes more than three times per second; no autoplaying media without controls
- [ ] Touch targets at least 44 x 44 px on mobile, with spacing between adjacent ones
- [ ] `prefers-reduced-motion` respected for non-essential animation

## Forms

- [ ] Required fields marked in text or with an icon plus `required` / `aria-required`, not by
      colour alone
- [ ] Error messages are specific, next to the field, linked with `aria-describedby`, and
      visible by more than colour (text, icon, border)
- [ ] On submit failure the errors are summarised at the top and focus moves to the summary or
      the first invalid field
- [ ] Known fields use the right `type` and `autocomplete` (`type="email" autocomplete="email"`,
      `autocomplete="given-name"`, `"postal-code"`, `"tel"`)
- [ ] Nothing submits or changes context on focus or on a change event alone

## Content and states

- [ ] Every page has a descriptive `<title>` (Nuxt: `useHead` / `useSeoMeta`)
- [ ] Links are distinguishable from text by more than colour (underline or weight)
- [ ] Empty, loading and error states have text a screen reader announces, not a blank area or
      a spinner alone (`aria-busy="true"` with a label while loading)
- [ ] The copy is in the site's language and the design handoff's language (German first on
      published sites, English on code and docs)

## Vue / Nuxt patterns

```vue
<!-- action: a button; navigation: a link -->
<button type="button" @click="remove(task.id)">Löschen</button>
<NuxtLink :to="`/tasks/${task.id}`">Aufgabe öffnen</NuxtLink>

<!-- label association -->
<label for="email">E-Mail-Adresse</label>
<input id="email" type="email" autocomplete="email" required aria-describedby="email-error" />
<p id="email-error" role="alert" v-if="errors.email">{{ errors.email }}</p>

<!-- icon-only control -->
<button type="button" aria-label="Dialog schließen" @click="close"><XIcon aria-hidden="true" /></button>

<!-- status and loading -->
<p role="status" aria-live="polite">{{ savedMessage }}</p>
<div v-if="pending" aria-busy="true" aria-label="Aufgaben werden geladen"><Spinner aria-hidden="true" /></div>
```

## How the Tester checks it

- Automated: `@axe-core/playwright` in the repo's Playwright suite (`await new AxeBuilder({ page
  }).analyze()` per route) or `npx pa11y <url>` against the dev server; zero serious or critical
  violations on the routes the diff touches. Lighthouse's accessibility score is a smoke test,
  not the check.
- Manual, when the diff adds a widget or a dialog: Tab through the screen once, operate it with
  the keyboard only, then read it once with a screen reader (NVDA on Windows, VoiceOver on
  macOS). Report what was announced for the primary action.
- Never mark an item passed because the design handoff says so; the handoff is the intent, the
  rendered DOM is the evidence.

## Anti-patterns, one line each

| Anti-pattern | Problem | Fix |
|---|---|---|
| `div` or `span` with `@click` | not focusable, no keyboard | `<button>` |
| Missing `alt` | image invisible to screen readers | describe it, or `alt=""` if decorative |
| Colour-only state | invisible to colour-blind users | icon, text or pattern too |
| `outline: none` | focus invisible | style the outline |
| Custom dropdown without ARIA | unusable by keyboard | native `<select>` or a listbox with full ARIA |
| Empty link or button | announced as "link" | text or `aria-label` |
| `tabindex` above 0 | breaks the tab order | `0` or `-1` only |
| Placeholder as the only label | disappears on input, low contrast | a real `<label>` |
| Autoplaying video or carousel | disorienting, cannot be stopped | controls, no autoplay |
