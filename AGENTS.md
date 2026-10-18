# Surgical Reading & Token Efficiency Guidelines

## File Inspection Rules
1. **Never read whole files unless strictly under 80 lines.** Always use `StartLine` and `EndLine` to read only the target function, interface, or constant block.
2. **Never reread files already in recent memory.** Trust existing context for recently written or edited modules.
3. **Use targeted greps / symbol checks** instead of exploring directory file lists repeatedly.

## Response & Output Rules
1. **Be extremely concise.** Do not repeat or re-summarize code that was just written.
2. **Diffs and Edits:** Use surgical replacements rather than rewriting entire files.
3. **Explanations:** Keep post-edit explanations to 2–3 bullet points maximum unless asked for deep architectural breakdown.
