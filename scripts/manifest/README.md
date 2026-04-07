# Manifest Scripts

Manifest validation and Terraform input generation.

## Entry points

- `validate-manifest.ts` → validate a manifest and its local topic config
- `generate-topic-tf-input.ts` → generate Terraform input derived from a manifest

## Internal modules

- `core/` → shared manifest loading, topic config resolution, and Terraform input logic

See `docs/manifest`.
