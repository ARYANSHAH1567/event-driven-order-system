import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from .config import settings
from .consumer import start_consumer
from .db import close_db, get_pool, init_db

logging.basicConfig(level=settings.log_level)
log = logging.getLogger("notification")

_connection = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    global _connection
    _connection = await start_consumer()
    log.info("notification-service started")
    yield
    if _connection is not None:
        await _connection.close()
    await close_db()


app = FastAPI(title="notification-service", lifespan=lifespan)


@app.get("/healthz")
async def health() -> dict:
    return {"status": "ok", "service": "notification-service"}


@app.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/api/notifications")
async def list_notifications() -> dict:
    async with get_pool().acquire() as conn:
        rows = await conn.fetch(
            "SELECT order_id, channel, template, status, sent_at "
            "FROM notifications ORDER BY sent_at DESC LIMIT 100"
        )
    return {"notifications": [dict(r) for r in rows]}
