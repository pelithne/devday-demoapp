FROM python:3.13-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATABASE_PATH=/data/votes.db
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --uid 10001 --create-home app \
    && mkdir /data && chown app:app /data
COPY app.py topics.json ./
ARG RELEASE_VERSION=local
ENV RELEASE_VERSION=${RELEASE_VERSION}
USER 10001:10001
EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--threads", "2", "--access-logfile", "-", "--error-logfile", "-", "--worker-tmp-dir", "/tmp", "app:create_app()"]
