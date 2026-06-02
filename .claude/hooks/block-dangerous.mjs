#!/usr/bin/env node
/**
 * PreToolUse guardrail hook for unattended (overnight) Claude Code runs.
 * Reads the hook event JSON from stdin and HARD-BLOCKS dangerous actions
 * by printing a deny decision and exiting 2. A deny here overrides allow
 * rules and even --dangerously-skip-permissions.
 *
 * Cross-platform (Node) so it works on Windows without bash.
 * Registered in .claude/settings.json under hooks.PreToolUse.
 */

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let ev = {};
  try { ev = JSON.parse(raw || "{}"); } catch { /* ignore */ }

  const tool = (ev.tool_name || "").toLowerCase();
  const input = ev.tool_input || {};
  const cmd = String(input.command || "");
  const path = String(input.file_path || input.path || "");

  const deny = (reason) => {
    process.stderr.write(JSON.stringify({
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    }));
    process.exit(2);
  };

  // 1. Never send mail / no outbound messaging during the unattended build.
  if (/gmail|email|smtp|nodemailer|sendmail|mailer/.test(tool)) {
    deny("Outbound email is blocked during the unattended overnight build.");
  }

  // 2. Block git history rewrites, force pushes, pushes to main, hard resets.
  if (/git\s+push\s+.*(--force|-f)\b/.test(cmd) ||
      /git\s+push\s+\S*\s*(origin\s+)?(main|master)\b/.test(cmd) ||
      /git\s+reset\s+--hard/.test(cmd) ||
      /git\s+rebase/.test(cmd)) {
    deny("Force/main push, hard reset and rebase are blocked. Commit to a branch only.");
  }

  // 3. Block destructive recursive deletes.
  if (/rm\s+-rf\s+(\/|~|\$HOME|\.\.)/.test(cmd) || /rm\s+-rf\s+\*/.test(cmd)) {
    deny("Destructive recursive delete blocked.");
  }

  // 4. Never run the dev server (port conflict per CLAUDE.md).
  if (/npm\s+run\s+dev|next\s+dev|vercel\s+(deploy|--prod|build\s+--prod)/.test(cmd)) {
    deny("npm run dev and any deploy are blocked. Build/lint only; deploy is a manual morning step.");
  }

  // 5. Protect secrets, the pause schedule logic, and git internals from edits.
  const protectedEdit = /\.env(\.|$)|\.send_queue[\/\\]\.sa\.json|\.git[\/\\]/i;
  if (/^(edit|write|multiedit)$/.test(tool) && protectedEdit.test(path)) {
    deny("Editing secrets / service-account / .git is blocked: " + path);
  }

  // 6. Block any command that touches PauseSchedule (cold-email must stay paused).
  if (/PauseSchedule/i.test(cmd)) {
    deny("PauseSchedule must not be modified — cold-email stays paused.");
  }

  process.exit(0); // allow everything else
});
