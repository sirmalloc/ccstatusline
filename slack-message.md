I was running [claude-hud](https://github.com/jarrodwatts/claude-hud) until I saw [ccstatusline](https://github.com/sirmalloc/ccstatusline). I liked that ccstatusline had more widgets and a visual configurator, but I liked claude-hud because it showed what Claude is actually doing — running tools, subagents, task progress, etc.

So I forked ccstatusline and combined them with some extra quality of life improvements. Took me about 20-30 mins of active time but mostly built in the background for me this morning.

**What's in the fork:**

From ccstatusline's unmerged activity branch (by the original author, just not shipped yet):
- **Tools Activity** — shows running and recently completed tool operations
- **Agents Activity** — shows active subagents with type, model, and elapsed time
- **Todo Progress** — shows current task with completion ratio
- **All Activity** — combined view of all three

What I added on top:
- **Made it a plugin** — clone the repo into `~/.claude/plugins/local/ccstatusline`, run `npm install && npm run build`, then use `/ccstatusline:setup` and `/ccstatusline:configure` from within Claude Code
- **Environment widget** — shows how many CLAUDE.md files, MCP servers, rules, and hooks are loaded
- **Auto-wrap** — widgets flow to the next line instead of getting cut off with `...`
- **Adaptive detail** — progress bars and labels get shorter at narrow terminal widths instead of truncating
- **Usage reset countdowns** — the usage widgets now show time until your rate limit resets (e.g., "resets 2hr 15m")

**Install (plugin):**
```bash
mkdir -p ~/.claude/plugins/local
git clone https://github.com/renaissance-dan/ccstatusline.git ~/.claude/plugins/local/ccstatusline
cd ~/.claude/plugins/local/ccstatusline && npm install && npm run build
```
Then run `/ccstatusline:setup` in Claude Code.

**Install (quick, no slash commands):**
Add to `~/.claude/settings.json`:
```json
"statusLine": {
  "type": "command",
  "command": "npx renaissance-dan/ccstatusline@latest",
  "padding": 0
}
```

PR is open upstream ([sirmalloc/ccstatusline#291](https://github.com/sirmalloc/ccstatusline/pull/291)) in case the owner wants to add this to the official package, but the fork should be good until then.
