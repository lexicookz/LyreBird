FROM python:3.11-slim

# ffmpeg is the reason this worker exists as a separate service: the mobile app
# cannot run it, so video trimming/transcoding happens here.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Informational only. Railway and Render ignore EXPOSE and route to $PORT.
EXPOSE 8000

# $PORT is assigned by the host at runtime and is not known at build time, so
# a shell has to expand it -- the plain exec form would hand uvicorn the
# literal string "$PORT". `exec` then replaces the shell with uvicorn so it
# becomes PID 1 and receives SIGTERM directly; without it the signal stops at
# /bin/sh and a redeploy kills in-flight requests instead of draining them.
# Defaults to 8000 for local `docker run`.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
