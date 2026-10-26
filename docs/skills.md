# LitGrok skills at a glance

[README](../README.md) · [한국어](./skills_ko-KR.md) · [Guide](./guide.md) · [Reference](./reference.md)

All 42 skills, one row each. The routes are the ones each skill documents, and `/skills` shows what your Grok Build session actually loaded. A renamed skill still answers to its old name for one release ([rename compatibility](./reference.md#skill-rename-compatibility)); an old slash route may not carry over.

<table>
<tr><th>What it looks like</th><th>Skill</th><th>What you get</th></tr>
<tr>
<td><img src="./assets/skills/litwork.webp" width="240" alt="A bounded session checklist. LitGrok's hooks log each step to a local ledger." /></td>
<td><code>litwork</code><br /><sub><code>/litwork &lt;goal&gt;</code></sub></td>
<td>A bounded session checklist. LitGrok's hooks log each step to a local ledger.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-plan.webp" width="240" alt="A plan file with numbered rows that /start-work can run. Nothing is edited yet." /></td>
<td><code>lit-plan</code><br /><sub><code>/lit-plan &lt;objective&gt;</code></sub></td>
<td>A plan file with numbered rows that <code>/start-work</code> can run. Nothing is edited yet.</td>
</tr>
<tr>
<td><img src="./assets/skills/start-work.webp" width="240" alt="Runs a plan row by row. A row is checked only after gates A to F pass." /></td>
<td><code>start-work</code><br /><sub><code>/start-work &lt;plan path&gt;</code></sub></td>
<td>Runs a plan row by row. A row is checked only after gates A to F pass.</td>
</tr>
<tr>
<td><img src="./assets/skills/review-work.webp" width="240" alt="Reviews a plan before work starts or the work after it, picking the mode from what exists. Read-only lanes rank what they find by evidence." /></td>
<td><code>review-work</code><br /><sub><code>/review-work &lt;target&gt;</code></sub></td>
<td>Reviews a plan before work starts or the work after it, picking the mode from what exists. Read-only lanes rank what they find by evidence.</td>
</tr>
<tr>
<td><img src="./assets/skills/litgoal.webp" width="240" alt="Sets one checkable finish line and hands you a native /goal line to run; litwork and start-work run toward it. LitGrok stores no goal state." /></td>
<td><code>litgoal</code><br /><sub><code>/litgoal &lt;request&gt;</code></sub></td>
<td>Sets one checkable finish line and hands you a native <code>/goal</code> line to run; <code>litwork</code> and <code>start-work</code> run toward it. LitGrok stores no goal state.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-recap.webp" width="240" alt="A short account with evidence, rebuilt from Grok Build session history." /></td>
<td><code>lit-recap</code><br /><sub><code>/lit-recap</code></sub></td>
<td>A short account with evidence, rebuilt from Grok Build session history.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-handoff.webp" width="240" alt="Type handoff for a resume file the next session can read. Secrets stay out." /></td>
<td><code>lit-handoff</code><br /><sub><code>handoff</code> · <code>/lit-handoff</code></sub></td>
<td>Type <code>handoff</code> for a resume file the next session can read. Secrets stay out.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-hijack.webp" width="240" alt="Port someone else's published technique into your skill, clean-room: capture with provenance, gate the licence, prove parity." /></td>
<td><code>lit-hijack</code><br /><sub><code>/lit-hijack &lt;urls or files&gt;</code></sub></td>
<td>Ports someone else's published technique into your skill, clean-room: capture with provenance, gate the licence, prove parity on the real surface.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-adhd.webp" width="240" alt="A one-screen brief of every recent session: one card each, the roadmap, one recommended next step." /></td>
<td><code>lit-adhd</code><br /><sub><code>lit adhd</code> · <code>lit rewind</code></sub></td>
<td>Answers "where was I" across recent sessions: one card per session, the roadmap gauge, one recommended next step. Read-only.</td>
</tr>
<tr>
<td><img src="./assets/skills/deep-interview.webp" width="240" alt="One question at a time, in a fixed order, until the request is clear enough to plan." /></td>
<td><code>deep-interview</code><br /><sub><code>/deep-interview &lt;request&gt;</code></sub></td>
<td>One question at a time, in a fixed order, until the request is clear enough to plan.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-brainstorm.webp" width="240" alt="Turns an open question into many options, groups and scores them, and ends on a short list for you to pick from. Nothing is built." /></td>
<td><code>lit-brainstorm</code><br /><sub><code>/lit-brainstorm &lt;topic&gt;</code></sub></td>
<td>Turns an open question into many options, groups and scores them, and ends on a short list for you to pick from. Nothing is built.</td>
</tr>
<tr>
<td><img src="./assets/skills/litresearch.webp" width="240" alt="Bounded research with every claim traced to a source and no evidence overstated." /></td>
<td><code>litresearch</code><br /><sub><code>/litresearch &lt;question&gt;</code></sub></td>
<td>Bounded research with every claim traced to a source and no evidence overstated.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-crucible.webp" width="240" alt="Pressure-tests a brief before planning. Only the risks that survive critique reach the plan." /></td>
<td><code>lit-crucible</code><br /><sub><code>/lit-crucible &lt;approach&gt;</code></sub></td>
<td>Pressure-tests a brief before planning. Only the risks that survive critique reach the plan.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-init.webp" width="240" alt="Finds the project guidance that exists, flags conflicts and gaps, and proposes a layout. Nothing is written until you approve." /></td>
<td><code>lit-init</code><br /><sub><code>/lit-init &lt;path&gt;</code></sub></td>
<td>Finds the project guidance that exists, flags conflicts and gaps, and proposes a layout. Nothing is written until you approve.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-comprehend.webp" width="240" alt="An explainer page for agent-written work: intuition first, then the walkthrough, then a short quiz." /></td>
<td><code>lit-comprehend</code><br /><sub><code>/lit-comprehend &lt;scope&gt;</code></sub></td>
<td>An explainer page for agent-written work: intuition first, then the walkthrough, then a short quiz.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-humanizer.webp" width="240" alt="Rewrites stiff model prose in English or Korean. Facts and hedges stay; filler goes." /></td>
<td><code>lit-humanizer</code><br /><sub><code>/lit-humanizer &lt;draft or file&gt;</code></sub></td>
<td>Rewrites stiff model prose in English or Korean. Facts and hedges stay; filler goes.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-diagram-drawer.webp" width="240" alt="A checked, editable diagram for slides and documents, with PNG and Office-safe SVG exports." /></td>
<td><code>lit-diagram-drawer</code><br /><sub><code>/lit-diagram-drawer &lt;brief&gt;</code></sub></td>
<td>A checked, editable diagram for slides and documents, with PNG and Office-safe SVG exports.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-schematic.webp" width="240" alt="A checked P&ID, equipment layout, journal apparatus figure or isometric cutaway as editable SVG with PDF and 600 dpi PNG." /></td>
<td><code>lit-schematic</code><br /><sub><code>/lit-schematic &lt;equipment or apparatus brief&gt;</code></sub></td>
<td>A checked P&ID, equipment layout, journal apparatus figure or isometric cutaway as editable SVG with PDF and 600 dpi PNG.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-pptx.webp" width="240" alt="An editable PowerPoint deck with its Markdown source, built in one of eight design directions picked for the audience and named with two alternatives. A QA gate checks the file, and slides are inspected when LibreOffice is present." /></td>
<td><code>lit-pptx</code><br /><sub><code>/lit-pptx &lt;presentation request&gt;</code></sub></td>
<td>An editable PowerPoint deck with its Markdown source, built in one of eight design directions picked for the audience and named with two alternatives. A QA gate checks the file, and slides are inspected when LibreOffice is present.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-docx.webp" width="240" alt="A styled Word document with its Markdown source, set in one of six restrained directions picked for the document, or in a publisher profile you name. Prose lint and a page-level gate run, and pages are inspected when LibreOffice is present." /></td>
<td><code>lit-docx</code><br /><sub><code>/lit-docx &lt;document request&gt;</code></sub></td>
<td>A styled Word document with its Markdown source, set in one of six restrained directions picked for the document, or in a publisher profile you name. Prose lint and a page-level gate run, and pages are inspected when LibreOffice is present.</td>
</tr>
<tr>
<td><img src="./assets/skills/frontend-ui-ux.webp" width="240" alt="Builds a working interface, then a probe renders it in seven views: four widths, dark, reduced motion and 200% zoom." /></td>
<td><code>frontend-ui-ux</code><br /><sub><code>/frontend-ui-ux &lt;surface and outcome&gt;</code></sub></td>
<td>Builds a working interface, then a probe renders it in seven views: four widths, dark, reduced motion and 200% zoom.</td>
</tr>
<tr>
<td><img src="./assets/skills/readme-studio.webp" width="240" alt="A factual README with a cover, outlined type and local motion." /></td>
<td><code>readme-studio</code><br /><sub><code>/readme-studio &lt;repository and outcome&gt;</code></sub></td>
<td>A factual README with a cover, outlined type and local motion.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-typographic-motion.webp" width="240" alt="A finished short film from a treatment, rendered by LitGrok's own type engine or stage capture and checked by its QA gate." /></td>
<td><code>lit-typographic-motion</code><br /><sub><code>/lit-typographic-motion &lt;request&gt;</code></sub></td>
<td>A finished short film from a treatment, rendered by LitGrok's own type engine or stage capture and checked by its QA gate. Cover mode makes a silent, seamless README cover loop and gates the decoded file.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-scientific-visualization.webp" width="240" alt="A publication-ready figure and caption from verified data. The chart type follows the data." /></td>
<td><code>lit-scientific-visualization</code><br /><sub><code>/lit-scientific-visualization</code></sub></td>
<td>A publication-ready figure and caption from verified data. The chart type follows the data.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-team.webp" width="240" alt="Splits work into bounded task packets for Grok Build's built-in subagents. The parent integrates and verifies." /></td>
<td><code>lit-team</code><br /><sub><code>/lit-team</code></sub></td>
<td>Splits work into bounded task packets for Grok Build's built-in subagents. The parent integrates and verifies.</td>
</tr>
<tr>
<td><img src="./assets/skills/autoresearch.webp" width="240" alt="A bounded research campaign: subagents, evidence gates, one synthesis." /></td>
<td><code>autoresearch</code><br /><sub><code>/autoresearch &lt;mode&gt; &lt;objective&gt;</code></sub></td>
<td>A bounded research campaign: subagents, evidence gates, one synthesis.</td>
</tr>
<tr>
<td><img src="./assets/skills/autoconference.webp" width="240" alt="Subagent lanes deliberate on evidence, and the synthesis keeps disagreement." /></td>
<td><code>autoconference</code><br /><sub><code>/autoconference &lt;mode&gt; &lt;topic&gt;</code></sub></td>
<td>Subagent lanes deliberate on evidence, and the synthesis keeps disagreement.</td>
</tr>
<tr>
<td><img src="./assets/skills/wikify.webp" width="240" alt="A local project knowledge map with sources, kept under .grok/." /></td>
<td><code>wikify</code><br /><sub><code>/wikify &lt;mode&gt;</code></sub></td>
<td>A local project knowledge map with sources, kept under <code>.grok/</code>.</td>
</tr>
<tr>
<td><img src="./assets/skills/debugging.webp" width="240" alt="Reproduces the bug, tests at least three explanations, and fixes only the confirmed cause." /></td>
<td><code>debugging</code><br /><sub><code>/debugging &lt;symptom&gt;</code></sub></td>
<td>Reproduces the bug, tests at least three explanations, and fixes only the confirmed cause.</td>
</tr>
<tr>
<td><img src="./assets/skills/refactor.webp" width="240" alt="Restructures code in an isolated worktree while tests pin its behavior." /></td>
<td><code>refactor</code><br /><sub><code>/refactor &lt;target&gt;</code></sub></td>
<td>Restructures code in an isolated worktree while tests pin its behavior.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-burnoff.webp" width="240" alt="Cleans AI-written bloat out of a change set after tests lock what it does." /></td>
<td><code>lit-burnoff</code><br /><sub><code>/lit-burnoff &lt;scope&gt;</code></sub></td>
<td>Cleans AI-written bloat out of a change set after tests lock what it does.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-burnoff-file.webp" width="240" alt="Cleans generated prose patterns out of one file and checks the diff." /></td>
<td><code>lit-burnoff-file</code><br /><sub><code>/lit-burnoff-file &lt;path&gt;</code></sub></td>
<td>Cleans generated prose patterns out of one file and checks the diff.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-code.webp" width="240" alt="Strict implementation rules: tests first, typed boundaries, small files." /></td>
<td><code>lit-code</code><br /><sub><code>/lit-code &lt;task&gt;</code></sub></td>
<td>Strict implementation rules: tests first, typed boundaries, small files.</td>
</tr>
<tr>
<td><img src="./assets/skills/lit-commit.webp" width="240" alt="Splits your changes into atomic commits in the repo's own style and leaves unrelated work alone." /></td>
<td><code>lit-commit</code><br /><sub><code>/lit-commit &lt;operation&gt;</code></sub></td>
<td>Splits your changes into atomic commits in the repo's own style and leaves unrelated work alone.</td>
</tr>
<tr>
<td><img src="./assets/skills/lsp.webp" width="240" alt="Turns on Grok Build's built-in LSP code-intel tool, which is off by default." /></td>
<td><code>lsp</code><br /><sub><code>/lsp</code></sub></td>
<td>Turns on Grok Build's built-in LSP code-intel tool, which is off by default.</td>
</tr>
<tr>
<td><img src="./assets/skills/lsp-setup.webp" width="240" alt="Checks which language servers Grok Build can see and names the fallback when diagnostics are not exposed." /></td>
<td><code>lsp-setup</code><br /><sub><code>/lsp-setup &lt;path or extension&gt;</code></sub></td>
<td>Checks which language servers Grok Build can see and names the fallback when diagnostics are not exposed.</td>
</tr>
<tr>
<td><img src="./assets/skills/structural-search.webp" width="240" alt="Traces code structure with search, read and optional LSP references. It does not invent an engine." /></td>
<td><code>structural-search</code><br /><sub><code>/structural-search &lt;pattern&gt;</code></sub></td>
<td>Traces code structure with search, read and optional LSP references. It does not invent an engine.</td>
</tr>
<tr>
<td><img src="./assets/skills/visual-qa.webp" width="240" alt="A screenshot-backed review of a rendered interface." /></td>
<td><code>visual-qa</code><br /><sub><code>/visual-qa &lt;target&gt;</code></sub></td>
<td>A screenshot-backed review of a rendered interface.</td>
</tr>
<tr>
<td><img src="./assets/skills/browser-drive.webp" width="240" alt="Drives a real page after verifying the browser driver. If there is none, it says so." /></td>
<td><code>browser-drive</code><br /><sub><code>/browser-drive &lt;url&gt;</code></sub></td>
<td>Drives a real page after verifying the browser driver. If there is none, it says so.</td>
</tr>
<tr>
<td><img src="./assets/skills/comment-checker.webp" width="240" alt="Reviews the comments an edit added: reasons stay, narration goes." /></td>
<td><code>comment-checker</code><br /><sub><code>/comment-checker &lt;path&gt;</code></sub></td>
<td>Reviews the comments an edit added: reasons stay, narration goes.</td>
</tr>
<tr>
<td><img src="./assets/skills/rules.webp" width="240" alt="Explains which guidance Grok Build loads for this folder, in what order, and whether hooks are trusted." /></td>
<td><code>rules</code><br /><sub><code>/rules</code></sub></td>
<td>Explains which guidance Grok Build loads for this folder, in what order, and whether hooks are trusted.</td>
</tr>
<tr>
<td><img src="./assets/skills/litgrok.webp" width="240" alt="Explains what the LitGrok package installs, and what it does not." /></td>
<td><code>litgrok</code><br /><sub><code>/litgrok</code></sub></td>
<td>Explains what the LitGrok package installs, and what it does not.</td>
</tr>
</table>
