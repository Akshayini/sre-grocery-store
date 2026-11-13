from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.redis_client import redis_client
from api.metrics import (
    redis_operation_duration_seconds,
    redis_operations_total,
    redis_cart_items,
)

import time


router = APIRouter(
    prefix="/cart",
    tags=["cart"]
)


CART_TTL_SECONDS = 3600


class CartItem(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)


@router.post("/{user_id}/items")
def add_to_cart(
    user_id: int,
    item: CartItem
):
    key = f"cart:{user_id}"
    field = f"product:{item.product_id}"

    start = time.perf_counter()

    try:
        new_quantity = redis_client.hincrby(
            key,
            field,
            item.quantity
        )

        redis_client.expire(
            key,
            CART_TTL_SECONDS
        )

        redis_operations_total.labels(
            operation="cart_add",
            status="success"
        ).inc()

        redis_cart_items.labels(
            user_id=str(user_id)
        ).set(
            sum(
                int(v)
                for v in redis_client.hvals(key)
            )
        )

        return {
            "message": "Product added to cart",
            "user_id": user_id,
            "product_id": item.product_id,
            "quantity": new_quantity,
        }

    except Exception:
        redis_operations_total.labels(
            operation="cart_add",
            status="error"
        ).inc()

        raise

    finally:
        redis_operation_duration_seconds.labels(
            operation="cart_add"
        ).observe(
            time.perf_counter() - start
        )


@router.get("/{user_id}")
def get_cart(user_id: int):

    key = f"cart:{user_id}"

    start = time.perf_counter()

    try:
        cart = redis_client.hgetall(key)

        redis_operations_total.labels(
            operation="cart_get",
            status="success"
        ).inc()

        items = []

        for product_key, quantity in cart.items():

            product_id = int(
                product_key.split(":")[1]
            )

            items.append({
                "product_id": product_id,
                "quantity": int(quantity),
            })

        return {
            "user_id": user_id,
            "items": items,
        }

    except Exception:

        redis_operations_total.labels(
            operation="cart_get",
            status="error"
        ).inc()

        raise

    finally:

        redis_operation_duration_seconds.labels(
            operation="cart_get"
        ).observe(
            time.perf_counter() - start
        )


@router.delete("/{user_id}/items/{product_id}")
def remove_from_cart(
    user_id: int,
    product_id: int
):

    key = f"cart:{user_id}"
    field = f"product:{product_id}"

    start = time.perf_counter()

    try:

        removed = redis_client.hdel(
            key,
            field
        )

        if removed == 0:
            raise HTTPException(
                status_code=404,
                detail="Product not found in cart"
            )

        redis_operations_total.labels(
            operation="cart_remove",
            status="success"
        ).inc()

        return {
            "message": "Product removed",
            "user_id": user_id,
            "product_id": product_id,
        }

    except HTTPException:
        raise

    except Exception:

        redis_operations_total.labels(
            operation="cart_remove",
            status="error"
        ).inc()

        raise

    finally:

        redis_operation_duration_seconds.labels(
            operation="cart_remove"
        ).observe(
            time.perf_counter() - start
        )


@router.delete("/{user_id}")
def clear_cart(user_id: int):

    key = f"cart:{user_id}"

    start = time.perf_counter()

    try:

        redis_client.delete(key)

        redis_operations_total.labels(
            operation="cart_clear",
            status="success"
        ).inc()

        return {
            "message": "Cart cleared",
            "user_id": user_id,
        }

    except Exception:

        redis_operations_total.labels(
            operation="cart_clear",
            status="error"
        ).inc()

        raise

    finally:

        redis_operation_duration_seconds.labels(
            operation="cart_clear"
        ).observe(
            time.perf_counter() - start
        )
