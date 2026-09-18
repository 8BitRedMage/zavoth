# Deploying to InstaCloud

The app runs as two InstaCloud compute services plus managed Postgres and storage:

| Service          | What it is                                                                 |
| ---------------- | -------------------------------------------------------------------------- |
| `compute/server` | Wasp's Node server (`app/.wasp/out/Dockerfile`), port 8080. Runs DB migrations on start. |
| `compute/web`    | nginx serving the client build: the prerendered landing page and the rest of the UI (`deploy/web`), port 8080. |
| `postgres/db`    | The app database.                                                          |
| `storage/files`  | S3-compatible bucket for the file-upload feature.                          |

Docs: https://docs.instacloud.com

## One-time setup

Commit `.insta/project.json` so teammates and CI use the same project.

```sh
npx -y insta@latest setup agent            # installs the CLI, agent skill and MCP server
insta login --oauth github                 # skip if `insta status` shows you're logged in
insta project link a3cca2ef-8b63-4328-9440-6919531e1319   # run from the repo root; writes .insta/project.json

insta services add postgres db
insta services add storage files
insta services add compute server
insta services add compute web
```

Keep `server` always-on (the default for new compute services): Open SaaS runs a
daily analytics cron job that doesn't run while a scaled-to-zero service sleeps.

### Wire managed credentials into the server

```sh
insta secrets bind DATABASE_URL postgres/db --to compute/server

insta secrets bind AWS_S3_IAM_ACCESS_KEY storage/files --source-name AWS_ACCESS_KEY_ID     --to compute/server
insta secrets bind AWS_S3_IAM_SECRET_KEY storage/files --source-name AWS_SECRET_ACCESS_KEY --to compute/server
insta secrets bind AWS_S3_FILES_BUCKET   storage/files --source-name BUCKET_NAME           --to compute/server
insta secrets bind AWS_S3_REGION         storage/files --source-name AWS_REGION            --to compute/server
insta secrets bind AWS_S3_ENDPOINT       storage/files --source-name AWS_ENDPOINT_URL_S3   --to compute/server
```

`insta secrets sources` lists the exact source names if these differ.

### Set the app's own secrets

Get both services' URLs from `insta manifest` (or your custom domains, below), then:

```sh
insta secrets set WASP_SERVER_URL https://<server url>
insta secrets set WASP_WEB_CLIENT_URL https://<web url>
openssl rand -hex 32 | insta secrets set JWT_SECRET
```

Then set every other key from `app/.env.server` that you use in production
(`RESEND_API_KEY`, `STRIPE_API_KEY`, `ADMIN_EMAILS`, ...). A value can also be piped
on stdin, which keeps it out of your shell history: `insta secrets set STRIPE_API_KEY`.

Production sends email through Resend, so `RESEND_API_KEY` is required, and the
sender address in `app/src/server/emailSender.wasp.ts` and `app/src/auth/auth.wasp.ts`
must be on a domain verified in Resend.

## Deploy

```sh
API_URL=https://<server url> ./deploy/deploy.sh
```

This builds the server and client, bakes `API_URL` into the client, and runs
`insta deploy` for both services. Client env vars (`REACT_APP_*`) are fixed at build
time, so export them before running the script, e.g. `REACT_APP_GOOGLE_ANALYTICS_ID=G-... API_URL=... ./deploy/deploy.sh`.

To a staging branch: `API_URL=... ./deploy/deploy.sh --branch staging`.

Secrets are applied at deploy time: after changing one, redeploy or run
`insta compute restart server`.

## Custom domains

Attach e.g. `zavoth.com` to `web` and `api.zavoth.com` to `server` with
`insta compute set-domain <host>` (see `insta compute help set-domain`; `insta compute check-domain <host>`
shows the DNS records). Then update `WASP_SERVER_URL` / `WASP_WEB_CLIENT_URL`, the
`og:url` / image URLs in `app/src/client/head.wasp.ts`, and redeploy with the new `API_URL`.

## Troubleshooting

- `insta build .wasp/out --explain` (from `app/`, after `wasp build`) checks the server image locally.
- `insta logs compute --deploy` shows the latest deploy's logs.
