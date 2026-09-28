FROM public.ecr.aws/docker/library/node@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS node

FROM ghcr.io/astral-sh/uv@sha256:28df4bbd896cf66a224f2e0cb22240a9a2b9803a3a13519bcadf2e9fdd68c632

COPY --from=node /usr/local/ /usr/local/
COPY probe.mjs /opt/cnmcp/probe.mjs

WORKDIR /tmp
ENV HOME=/tmp/cnmcp \
    NPM_CONFIG_CACHE=/tmp/npm-cache \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    UV_CACHE_DIR=/tmp/uv-cache \
    UV_NO_PROGRESS=1 \
    UV_PYTHON_DOWNLOADS=never

ENTRYPOINT ["sh", "-lc", "rm -f /tmp/cnmcp-ready && cp /etc/cloudflare/certs/cloudflare-containers-ca.crt /usr/local/share/ca-certificates/cloudflare-containers-ca.crt && update-ca-certificates >/dev/null 2>&1 && touch /tmp/cnmcp-ready && exec node -e 'setInterval(() => {}, 2147483647)'"]
