## Problem

The `take_message` webhook tool is wired up correctly — earlier logs show it firing successfully with the right venue_id, payload, and reason field. The issue now is purely behavioural: when you asked to leave a message, the model held the conversation but never invoked the tool, so nothing was recorded and the edge function received zero calls.

This is a classic LLM-tool-use failure: the agent treats "I'll pass that along" as the action itself instead of actually calling the function.

## Fix

Two targeted prompt changes in `supabase/functions/_shared/agent-config.ts`. No DB or handler changes — those are already correct.

### 1. Make the `take_message` capability line in the system prompt mandatory and explicit

Today (line 79):
```
take_message — for anything you cannot resolve, take a clear message for the team.
```

Replace with a stronger, action-forcing instruction that lists the trigger conditions and forbids fake-acknowledgement:
- Caller asks to leave a message, asks for a callback, asks for a manager/owner/human, or says something you cannot help with.
- You MUST call the `take_message` tool. Saying "I'll pass that on" without calling the tool is a failure.
- Collect: caller name, callback number (read it back), the message itself, then call the tool with `reason: "Call Back"` if they want a human to call them, otherwise `"Message"`.
- Confirm out loud only AFTER the tool returns ("got it, I've left that with the team").

### 2. Tighten the tool description itself (line 426)

Current description is good but soft. Add an explicit "Call this tool — do not just say you will" line and list trigger phrases ("can I leave a message", "have someone call me back", "can I speak to the owner/manager", "tell them that…").

### 3. Add a short worked example in the GOOD EXAMPLES block

Add one line showing the natural flow that ends in a tool call, e.g.:
> "Yeah of course — what's the best number?... 0412 345 678, got it. And what's the message?... okay, I'll get them to call you back." (then call `take_message` with reason="Call Back")

## Why this should work

ElevenLabs Convai agents almost always call a tool when (a) the tool description names the exact trigger utterances and (b) the system prompt explicitly forbids the "I'll pass it on" shortcut. Both changes together close the loop.

## Verification steps after deploy

1. Open Agent Config → Save (pushes the new prompt + tool description to ElevenLabs).
2. Start a voice session and say "can I leave a message for the manager?"
3. Check `elevenlabs-tool-handler` logs — expect a `[elevenlabs-tool-handler] call { tool_name: "take_message", ... }` entry.
4. Check the `messages` table for the new row with `reason = 'Call Back'`.
5. Repeat with "can you take a quick message" → expect `reason = 'Message'`.

## Files touched

- `supabase/functions/_shared/agent-config.ts` — prompt line 79, tool description line 426, GOOD EXAMPLES block around line 182.

No migrations, no handler changes, no schema changes.