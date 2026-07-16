# Kubernetes deployment

Manifests to run the whole system on a local cluster (kind / minikube). They
demonstrate a Deployment + Service per microservice, config/secrets, health
probes, and a HorizontalPodAutoscaler on the order service.

## Prerequisites

- A local cluster: `kind create cluster` (or `minikube start`)
- For the HPA to actually scale: `metrics-server` installed

## Build & load images

The TypeScript services share one image; the notification service has its own.

```bash
# from the repo root
docker build -t ordersys:latest .
docker build -t ordersys-notification:latest ./services/notification-service

# load into the cluster (kind)
kind load docker-image ordersys:latest
kind load docker-image ordersys-notification:latest
```

## Apply

```bash
kubectl apply -f k8s/          # applies every manifest in order
kubectl -n ordersys get pods -w
```

## Access

```bash
# Order API + ops endpoints
kubectl -n ordersys port-forward svc/order-service 4001:4001

# RabbitMQ management UI
kubectl -n ordersys port-forward svc/rabbitmq 15672:15672
```

## Autoscaling demo

```bash
kubectl -n ordersys get hpa order-service -w
# generate load against the order API and watch replicas scale 2 → 6
```

## Notes

- Infra (Postgres/RabbitMQ/Redis) runs as single-replica Deployments — fine for
  a demo. In production use managed services or operators (CloudNativePG, the
  RabbitMQ cluster operator).
- Services run schema `db push` on start via their container command; a
  production setup would use an initContainer or a migration Job.
