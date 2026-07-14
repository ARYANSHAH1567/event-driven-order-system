# Build context is this service directory (see docker-compose.yml).
FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 4005
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4005"]
