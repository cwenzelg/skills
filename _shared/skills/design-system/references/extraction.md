# Reading a system out of an approved direction

The approved reference (screens a human picked) is the source. A live theme, an older token file,
or a contract document is NOT, when it disagrees with the reference - say so in DESIGN.md and use
the reference.

## Order

1. **Collect the reference.** The approved variant files (HTML/CSS when they exist, else PNG),
   both modes, plus the decision that approved them (who, when, words). Copy the PNGs into
   `reference/<mode>/`. If only one mode was approved, the other mode is a derivation - mark every
   derived value `"source": "derived: <rule>"` and list them as open questions in DESIGN.md.
2. **Inventory before tokens.** From the HTML (computed styles, CSS variables, inline styles) or by
   sampling the PNG, list every distinct: colour (incl. gradient stops and translucent fills),
   typeface + weight, font size / line height, radius, shadow, blur, spacing step, icon style.
   Count uses. Values used once are usually not tokens - ask before adding them.
3. **Name the character in words** (DESIGN.md "Character"): the 3-5 things that make it look like
   itself. These become the always/never rules and the reference/dont/ examples. If a flat token
   sheet would lose one of them (a mesh ground, glass, gradient cards, a display typeface), it
   needs its own foundation file and recipe.
4. **Primitives** from the inventory, each with `source` = file + element/spot it was read from.
5. **Roles** per mode. Same paths in every mode. Dark is not an inversion: desaturate accents,
   use dark grey not black, lighter surfaces for higher elevation, tint glass darker and blur more.
6. **Components** the reference actually shows: one spec + one snippet each, every state it needs.
7. **Brands** last, only as overrides of primitives or brand.* slots.
8. **Run the checks** (CHECKLIST.md), build the specimen, look at it next to the reference with
   visual-compare.mjs, fix, repeat - then ask for approval.

## When to stop and ask

- The reference has no dark (or light) version and the role cannot be derived by a stated rule.
- Two reference screens disagree on a value.
- A typeface's licence is unknown (the font-licensing skill decides).
- A component is needed that no reference screen shows.
