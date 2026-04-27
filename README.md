# LibreChat — ZGCI Fork

This is an internal fork of [LibreChat](https://github.com/danny-avila/LibreChat), customized for ZGCI's internal AI chat deployment.

## What's Changed

**Authentication**
DingTalk SSO is added as the login method. On successful login, a per-user API token is automatically provisioned against the internal new-api gateway, so users can start chatting without any manual setup.

**UI & Branding**
The login page and overall defaults have been updated for ZGCI. The custom endpoint label, smart-router defaults, and agents/web search configuration have been pre-configured. User-facing key settings for the new-api endpoint are hidden to simplify the interface.

## Deployment

Refer to the official [LibreChat deployment docs](https://www.librechat.ai/docs/deployment) for general setup. ZGCI-specific configuration is managed via environment files and `librechat.yaml`.

**Start the service:**

```bash
docker compose up -d
```

**Stop the service:**

```bash
docker compose down
```
