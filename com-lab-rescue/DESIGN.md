---
version: alpha
name: "COM LAB RESCUE"
description: "Thai educational Three.js repair game with a Neo Brutalist classroom identity."
colors:
  primary: "#FBE34A"
  ink: "#171717"
  paper: "#FFFDF5"
  cyan: "#51D6E4"
  pink: "#FF91BB"
  lime: "#C8F36A"
  muted: "#55564E"
  danger: "#A52332"
  success: "#245723"
  scrollbarTrack: "#EDE9DC"
  scrollbarHover: "#4B4B44"
  scrollbarActive: "#717167"
typography:
  body:
    fontFamily: '"Noto Sans Thai", "Tahoma", system-ui, sans-serif'
    fontSize: "16px"
    lineHeight: "1.65"
  display:
    fontFamily: '"Arial Black", "Impact", "Noto Sans Thai", sans-serif'
  utility:
    fontFamily: "ui-monospace, monospace"
rounded:
  DEFAULT: "4px"
spacing:
  desktopGap: "40px"
  mobilePageGutter: "18px"
  formGap: "12px"
  homeMaxWidth: "1500px"
components:
  button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.DEFAULT}"
  panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.DEFAULT}"
  dialog:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.DEFAULT}"
  question-header:
    backgroundColor: "{colors.cyan}"
    textColor: "{colors.ink}"
  accent-sticker:
    backgroundColor: "{colors.pink}"
    textColor: "{colors.ink}"
  feedback-correct:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
  supporting-text:
    textColor: "{colors.muted}"
  field-error:
    textColor: "{colors.danger}"
  review-answer:
    textColor: "{colors.success}"
  scrollbar-track:
    backgroundColor: "{colors.scrollbarTrack}"
  scrollbar-thumb-hover:
    backgroundColor: "{colors.scrollbarHover}"
  scrollbar-thumb-active:
    backgroundColor: "{colors.scrollbarActive}"
---

# COM LAB RESCUE Design System

## Overview

### Creative North Star

A small computer repair classroom presented like a screen-printed activity kit: punchy paper colours, thick black frames, tactile offset shadows, graphic labels, and an original toy-like robot. The live isometric room is the memorable subject; interface controls remain familiar and readable.

### Product context and register

- **Audience:** Thai-speaking beginners reviewing computer hardware and safe everyday use.
- **Primary job:** Register, complete three repair stations, understand feedback, and retain learning results.
- **Usage:** Desktop first, with touch and narrow-screen support for the assignment.
- **Register:** Hybrid. The home screen expresses the game's identity; registration, questions, results and statistics prioritise task clarity.
- **Locale:** Thai instructions and learning content. English is limited to the game's title, short scene signage, and established computer terms.
- **Accepted direction:** The user's explicit Neo Brutalist theme supersedes the earlier soft low-poly colour proposal.
- **Signature:** A colourful, black-edged Three.js computer room visibly coming back online.
- **Anti-references:** Glass dashboards, blurred cards, generic glowing gradients, ornamental charts, and a static worksheet presented as a game.
- **Theme:** One light theme. Forced-colour accessibility support follows operating-system settings.

### Token ownership and runtime mapping

The existing variables in src/style.css are canonical (**runtime-owned model**). This document mirrors their exact accepted values and explains their use. Feature screens consume the shared CSS classes instead of introducing another theme. The Three.js palette in src/scene.js is the material adapter for the same six brand colours.

| Document token | Runtime owner | Consumers |
| --- | --- | --- |
| colors.ink | --ink | Type, borders, focus rings, hard shadows |
| colors.paper | --paper | Page and readable surfaces |
| colors.primary | --yellow | Primary actions and current objective |
| colors.cyan | --cyan | Question headers and secondary actions |
| colors.pink | --pink | Expressive accents and wrong-answer surfaces |
| colors.lime | --lime | Completion and correct-answer surfaces |
| colors.muted | --muted | Supporting explanations |
| colors.danger / success | --danger / --success | Semantic text |
| typography.body | --font-body | Thai body text, controls, forms |
| typography.display | --font-display | Brand title and large score numbers |
| rounded.DEFAULT | --radius | Shared buttons, fields, panels |
| panel border / shadow | --line / --shadow | Main surface hierarchy |
| scrollbar palette | --scrollbar-* | Every owned scrollable surface |

When a durable palette or type decision changes, update src/style.css first, then this document and the scene material adapter in the same change. Verify the six brand colour values against both runtime files; do not create screen-specific substitutes.

## Colors

The six brand colours are expressive surfaces, not six interchangeable action priorities. Yellow carries the main action. Cyan introduces the active question. Lime supports successful repair; pink supports corrections without suggesting permanent failure. Ink remains the foreground on bright surfaces.

