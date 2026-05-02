<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Dev server rule

**Never run `npm run dev` while Claude Code is active.** Only start the dev server when browser verification is specifically needed, then stop it immediately after. Port conflicts will occur otherwise.
