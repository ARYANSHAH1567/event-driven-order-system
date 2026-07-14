import os


class Settings:
    """Runtime config, mirroring the TypeScript services' env contract."""

    rabbitmq_url = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672")
    database_url = os.getenv(
        "NOTIFICATION_DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/notification_db",
    )
    port = int(os.getenv("NOTIFICATION_PORT", "4005"))
    log_level = os.getenv("LOG_LEVEL", "info").upper()


settings = Settings()
