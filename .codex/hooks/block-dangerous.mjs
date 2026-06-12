#!/usr/bin/env node
/**
 * PreToolUse guardrail hook for unattended (overnight) Claude Code runs.
 * Reads the hook event JSON from stdin and HARD-BLOCKS dangerous actions
 * by printing a deny decision and exiting 2. A deny here overrides allow
 * rules and even --dangerously-skip-permissions.
 *
 * Cross-platform (Node) so it works on Windows without bash.
 * Registered in .claude/settings.json under hooks.PreToolUse.
 *
 * 2026-06-04 — relaxed mail rule: allow test-mails to buur.aigro@gmail.com ONLY.
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

  // 1. Mail is BLOCKED EXCEPT test-mails to Lucas's own inbox (buur.aigro@gmail.com).
  //    The agent may send to buur.aigro for QA preview of generated content, but
  //    NOT to any other recipient (clients, leads, other addresses) — that stays
  //    the operator's explicit responsibility. Also allows Charlie's onboarding mail
  //    (1charlie.nielsen@gmail.com) which Lucas explicitly green-lit for this run.
  if (/gmail|email|smtp|nodemailer|sendmail|mailer/.test(tool)) {
    const to = String(input.to || input.recipient || input.email || "").toLowerCase().trim();
    const cc = String(input.cc || "").toLowerCase().trim();
    const bcc = String(input.bcc || "").toLowerCase().trim();
    const allRecipients = (to + "," + cc + "," + bcc).split(/[,;]/).map(s => s.trim().replace(/^.*<|>.*$/g, "")).filter(Boolean);
    const ALLOW_LIST = new Set([
      "buur.aigro@gmail.com",
      "1charlie.nielsen@gmail.com",
    ]);
    for (const r of allRecipients) {
      if (!ALLOW_LIST.has(r)) {
        deny("Outbound mail can ONLY go to buur.aigro@gmail.com OR 1charlie.nielsen@gmail.com. Blocked recipient: " + r);
      }
    }
    if (allRecipients.length === 0) {
      deny("Outbound mail had no recipient — blocked.");
    }
  }

  // Also block bulk-send/send-followups Vercel routes from being called via fetch/curl from the agent.
  // These bypass the in-app safety because they hit the deployed app directly.
  if (/^(bash|run|shell)/.test(tool) &&
      /https?:\/\/[^\s'"]+\/api\/email\/(bulk-send|send-followups|send-email)/.test(cmd)) {
    deny("Calling the deployed email send routes directly is blocked. Use the /approve UI or run send.mjs locally.");
  }

  // 2. Block git history rewrites, force pushes, hard resets, rebases.
  //    2026-06-05 — Lucas authorized normal pushes to main (merge command-center-v3
  //    into main as the production branch). Force-push to main stays blocked to
  //    protect history; normal fast-forward/merge pushes to main are now allowed.
  if (/git\s+push\s+.*(--force|-f)\b/.test(cmd) ||
      /git\s+reset\s+--hard/.test(cmd) ||
      /git\s+rebase/.test(cmd)) {
    deny("Force push, hard reset and rebase are blocked (history rewrite protection).");
  }

  // 3. Block destructive recursive deletes.
  if (/rm\s+-rf\s+(\/|~|\$HOME|\.\.)/.test(cmd) || /rm\s+-rf\s+\*/.test(cmd)) {
    deny("Destructive recursive delete blocked.");
  }

  // 4. Never run the dev server (port conflict per CLAUDE.md).
  //    2026-06-05 — Lucas authorized agent deploys; only the dev server stays blocked.
  if (/npm\s+run\s+dev|next\s+dev/.test(cmd)) {
    deny("npm run dev / next dev is blocked (port conflict per CLAUDE.md). Use a short `next start` for browser checks.");
  }

  // 5. Protect secrets, the pause schedule logic, and git internals from edits.
  const protectedEdit = /\.env(\.|$)|\.send_queue[\/\\]\.sa\.json|\.git[\/\\]/i;
  if (/^(edit|write|multiedit)$/.test(tool) && protectedEdit.test(path)) {
    deny("Editing secrets / service-account / .git is blocked: " + path);
  }

  // 6. (Removed 2026-06-07) Lucas explicitly authorized going live with real cold
  //    mail via the /approve "Send godkendte" flow, so the PauseSchedule guard is
  //    lifted. The in-app send route still enforces the real safety: pause-status,
  //    canSendTo, never-re-contact (emailSentAt/emailStatus), a per-run cap, and
  //    spacing between sends.

  process.exit(0); // allow everything else
});
