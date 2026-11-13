import time

from api.redis_client import redis_client
from api.metrics import (
    redis_cache_hits_total,
    redis_cache_misses_total,
    redis_operation_duration_seconds,
    redis_operations_total,
)


def redis_get(key: str, cache_name: str = "default"):
    start = time.perf_counter()

    try:
        value = redis_client.get(key)

        if value is not None:
            redis_cache_hits_total.labels(
                cache=cache_name
            ).inc()
        else:
            redis_cache_misses_total.labels(
                cache=cache_name
            ).inc()

        redis_operations_total.labels(
            operation="get",
            status="success"
        ).inc()

        return value

    except Exception:
        redis_operations_total.labels(
            operation="get",
            status="error"
        ).inc()
        raise

    finally:
        redis_operation_duration_seconds.labels(
            operation="get"
        ).observe(time.perf_counter() - start)


def redis_set(key: str, value: str, ttl: int = 300):
    start = time.perf_counter()

    try:
        redis_client.setex(
            key,
            ttl,
            value
        )

        redis_operations_total.labels(
            operation="set",
            status="success"
        ).inc()

    except Exception:
        redis_operations_total.labels(
            operation="set",
            status="error"
        ).inc()
        raise

    finally:
        redis_operation_duration_seconds.labels(
            operation="set"
        ).observe(time.perf_counter() - start)


def redis_delete(key: str):
    start = time.perf_counter()

    try:
        redis_client.delete(key)

        redis_operations_total.labels(
            operation="delete",
            status="success"
        ).inc()

    except Exception:
        redis_operations_total.labels(
            operation="delete",
            status="error"
        ).inc()
        raise

    finally:
        redis_operation_duration_seconds.labels(
            operation="delete"
        ).observe(time.perf_counter() - start)
