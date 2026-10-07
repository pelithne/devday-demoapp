# Dev Day demo apps

Two applications deployed to AKS through the same Flux GitOps source:

- **Dev Day Live:** a colourful, responsive voting board. Pick GitOps, Kubernetes, workload identity, or observability and watch the room's results update live.
- **Hello, World!:** a stateless webpage with a waving hello, a smiling globe, confetti, and remixable colours. No backend or database.

## Architecture

```text
Browser --> Public Azure LoadBalancer --> Nginx frontend --> Flask API
                                                            |
                                                    SQLite / Azure Disk

Browser --> Separate public Azure LoadBalancer --> Hello World Nginx page

GitHub commit --> Actions tests + container builds --> ACR
                       |
                       +--> commit image SHAs to deploy/kustomization.yaml
                                                |
                                      Flux pulls Git --> AKS
```

- Two frontend replicas serve vanilla HTML/CSS/JavaScript and proxy `/api` to the backend. No build framework or external font/CDN dependency.
- One Flask/Gunicorn backend stores anonymous votes in SQLite on a 4-GiB Azure Disk PVC. `Recreate` deployment strategy prevents overlapping backend pods sharing the single-writer disk; expect a brief voting outage on backend updates.
- A random browser-local UUID identifies a vote. Repeated voting updates that browser's choice rather than adding votes. No names, messages, or personal profiles are stored. This is a demo, not an authenticated or abuse-resistant voting system: clearing browser storage can create a new voter.
- UI and API commit versions are visible in the footer. Results refresh every five seconds.
- The Hello World app has two Nginx replicas and its own public Service. The hello counter and colour choice exist only in browser memory and reset on reload.
- ACR is in Sweden Central, AKS in North Europe. All workloads target the user node pool.
- Containers run non-root, with read-only root filesystems and bounded resource requests/limits.

The public endpoints use **HTTP**, intended for a short-lived workshop. Do not collect sensitive information. For production, add a domain, TLS ingress, abuse controls, observability, and backups/managed storage for the voting app.

## Repositories and source of truth

- App, image pipeline, and Kubernetes manifests: [pelithne/devday-demoapp](https://github.com/pelithne/devday-demoapp).
- AKS, ACR, and Flux source configuration: [pelithne/devday-infra](https://github.com/pelithne/devday-infra).
- Flux source: this repository, `main`, path `./deploy`, namespace `devday-demoapp`.

Actions publish `devday-frontend`, `devday-backend`, and `devday-hello-world` images tagged with a full source commit SHA, then update [deploy/kustomization.yaml](./deploy/kustomization.yaml) in a separate release commit. Flux polls Git every minute and reconciles the desired state. There is **no kubectl deployment step and no AKS credentials in app CI**. A source change rebuilds all three images and can briefly restart the voting backend; its votes stay on the persistent disk.

The release commit is authored as `pelithne` and pushed using the job-scoped GitHub token. GitHub does not trigger another Actions run for that token's push, avoiding a build loop. Changes only to manifests can go straight to Flux without rebuilding images.

## One-time ACR publishing identity

Deploy [infra/github-oidc.bicep](./infra/github-oidc.bicep) with an administrative identity:

```bash
az deployment group create \
  --subscription Student11 \
  --resource-group rg-azure-day \
  --name demoapp-oidc-bootstrap \
  --template-file infra/github-oidc.bicep
```

This creates `id-devday-demoapp-ci`, trusts the exact immutable-ID GitHub OIDC subject for environment `registry-build`, and grants only `AcrPush` on the existing registry. It does not grant AKS access or resource-group administration.

Configure the GitHub `registry-build` environment with a selected deployment branch of `main` and these variables:

| Variable | Bootstrap output |
| --- | --- |
| `AZURE_CLIENT_ID` | `clientId` |
| `AZURE_TENANT_ID` | `tenantId` |
| `AZURE_SUBSCRIPTION_ID` | `subscriptionId` |
| `ACR_NAME` | `acrName` |

The environment has no manual approval: committing application changes intentionally delivers them automatically through Flux. Public pull requests run tests/container builds only and cannot publish images. Verify the OIDC prefix after any repository rename.

## Demo script

1. Open the frontend's public address:
   ```bash
   kubectl get service frontend -n devday-demoapp
   ```
   Browse to `http://<EXTERNAL-IP>`.
2. Vote, then open another browser to add another voter.
3. Change the heading in [frontend/index.html](./frontend/index.html), or the colours in [frontend/styles.css](./frontend/styles.css). Commit and push to `main`.
4. Watch Actions publish the three images and create the image-version commit.
5. Watch Flux and Kubernetes:
   ```bash
   kubectl get gitrepositories,kustomizations -n flux-system
   kubectl get pods -n devday-demoapp --watch
   ```
6. Refresh the page: the visible change and release badges should match the source commit. Your votes should still be there.
7. For a manifests-only demo, change the frontend replica count in [deploy/frontend.yaml](./deploy/frontend.yaml). Flux changes the cluster without building images.

### Hello World demo

Find the second page's address:

```bash
kubectl get service hello-world -n devday-demoapp
```

Browse to `http://<EXTERNAL-IP>`. Try **Send a little hello** and **Remix the colours**. Animations respect the browser's reduced-motion setting.

Change the greeting in [hello-world/index.html](./hello-world/index.html) or its styles in [hello-world/styles.css](./hello-world/styles.css), then push to `main`. Actions builds the images and updates Git; Flux rolls out the page automatically. The release badge shows the source commit.

Both applications remain in the same Flux-managed namespace. No additional Flux configuration or Azure publishing identity is required.

To roll back a complete release, commit the previous **three** image tags to the Kustomization. To roll back only the static page, change just its image tag. Flux reconciles to that release. Never use `latest` tags.

## Local tests and API

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/python -m unittest discover -s backend -v
python3 -m unittest discover -s scripts -v
node --check frontend/app.js
node --check hello-world/app.js
node --test hello-world/test_app.cjs
kubectl kustomize deploy
```

To run just the API:

```bash
DATABASE_PATH="$PWD/votes.db" .venv/bin/gunicorn \
  --chdir backend --bind 127.0.0.1:8000 'app:create_app()'
```

Endpoints: `GET /api/state`, `POST /api/votes` with `{"voterId":"<uuid>","topicId":"gitops"}`, `GET /healthz`, and `GET /readyz`.

## Data lifecycle and cost

The PVC and namespace are marked non-prunable so removing a manifest or Flux configuration does not inadvertently delete votes. Explicitly deleting the PVC, namespace, or resource group can still destroy data. The default Azure Disk storage class deletes the disk when its PVC is deleted; back up the database before intentional teardown.

Deleting a topic hides its old votes from the results but does not erase them; restoring the same topic ID restores its counts. Keep topic IDs stable. The app does not include an unauthenticated reset endpoint.

The disk and public LoadBalancer/IPs can incur additional Azure charges. Hello World adds its own public Service/IP, but no disk. Removing this GitOps configuration prunes its Deployments and Services, but intentionally retains the namespace/PVC; clean those up explicitly when the workshop is over.