Correct and incorrect feedback always includes words or symbols as well as colour. Muted text still needs readable contrast. Never render a long learning explanation directly on moving 3D content.

Use the paper background as breathing room between bold areas. Black borders and shadows establish grouping without blur. The 3D scene may use additional neutral material shades for surfaces and lighting; it must preserve the core brand relationship.

## Typography

Thai body text uses locally bundled Noto Sans Thai regular and bold, with Tahoma and system fallbacks. Fonts are embedded during build so the single HTML does not depend on a font CDN.

Display type uses Arial Black or Impact where installed, falling back to Noto Sans Thai. Strong condensed English titles and large score numbers are used sparingly. Thai question text retains generous line height, normal word shaping and readable wrapping. Utility captions may use monospace.

Body text starts at 16px / 1.65. Question text is approximately 18–20px with 1.65 line height. Avoid long all-capital interface prose and tightly tracked Thai text.

## Layout

The home view pairs the story/action with a live diorama. During play, keep the room central and disclose the question panel only while a task is active. Do not surround the scene with multiple equally prominent cards.

The stylesheet's primary responsive changes occur at 1050px, 760px and 380px. Desktop questions sit beside the scene; narrow screens stack them. At narrow widths the open-question scene becomes shorter, leaving space for the question and options. Native document scrolling owns long forms and results.

The leaderboard is a bounded semantic table with its own horizontal/vertical scroll area and explicit page controls. It must not force the entire application into a fixed-height hidden-overflow shell.

## Elevation & Depth

Use hard, unblurred offsets: the principal surface shadow is 6px 6px 0 ink; smaller controls use 2–4px, and dialogs use 8px. The button press moves toward its shadow to feel physical.

The diorama uses actual geometry and lighting, not UI glass effects. A translucent flat dialog backdrop is permitted to separate a task; backdrop blur is not part of this identity.

## Shapes

Most UI surfaces have near-square 4px corners and thick black outlines. Small circular dots, robot wheels, colour swatches and the audio switch are semantic exceptions. Corners should not become large pill-shaped cards.

Scene furniture uses layered black trim and simple block shapes. Low-poly plants and the robot soften the room without changing the overall graphic style.

## Components

### Foundational visual states

Buttons have explicit hover, focus-visible, pressed, disabled and busy behaviour. A 3px ink focus ring with a 4px offset remains visible. Disabled controls communicate unavailability and do not trigger actions. Loading messages occupy their existing surface instead of moving unrelated controls.

Error text stays beside the relevant field. A shared live status/toast system acknowledges non-blocking changes; persistent sync failures also remain accessible in the save-status interface.

### Buttons and actions

The shared .btn family owns emphasis and interaction. Primary actions are yellow. Cyan and lime are purposeful variants, not additional default primary buttons. Icon-only buttons have accessible names. Routine actions use concise Thai verbs that describe their result.

### Navigation and data display

The brand returns to the home screen. Help and statistics remain available from the common navigation. Stage numbers are meaningful sequence markers for the three repair tasks.

Leaderboard rows use nicknames, scores, medals and time. Empty results explain how to create the first completed result. Statistics must clearly distinguish local-device data from confirmed class data.

### Forms and overlays

Registration uses explicit labels and inline errors. Own validation through novalidate forms, preserve values after errors, and prevent duplicate submission.

Native HTML dialog is the modal primitive, with the app wrapper responsible for accessible title, focus restoration and Escape behaviour. No browser alert, confirm or prompt UI.

### Iconography

Use the game's small inline SVG icon set with black strokes, square caps where appropriate, and readable labels for less familiar actions. Original generated scene signage is part of the room, not a replacement for accessible DOM controls.

### Motion

Motion indicates robot travel, a repaired station, or a reward. The scene uses a fixed camera; perpetual camera orbit is not part of gameplay. UI movement is short and subordinate to reading. Respect prefers-reduced-motion in both CSS and scene animation.

### Content and data visualization

Use supportive Thai feedback that explains why an answer is correct or incorrect. Separate “finished the mission” from “passed the learning threshold.” A bronze medal rewards completion and does not imply that the learner passed.

Progress bars represent answered/reviewed questions. No decorative charts or invented learners belong in the dashboard.

## Do's and Don'ts

- **Do:** Make the scene look repaired as real progress arrives from the game state.
- **Do:** Keep the same action wording, shared controls and save-status meanings across screens.
- **Do:** Keep Thai explanations legible above the graphic styling.
- **Don't:** Introduce blurred surfaces, soft shadow stacks or a second independent palette.
- **Don't:** Hide task controls in the 3D canvas without equivalent DOM actions.
- **Don't:** Present locally stored results as confirmed online class statistics.

