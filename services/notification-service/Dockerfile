FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .

RUN python -m pip install \
    --no-cache-dir \
    --timeout 180 \
    --retries 10 \
    --index-url https://pypi.org/simple \
    -r requirements.txt

COPY app ./app

EXPOSE 4005

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4005"]