FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5477

ENV SERVER_PORT=5477
ENV SERVER_HOST=0.0.0.0

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5477"]
