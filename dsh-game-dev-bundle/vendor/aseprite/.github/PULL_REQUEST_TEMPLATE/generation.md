<!-- Submitting a generation? Rules: gallery/README.md. The `aseprite:submit` skill fills this in for you. -->

## Generation

**Folder:** `gallery/generations/<yyyy-mm-dd>-<slug>/`

**What is it?** <!-- One or two sentences: what was asked, what came out. -->

**Benchmark run?** <!-- Yes: which prompt and revision (e.g. boombox-mage r1). No: a free gallery run. -->

## Checklist

- [ ] `pnpm install && pnpm gallery:check` passes locally
- [ ] The PR adds only my folder under `gallery/generations/` — nothing else changed
- [ ] `steps[].text` are the prompts exactly as sent, verbatim
- [ ] Every mid-run message I sent the model is recorded under `interventions`
- [ ] No hand retouching presented as the model's work; one run per folder
- [ ] The cover is the actual output of the run (not a cherry-picked crop or edit)
- [ ] The editable `.aseprite` source is included and every file is listed in `generation.yaml`
- [ ] `plugin`, `harness` and `models` are exactly what ran
- [ ] Benchmark runs only: fixed setup followed exactly, every criterion answered honestly (fails included)
- [ ] I have the rights to these files and agree to publish them under the repository's MIT license
