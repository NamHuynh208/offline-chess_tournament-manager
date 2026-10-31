---
name: USCC Tournament Manager
description: Apple-light interface for recording, confirming and publishing chess tournament results.
colors:
  action: "#0066cc"
  action-hover: "#0055ad"
  canvas: "#f5f5f7"
  surface: "#fff"
  ink: "#1d1d1f"
  muted: "#62626a"
  hairline: "#e5e5ea"
  secondary-hover: "#e9e9ed"
  navigation-track: "#eaeaee"
  selected: "#eef5ff"
  table-row: "#f7f8fa"
  focus-border: "#0ea5e9"
  placeholder: "#73737b"
typography:
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: "clamp(24px, 2.5vw, 30px)"
    fontWeight: 650
    letterSpacing: "-0.035em"
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: "21px"
    fontWeight: 650
    letterSpacing: "-0.025em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.011em"
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: "14px"
    fontWeight: 600
rounded:
  sm: "2px"
  segment: "3px"
  md: "4px"
spacing:
  unit: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary-hover}"
  input-search:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 12px 0 40px"
  navigation-workspace:
    backgroundColor: "{colors.navigation-track}"
    rounded: "{rounded.md}"
    padding: "4px"
  navigation-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.segment}"
    padding: "10px 18px"
  board-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "22px"
---

# Design System: USCC Tournament Manager

## Overview

**Creative North Star: "Apple light"**

This records the user's pinned direction and the shipped implementation, not a new brand concept. A fixed light canvas, white work surfaces, graphite text and restrained blue actions keep Vietnamese names, boards and results readable in a bright tournament hall. Tournament logos and colors remain user-configured identity, not a replacement application palette.

The interface prioritizes correct-board operation and safe confirmation over decoration. Preserve the current copy, role boundaries, offline feedback and result workflow when extending it. Existing dark/semantic-color kiosk steps distinguish players and confirmation outcomes; they are functional exceptions within the light application, not an alternate theme.

**Key Characteristics:**
- Fixed Apple-light application chrome with system typography.
- Small corners, soft separators and nearly flat white surfaces.
- Data-first density, explicit status text and visible keyboard focus.

Evidence: `PRODUCT.md`, `.impeccable/surfaces/system-redesign.md`, `src/app/globals.css` and current route components; finished captures in `.impeccable/review/` include technical desktop/mobile and projector desktop/laptop. This documentation samples those captures rather than asserting a new full visual audit. The supplied finish review reports ship after focus/mobile-order fixes and 21 functional tests passing; those tests were not rerun for this documentation-only pass. Frontmatter is normative for the extracted reusable primitives; `.impeccable/design.json` contains extensions and standalone component examples. Its synthesized tonal ramps are panel previews only, not additional shipped colors or a new palette direction.

## Colors

### Primary
- **Action blue** identifies primary actions, selected controls and keyboard outlines. Its deeper hover tone signals interaction without movement.

### Secondary
- **Soft gray** uses the canvas tone for secondary buttons, with the secondary-hover tone on hover. It is a neutral action treatment, not a second brand accent.

### Neutral
- **Silver canvas / white surface** separate the page from working content.
- **Graphite ink / muted gray / placeholder gray** distinguish primary content, supporting information and empty fields.
- **Hairline gray** separates fields and rows without black outlines. Navigation-track, selected and table-row tones organize selection and dense lists.
- **Focus sky** supplies the existing focused-field border and halo; action blue supplies the additional keyboard outline.

Status badges retain the source semantic utilities: slate for pending, amber for awaiting confirmation, red for disputed, emerald for official and violet for reopened. Always keep their Vietnamese status labels. These are workflow colors, not general-purpose decoration. See `src/app/record/ui.tsx` for their canonical Tailwind values.

**The Official-Only Rule.** On the projector, show a score only for OFFICIAL; otherwise show the existing pending-state text. Never use color to imply a result is already published.

## Typography

Use the frontmatter's Apple-first system stack throughout; it falls back to installed sans-serif fonts and supports Vietnamese. No font download or separate display family is required. Preserve body smoothing and slightly tightened tracking.

- **Title:** tournament overview heading; responsive sizing, semibold rather than a marketing display treatment.
- **Headline:** compact technical header. Login uses its observed independent heading sizing (`clamp(28px, 5vw, 36px)`, weight 650, line-height 1.15).
- **Body / label:** readable work content and compact controls. Supporting metadata commonly uses 12–14px; projector column headers use the same computed font size as player names, with a height allowance that scales with the selected zoom.
- **Scores:** tabular numerals. Technical results use 27px/650; the projector derives name/score sizes from available row height, column width and user scale rather than a fixed universal type scale.

## Layout

