# MinerU 4.x integration

> Status: source integration only. Installing this skill into the SOREN catalog **does not** install the MinerU Python CLI, download model weights, start a background server, enable an MCP execution tool, or deploy the router.

## Provenance and license

- Original repository: https://github.com/opendatalab/MinerU
- Copied upstream skill: `skills/mineru/SKILL.md` from `opendatalab/MinerU`, branch `master`, upstream blob `b3d83885c0b07e89b6d79791b38a38deed98918e`.
- Original project license and supplemental conditions: `skills/mineru/LICENSE.md`, upstream blob `6496f953085e712b9e1724681661b73d534fa5d8`.
- Respect upstream requirements, including clear MinerU attribution if providing an online service based on it. Review license before any commercial deployment.
- Update imported skill bytes and license only after inspecting the new upstream version and testing routing, rather than silently syncing external code.

## SOREN router capability

The bundled skill is read-only advisory content, published via `list_skills`, `search_skills`, `read_skill` and `route_task` **after the router source is merged and deployed**. No remote execution is introduced.

Search or route with queries such as:

```text
OCR scanned PDF lecture slides into Markdown with MinerU.
Extract formulas, tables and figures from a PDF, retaining page references.
Read a long academic document with stable page/block locators.
```

## Separate engine installation

Install the actual **MinerU 4.x** program in an isolated Python 3.12 environment on the computer/VPS where documents will be processed. The commands below require `uv` to be present. If missing, install it first from https://docs.astral.sh/uv/getting-started/installation/ .

**Windows PowerShell** — invoke the virtual environment's executables directly, avoiding PowerShell's script execution-policy restrictions:

```powershell
uv venv .mineru --python 3.12
uv pip install --python .mineru\Scripts\python.exe "mineru>=4.0,<5"
.\.mineru\Scripts\mineru.exe version --json
.\.mineru\Scripts\mineru-kit.exe parse ".\document.pdf" -o ".\document.md" --tier standard
```

**Linux/VPS**:

```bash
uv venv .mineru --python 3.12
uv pip install --python .mineru/bin/python "mineru>=4.0,<5"
./.mineru/bin/mineru version --json
./.mineru/bin/mineru-kit parse ./document.pdf -o ./document.md --tier standard
```

The first inference-backed conversion may download model weights. Check effective runtimes with `mineru-kit models show`, verify model assets as applicable, and parse a known sample PDF to prove real OCR output. A passing catalog test or CLI `--help` alone is not engine validation.

To batch-convert a folder of PDFs or other supported files, for example a local copy of `Week3`:

```bash
./.mineru/bin/mineru-kit parse ./Week3 -o ./Week3-output --format zip
```

On Windows, replace `./.mineru/bin/mineru-kit` with `.\.mineru\Scripts\mineru-kit.exe`. For batches, the output directory contains export packages. Check the resulting Markdown and accompanying assets rather than assuming OCR accuracy.

## Privacy and safety

- Course, patient, clinical, or other private PDFs remain local by default. Do not add the input documents or generated artifacts to a public GitHub repository.
- Do not silently enable remote parsing, cloud uploads, persistent watched folders or public API access.
- GitHub does not execute the skill by itself. Running the engine requires a configured machine, container or explicit CI workload.
- No Google Drive access or folder export is implicitly granted by this integration.

Official reference: https://opendatalab.github.io/MinerU/quick_start/
