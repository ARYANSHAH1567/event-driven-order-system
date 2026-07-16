-- One PostgreSQL instance, one database per service (no shared tables — services
-- may only reach each other's data via events, never via cross-database queries).
CREATE DATABASE order_db;
CREATE DATABASE inventory_db;
CREATE DATABASE payment_db;
CREATE DATABASE shipping_db;
CREATE DATABASE notification_db;
