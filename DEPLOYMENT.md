# Deployment guide

Taros Simple CRM runs as two Docker containers: **PocketBase** (database + auth) and the **Next.js app**. Both are defined in `docker-compose.yml`.

---

## Prerequisites

- Docker and Docker Compose v2 installed on the server
- A domain name with DNS pointing to the server
- An SMTP provider (e.g. AWS SES, Postmark, Resend) for transactional email
- (Optional) A [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) site key for bot protection

---

## 1. Clone the repository

```bash
git clone git@github.com:RasmusLiltorp/taros-crm.git
cd taros-crm
```

---

## 2. Configure environment variables

Copy the example file and fill in every value:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_POCKETBASE_URL` | Yes | Public URL the browser uses to reach PocketBase, e.g. `https://pb.yourdomain.com` |
| `NEXT_PUBLIC_APP_URL` | Yes | Public URL of the Next.js app, e.g. `https://yourdomain.com`. Used in verification and password-reset emails. |
| `PB_ADMIN_EMAIL` | Yes | PocketBase superuser email. Also used by the `/api/accept-invite` route. |
| `PB_ADMIN_PASSWORD` | Yes | PocketBase superuser password. Use a strong, random value. |
| `PB_SMTP_HOST` | Yes | SMTP hostname, e.g. `email-smtp.eu-west-1.amazonaws.com` |
| `PB_SMTP_USER` | Yes | SMTP username / access key |
| `PB_SMTP_PASS` | Yes | SMTP password / secret key |
| `PB_SENDER_EMAIL` | Yes | From-address for outgoing emails, e.g. `noreply@yourdomain.com` |
| `PB_SMTP_PORT` | No | SMTP port (default: `587`) |
| `PB_SMTP_TLS` | No | Use implicit TLS (default: `false` for STARTTLS). Set to `true` only for ports like `465` |
| `PB_SMTP_AUTH_METHOD` | No | SMTP auth method (default: `LOGIN`). Set to empty string to disable auth. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | No | Cloudflare Turnstile site key. Leave blank to disable CAPTCHA. |
| `TURNSTILE_SECRET` | No | Cloudflare Turnstile secret key. Required if site key is set. |

> **Security:** `.env` is gitignored and must never be committed. Keep `PB_ADMIN_PASSWORD` secret — it is used at runtime by the Next.js app to accept invites server-side.

---

## 3. Expose PocketBase publicly (reverse proxy)

By default PocketBase binds to `127.0.0.1:8090` — it is not reachable from the internet. You must proxy it through nginx or Caddy so the browser can reach it at the URL you set in `NEXT_PUBLIC_POCKETBASE_URL`.

### Caddy example

```caddy
pb.yourdomain.com {
    reverse_proxy localhost:8090
}

yourdomain.com {
    reverse_proxy localhost:3000
}
```

### nginx example

