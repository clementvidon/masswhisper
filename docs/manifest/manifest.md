# Manifest

This document defines the instance manifest consumed by validation and deployment tooling.

## Location

Expected path:

```text
instances/<topic-slug>/<environment>.yaml
```

Example:

```text
instances/fr-dev-job-market/prod.yaml
```

## Required Fields

```yaml
topic_slug: fr-dev-job-market
topic_name: French Developer Job Market
environment: prod
schedule: '0 6 * * *'
sources_variant: fr-dev-job-market-v1
prompt_variant: fr-dev-job-market-v1
domain: fr-dev-job-market.masswhisper.com
```

## Field Definitions

`topic_slug`
Stable topic identifier used in naming, routing, and bundle validation.

`topic_name`
Human-readable topic name exposed to the frontend and deployment tooling.
This field is intended for frontend-facing deployment steps and is not consumed by Terraform.

`environment`
Deployment environment.
Allowed values: `dev`, `prod`.

`schedule`
Capture schedule passed to runtime and deployment tooling.

`sources_variant`
Source bundle variant to inject for the topic.
Must match `<topic-slug>-vN`.

`prompt_variant`
Prompt bundle variant to inject for the topic.
Must match `<topic-slug>-vN`.

These variants resolve to the private prompt and source bundles documented in `docs/manifest/topic-config.md`.

`database_name`
Informational identifier for the dedicated database expected for this deployment.
Runtime connectivity is provided separately through secrets such as `DATABASE_URL`.
This field is declarative and is not consumed by Terraform.

`domain`
Public frontend domain of the deployment.

## Rules

- the manifest is the deployment input contract
- scripts may read and validate the manifest
- scripts must not mutate the manifest
- Terraform input is derived from the manifest, not from handwritten tfvars
- not every manifest field is consumed by Terraform; some fields are used by other deployment tooling
- `sources_variant` and `prompt_variant` must match the topic slug

## Validation

Validate a manifest with:

```bash
npm run validate-manifest -- instances/<topic-slug>/<environment>.yaml local/topic-config
```

Generate Terraform input with:

```bash
npm run generate-topic-tf-input -- instances/<topic-slug>/<environment>.yaml local/topic-config
```

## Related Documents

- `docs/manifest/topic-config.md`
- `docs/ops/deployment-model-dedicated.md`
