# Topic Config

`topic-config` contains the local topic artifacts used by the manifest to provision a dedicated deployment.

## Directory Structure

Expected shape:

```text
topic-config
├── prompts
│   ├── <topic-slug>-v<version>.json
│   └── ...
└── sources
    ├── <topic-slug>-v<version>.json
    └── ...
```

## File Naming

Prompt and source bundles must follow the same naming convention: `<topic-slug>-v<version>.json`

Rules:

- `<topic-slug>` must match the manifest `topic_slug`
- `<version>` is an integer version suffix such as `v1`, `v2`, `v3`
- the manifest `prompt_variant` must match one file in `prompts/`
- the manifest `sources_variant` must match one file in `sources/`

Example:

- `topic_slug=fr-dev-job-market`
- `prompt_variant=fr-dev-job-market-v1`
- `sources_variant=fr-dev-job-market-v1`

## Prompt Bundles

A prompt bundle defines the LLM instructions used by the backend pipeline for a topic.

Current required fields:

```json
{
  "variant": "fr-dev-job-market-v1",
  "relevancePrompt": "...",
  "emotionPrompt": "...",
  "tonalityPrompt": "...",
  "reportPrompt": "..."
}
```

### Required Prompts

`relevancePrompt`
Determines whether an input item is relevant for the topic.
Input: one fetched source item at a time.

`emotionPrompt`
Extracts the emotional signal expressed in relevant content.
Input: one relevant item at a time.

`tonalityPrompt`
Extracts the tonal signal expressed in relevant content.
Input: one relevant item at a time.

`reportPrompt`
Generates the final report from aggregated analysis outputs.
Input: a structured reporting input produced by the pipeline.

Example:

```json
{
  "variant": "fr-dev-job-market-v1",
  "relevancePrompt": "You are an emotional climate analyst...",
  "emotionPrompt": "You analyze human emotions expressed in a text...",
  "tonalityPrompt": "You analyze the emotional tones of a text...",
  "reportPrompt": "You transform an aggregated profile into a..."
}
```

## Source Bundles

A source bundle defines the set of upstream content sources for a topic.

Expected shape:

```json
{
  "variant": "fr-dev-job-market-v1",
  "sources": [
    {
      "kind": "reddit",
      "url": "https://www.reddit.com/r/..."
    }
  ]
}
```

### Reddit Source Constraints

A Reddit source must point to a feed that returns a list of complete posts usable by the pipeline.

Expected properties of fetched items:

- multiple posts, not a single isolated post page
- a title
- a readable content body when available
- a score
- a permalink when available
- an author when available
- a creation time when available
- a comment count when available

These fields are important both for the current analysis pipeline and for future MassWhisper iterations.

## Validation

A topic config is validated together with the manifest.

```bash
npm run validate-manifest -- instances/<topic-slug>/<environment>.yaml local/topic-config
```