The nginx config above listens on port 443 but does not include SSL certificate directives — you must obtain and reference certificates yourself. Using [Certbot](https://certbot.eff.org/) with the nginx plugin is the standard approach:

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d pb.yourdomain.com
```

Certbot will modify your nginx config to add the `ssl_certificate` and `ssl_certificate_key` directives and set up automatic renewal. Run `certbot renew --dry-run` to verify auto-renewal is working.

```nginx
server {
    listen 443 ssl;
    server_name pb.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/pb.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pb.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 4. Start the stack

```bash
docker compose up -d
```

On first boot, PocketBase will:
1. Apply all migrations in `pb_migrations/` (creates collections and rules)
2. Run `pb_hooks/settings.pb.js` (configures SMTP, MFA, email templates, creates the superuser)

Check logs:

```bash
docker compose logs -f pocketbase
docker compose logs -f app
```

The app is healthy when you see:

```
[settings.pb.js] users collection configured successfully
Server started at http://0.0.0.0:8090
```

---

## 5. Verify the deployment

1. Open `https://yourdomain.com` — you should see the login page
2. Register a new account; you will receive a verification email
3. Verify your email, log in — MFA sends an OTP to your inbox
4. You will be prompted to name your team on first login

---

## 6. Access the PocketBase admin dashboard

```
https://pb.yourdomain.com/_/
```

Log in with `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD`. Use this to manage records, inspect logs, and adjust collection rules if needed.

---

## Updates

Pull the latest code and rebuild:

```bash
git pull
docker compose up -d --build
```

Migrations are applied automatically on PocketBase startup. There is no manual migration step.

---

## Data persistence

PocketBase data (SQLite database + uploaded files) is stored in a named Docker volume `pocketbase_data`. It survives container restarts and image rebuilds.

To back up the database:

```bash
docker run --rm \
  -v taros-crm_pocketbase_data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/pb_data_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
```

---

## Stopping the stack

```bash
docker compose down        # stop containers, keep volumes
docker compose down -v     # stop containers AND delete data (destructive)
```

---

## Automated backups

The one-off backup command in the section above can be scheduled via cron. To back up daily at 2am and keep 30 days of backups:

```bash
mkdir -p /var/backups/taros-crm

# Add to crontab (crontab -e):
0 2 * * * docker run --rm \
  -v taros-crm_pocketbase_data:/data \
  -v /var/backups/taros-crm:/backup \
  alpine tar czf /backup/pb_data_$(date +\%Y\%m\%d_\%H\%M\%S).tar.gz -C /data . \
  && find /var/backups/taros-crm -name "*.tar.gz" -mtime +30 -delete
```

To restore from a backup:

```bash
# Stop PocketBase first
docker compose stop pocketbase

# Restore into the volume
docker run --rm \
  -v taros-crm_pocketbase_data:/data \
  -v /var/backups/taros-crm:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/<filename>.tar.gz -C /data"

docker compose start pocketbase
```

> **Note:** PocketBase also has a built-in backup API at `/_/` → Backups. You can trigger and download backups manually from the admin dashboard.

---

## Monitoring

There is no built-in monitoring setup. Recommended minimal approach:

- **Uptime:** Use a free uptime monitor (e.g. UptimeRobot, BetterStack, or Healthchecks.io) to ping `https://yourdomain.com` every minute and alert on downtime.
- **Logs:** `docker compose logs -f` streams live logs. For persistent log retention consider `docker compose logs --no-color > app.log` or a log driver like `json-file` with rotation:

```yaml
# In docker-compose.yml, add to each service:
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

- **Disk space:** PocketBase data grows with contacts and file uploads. Monitor disk usage with `df -h` or set up an alert on the volume path.

---

## Kubernetes deployment

This section covers deploying Taros Simple CRM on a Kubernetes cluster. The stack is the same as Docker Compose — a **PocketBase** pod and a **Next.js app** pod — with a `PersistentVolumeClaim` for PocketBase data and an `Ingress` for external access.

### Prerequisites

- A running Kubernetes cluster (k3s, EKS, GKE, etc.)
- `kubectl` configured with cluster access
- An ingress controller installed (nginx, Traefik, etc.)
- [cert-manager](https://cert-manager.io/) installed with a `ClusterIssuer` (for automatic TLS)
- A container registry to push images to (e.g. GHCR, Docker Hub)
- An SMTP provider for transactional email

### Overview

```
                  ┌─────────────────────────────────┐
Internet ──────── │  Ingress (TLS)                  │
                  │  app.yourdomain.com              │
                  │  pb.yourdomain.com               │
                  └────────┬──────────────────┬──────┘
                           │                  │
                  ┌────────▼──────┐  ┌────────▼──────────┐
                  │  app Service  │  │  pocketbase Service│
                  └────────┬──────┘  └────────┬──────────┘
                           │                  │
                  ┌────────▼──────┐  ┌────────▼──────────┐
                  │  app Pod      │  │  pocketbase Pod    │
                  │  (Next.js)    │  │  + PVC (SQLite)    │
                  └───────────────┘  └───────────────────┘
```

The Next.js app and PocketBase communicate over the cluster network. The browser reaches PocketBase directly at `pb.yourdomain.com` (required for the PocketBase JS SDK to work).

---

### 1. Build and push images

Build both images and push to your registry. Replace `your-registry` with your actual registry (e.g. `ghcr.io/your-org`).

```bash
# Next.js app
docker build -t your-registry/taros-crm-app:latest .
docker push your-registry/taros-crm-app:latest

# PocketBase — uses the official image with migrations and hooks baked in
# The Dockerfile already copies pb_migrations/ and pb_hooks/ into the image
docker build -f Dockerfile.pocketbase -t your-registry/taros-crm-pocketbase:latest .
docker push your-registry/taros-crm-pocketbase:latest
```

> If your registry is private, create an image pull secret in your namespace:
> ```bash
> kubectl create secret docker-registry registry-secret \
>   --docker-server=your-registry \
>   --docker-username=<user> \
>   --docker-password=<token> \
>   -n taros-crm
> ```

---

### 2. Create the namespace

```bash
kubectl create namespace taros-crm
```

---

### 3. Create a Secret for environment variables

All configuration is passed to the pods via a single Kubernetes `Secret`. Create it with all required values:

```bash
kubectl create secret generic taros-crm-env \
  --from-literal=NEXT_PUBLIC_POCKETBASE_URL="https://pb.yourdomain.com" \
  --from-literal=NEXT_PUBLIC_APP_URL="https://app.yourdomain.com" \
  --from-literal=PB_ADMIN_EMAIL="admin@yourdomain.com" \
  --from-literal=PB_ADMIN_PASSWORD="<strong-random-password>" \
  --from-literal=PB_SMTP_HOST="email-smtp.eu-west-1.amazonaws.com" \
  --from-literal=PB_SMTP_USER="<smtp-user>" \
  --from-literal=PB_SMTP_PASS="<smtp-pass>" \
  --from-literal=PB_SENDER_EMAIL="noreply@yourdomain.com" \
  --from-literal=NEXT_PUBLIC_TURNSTILE_SITE_KEY="" \
  --from-literal=TURNSTILE_SECRET="" \
  -n taros-crm
```

Optional SMTP variables (if your provider needs them):

```bash
kubectl patch secret taros-crm-env -n taros-crm \
  --patch='{"stringData":{"PB_SMTP_PORT":"587","PB_SMTP_TLS":"true","PB_SMTP_AUTH_METHOD":"LOGIN"}}'
```

---

### 4. Apply the manifests

Save the following as `k8s/taros-crm.yaml` and apply it:

```bash
kubectl apply -f k8s/taros-crm.yaml
```

```yaml
# k8s/taros-crm.yaml
---
# PersistentVolumeClaim — PocketBase SQLite database + uploaded files
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pocketbase-data
  namespace: taros-crm
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi

---
# PocketBase Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pocketbase
  namespace: taros-crm
spec:
  replicas: 1       # PocketBase uses SQLite — single replica only
  selector:
    matchLabels:
      app: pocketbase
  template:
    metadata:
      labels:
        app: pocketbase
    spec:
      # imagePullSecrets:
      #   - name: registry-secret   # Uncomment if using a private registry
      containers:
        - name: pocketbase
          image: your-registry/taros-crm-pocketbase:latest
          ports:
            - containerPort: 8090
          env:
            - name: PB_ADMIN_EMAIL
              valueFrom:
                secretKeyRef:
                  name: taros-crm-env
                  key: PB_ADMIN_EMAIL
            - name: PB_ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: taros-crm-env
                  key: PB_ADMIN_PASSWORD
            - name: PB_SMTP_HOST
              valueFrom:
                secretKeyRef:
                  name: taros-crm-env
                  key: PB_SMTP_HOST
            - name: PB_SMTP_USER
              valueFrom:
                secretKeyRef:
                  name: taros-crm-env
                  key: PB_SMTP_USER
            - name: PB_SMTP_PASS
              valueFrom:
                secretKeyRef:
                  name: taros-crm-env
                  key: PB_SMTP_PASS
            - name: PB_SENDER_EMAIL
              valueFrom:
                secretKeyRef:
                  name: taros-crm-env
                  key: PB_SENDER_EMAIL
            - name: NEXT_PUBLIC_APP_URL
              valueFrom:
                secretKeyRef:
                  name: taros-crm-env
                  key: NEXT_PUBLIC_APP_URL
          volumeMounts:
            - name: pb-data
              mountPath: /pb_data
          livenessProbe:
            httpGet:
              path: /api/health
              port: 8090
            initialDelaySeconds: 15
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /api/health
              port: 8090
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
      volumes:
        - name: pb-data
          persistentVolumeClaim:
            claimName: pocketbase-data

---
# PocketBase Service
apiVersion: v1
kind: Service
metadata:
  name: pocketbase
  namespace: taros-crm
spec:
  selector:
    app: pocketbase
  ports:
    - port: 8090
      targetPort: 8090

---
# Next.js App Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: taros-crm
spec:
  replicas: 2
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      # imagePullSecrets:
      #   - name: registry-secret   # Uncomment if using a private registry
      containers:
        - name: app
          image: your-registry/taros-crm-app:latest
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef:
                name: taros-crm-env
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi

---
# Next.js App Service
apiVersion: v1
kind: Service
metadata:
  name: app
  namespace: taros-crm
spec:
  selector:
    app: app
  ports:
    - port: 3000
      targetPort: 3000

---
# Ingress — requires cert-manager and a ClusterIssuer named letsencrypt-prod
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: taros-crm
  namespace: taros-crm
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx   # Change to traefik if using Traefik
  tls:
    - hosts:
        - app.yourdomain.com
        - pb.yourdomain.com
      secretName: taros-crm-tls
  rules:
    - host: app.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app
                port:
                  number: 3000
    - host: pb.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: pocketbase
                port:
                  number: 8090
```

> **Important:** You need a `Dockerfile.pocketbase` that bakes migrations and hooks into the PocketBase image. If one doesn't exist yet, create it:
> ```dockerfile
> FROM alpine:3.19
> ARG PB_VERSION=0.36.5
> RUN apk add --no-cache unzip ca-certificates && \
>     wget -q https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip \
>     -O /tmp/pb.zip && unzip /tmp/pb.zip -d /pb && rm /tmp/pb.zip
> COPY pb_migrations /pb/pb_migrations
> COPY pb_hooks /pb/pb_hooks
> EXPOSE 8090
> CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb_data"]
> ```

---

### 5. Verify the deployment

```bash
# Check all pods are Running
kubectl get pods -n taros-crm

# Check the ingress and TLS certificate
kubectl get ingress -n taros-crm
kubectl get certificate -n taros-crm

# Tail PocketBase startup logs — look for:
# [settings.pb.js] users collection configured successfully
kubectl logs -f deployment/pocketbase -n taros-crm

# Tail app logs
kubectl logs -f deployment/app -n taros-crm
```

Once both pods are `Running` and the certificate is `Ready`, open `https://app.yourdomain.com`.

---

### 6. Updates

Build and push a new image, then update the deployment:

```bash
docker build -t your-registry/taros-crm-app:v1.2.0 .
docker push your-registry/taros-crm-app:v1.2.0

kubectl set image deployment/app app=your-registry/taros-crm-app:v1.2.0 -n taros-crm

# Watch the rollout
kubectl rollout status deployment/app -n taros-crm
```

PocketBase migrations are applied automatically on startup — update PocketBase the same way.

---

### 7. Backups

PocketBase data lives in the `pocketbase-data` PVC. Back it up by spawning a temporary pod:

```bash
kubectl run pb-backup --rm -it \
  --image=alpine \
  --restart=Never \
  --overrides='{"spec":{"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"pocketbase-data"}}],"containers":[{"name":"pb-backup","image":"alpine","command":["tar","czf","/backup/pb_data.tar.gz","-C","/data","."],"volumeMounts":[{"mountPath":"/data","name":"data"}]}]}}' \
  -n taros-crm
```

Or use your cluster's preferred PVC snapshot mechanism (e.g. Velero, CSI snapshots). PocketBase also exposes a backup API at `/_/` → Backups in the admin dashboard.

---

### Using Infisical for secret management

If you use [Infisical](https://infisical.com/) (self-hosted or cloud) with the Infisical Kubernetes Operator, you can replace the manual `kubectl create secret` step with an `InfisicalSecret` CRD. The operator will create and sync the `taros-crm-env` secret automatically.

First, install the [Infisical Kubernetes Operator](https://infisical.com/docs/integrations/platforms/kubernetes) in your cluster. Then create a machine identity with access to your project and add your CRM secrets under a `/taros-crm` path. Finally apply this CRD:

```yaml
apiVersion: secrets.infisical.com/v1alpha1
kind: InfisicalSecret
metadata:
  name: taros-crm-infisical
  namespace: taros-crm
spec:
  hostAPI: https://app.infisical.com   # or your self-hosted Infisical URL
  resyncInterval: 60
  authentication:
    universalAuth:
      secretsScope:
        projectSlug: your-project-slug
        envSlug: prod
        secretsPath: /taros-crm
      credentialsRef:
        secretName: infisical-machine-identity
        secretNamespace: infisical-operator
  managedSecretReference:
    secretName: taros-crm-env        # Must match the name used in the manifests above
    secretNamespace: taros-crm
    creationPolicy: Owner
```

```bash
kubectl apply -f taros-crm-infisical.yaml
```

The operator will create `taros-crm-env` in the `taros-crm` namespace and keep it in sync. Do not create the secret manually — the operator owns it.
