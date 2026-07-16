import asyncpg

from .config import settings

_pool: asyncpg.Pool | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    TEXT,
    channel     TEXT NOT NULL,
    template    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'SENT',
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency ledger — same pattern as the TypeScript consumers.
CREATE TABLE IF NOT EXISTS processed_messages (
    id           TEXT PRIMARY KEY,
    type         TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


async def init_db() -> None:
    global _pool
    _pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=5)
    async with _pool.acquire() as conn:
        await conn.execute(SCHEMA)


def get_pool() -> asyncpg.Pool:
    assert _pool is not None, "db pool not initialised"
    return _pool


async def close_db() -> None:
    if _pool is not None:
        await _pool.close()