- **Rhythm:** a 4px utility base; common gaps and padding follow the extracted spacing steps. The compact technical overview uses 12px header, 10px tournament-bar, and 10px/14px overview vertical spacing to preserve first-viewport space. Existing surface padding also includes 18px, 22px, 26px, 28px and 44px; do not force these into an invented uniform grid.
- **TTKT:** shell max-width 1600px; main max-width 1440px with fluid horizontal padding (`clamp(16px, 3vw, 44px)`). Header uses 12px vertical padding, tournament controls 10px, overview 10px/14px to avoid a tall empty opening. Group the tournament selector with its action buttons, not opposite ends of an empty row. Keep the 44px controls and responsive wrapping. Keep **Kết quả & công bố** separate from **Thiết lập & bốc thăm**; results/attention and export belong together, while settings and preview/commit import occupy the setup workspace.
- **Results/export:** desktop uses a flexible result column plus a 360px export rail, gap 24px. At width ≤900px, stack results before export. Export currently comes first in DOM order: keyboard focus follows that DOM order, not the CSS visual placement. Do not describe it as a fully matching visual/tab sequence.
- **Setup:** one column by default; at Tailwind `xl` (80rem), settings/import split 1.5fr/1fr. Settings fields split at `sm` (40rem); audit snapshots split at `md` (48rem).
- **Accounts/login:** users max-width 1200px, two columns reducing to one at ≤600px; login panel max-width 440px, centered within the dynamic viewport.
- **Phone recording:** max-width 42rem; sticky tournament/round/search/filter header, 16px horizontal insets and stacked board cards. Search accepts accent-insensitive names, bare numbers (board or STT, exact board first), explicit `Bàn 12` and explicit `STT 12`; do not conflate the identifiers. Detail/review sheets cap at 35rem, with full-screen player handoff and confirmation.
- **Projector:** default is 40 boards on one page, two columns, auto-fit aspect, 100% scale, no scrolling and no automatic page rotation. This is not a guarantee that rounds above 40 boards fit one page: the default paginates by 40; the existing one-page option can combine the whole round. Use the `100dvh` frame, measured remaining board area and shrinking row/type sizes to avoid clipping the footer. Keep optional scroll for larger type, aspect ratios, columns, pagination, scale, rotation, fullscreen and collapsible controls. When controls are hidden, collapse the top strip to 28px and retain only the small tournament link and show-controls toggle. At ≤700px, reduce title/logo/insets and omit the last footer summary.
- **Persistence:** preserve validated settings under `uscc:projector:{tournamentId}`. Saved settings override new defaults; do not clear existing localStorage to force the latest layout. Preserve recorder offline queues independently.

## Elevation & Depth

Near-flat tonal layering is the default. White cards and headers are borderless, with only quiet structural shadows: card (`0 2px 12px rgba(0, 0, 0, 0.04)`), header (`0 1px 2px rgba(0, 0, 0, 0.04)`), selected workspace segment (`0 1px 3px rgb(0 0 0 / 7%)`). These are not hover lifts. Projector controls use an inset hairline, and tables use alternating neutral rows. Native dialogs retain their existing dimmed backdrop and bounded scrolling.

## Shapes

Small corners are the rule: the small radius is used on cards and badges; the medium radius on standard action buttons and fields. Larger Tailwind radius aliases are intentionally remapped to the medium value. Workspace segments use the observed intermediate radius. White/black piece dots stay circular because they encode chess sides. No heavy black framing, decorative pills or nested outlined panels.

## Components

- **Buttons:** primary blue/white and secondary gray/graphite, minimum height 44px, 8px icon gap. Hover changes background; disabled state reduces opacity and changes cursor. Keep existing destructive and workflow-specific variants meaningful. Compact projector controls are an observed 36px exception, not the phone target size.
- **Inputs:** white fields with pale strokes; recorder search uses canvas fill and a transparent resting border, 48px height and an inset search icon. Login inputs are 52px. Keep labels/accessible names and nearby helper/error text. Focused fields retain the sky border and 3px translucent halo; keyboard focus adds a **2px solid #0066cc outline with 3px offset** on inputs, selects, textareas, buttons, links and summaries.
- **Navigation:** workspace segments use a gray track, white selected segment, subtle shadow and `aria-pressed`. Mobile wraps labels rather than clipping them. Recorder filters use a blue underline and pale selected fill; tournament-colored round selection remains contrast-checked.
- **Cards/status:** result cards put round/board and written status first, then both players, result and actions. Recorder cards are whole-board buttons; administrative cards are articles with separate controls. Keep pending-sync/exception messages and both confirmation marks visible. Status badges are compact rectangular labels, not color-only dots.
- **Projector table:** equal column groups with a 1px pale vertical separator between adjacent tables, aligned board/name/score cells and quiet alternating rows. Column headers use the same computed font size as player names; allocate header height independently so zoom does not cut the final board. Imported pre-round points remain separate from match scores, with the existing explanatory footer; they are not calculated standings. Above 14 rows per column, one-line player-name ellipsis is intentional to fit the complete board overview. Less-dense mode allows two lines. Existing `title` attributes provide optional pointer tooltips, not a required discovery mechanism or a promise of full-name readability from a projector seat; operators can choose larger/scrolling or fewer-board views.
- **Motion:** existing button/link color and shadow transitions are 160ms ease-out, without decorative movement. Honor `prefers-reduced-motion: reduce`: animation/transition durations become .01ms and smooth scrolling becomes automatic. Page-rotation and sync timers remain explicit application behavior, not CSS motion settings.

## Do's and Don'ts

### Do:
- Do retain the fixed light application, Apple-first font stack and blue-primary/gray-secondary action hierarchy.
- Do keep written statuses, board/STT distinctions, confirmation steps and offline/sync feedback.
- Do preserve keyboard outlines, responsive wrapping and the default 40-board/two-column projector overview.
- Do honor saved projector settings and use only supplied tournament identity assets.

### Don't:
- Don't introduce black borders, decorative gradients, large rounded cards or marketing imagery.
- Don't publish provisional scores, calculate standings from imported points or remove safety steps to simplify a screen.
- Don't treat intentional dense-name truncation as permission to clip scores, board numbers or the projector footer.
- Don't replace the current copy, brand assets, API, roles or persistence model as a styling change.
