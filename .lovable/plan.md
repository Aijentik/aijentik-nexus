## Problem

Both widgets are pinned to the bottom-right:

- `StaffCopilot` button — `fixed bottom-6 right-6`, a pill ~150–170px wide ("Ask Copilot ⌘K").
- `FloatingBrain` button — `fixed bottom-6 right-28` (112px), a 56px circle.

The Copilot pill extends past `right-28`, so the Brain circle sits on top of it.

## Fix

Reposition the Floating Brain so it clears the Copilot pill, keeping both on the same baseline:

- Update `FloatingBrain.tsx` line 87: change `right-28` → `right-[210px]` (clears the pill with a comfortable ~24px gap).
- Keep `bottom-6` so they align horizontally.
- Leave z-index, panel, and Copilot styling untouched.

No other components or business logic change.

## Technical notes

- File: `src/components/FloatingBrain.tsx`, single className edit on the trigger button.
- Mobile: at narrow widths the Copilot pill hides the `⌘K` hint but stays roughly the same width, so 210px still clears it. If the user later wants a vertical stack on mobile instead, we can switch to `bottom-24 right-6` inside a `sm:` breakpoint.
