from prometheus_client import Counter

notifications_sent = Counter(
    "notifications_sent_total",
    "Notifications sent, by event type and channel",
    ["event_type", "channel"],
)
