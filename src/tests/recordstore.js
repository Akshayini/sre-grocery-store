import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

// Custom metrics
const apiErrors = new Counter('api_errors');
const businessErrors = new Rate('business_errors');
const checkoutDuration = new Trend('checkout_duration');
const productsDuration = new Trend('products_duration');
const ordersDuration = new Trend('orders_duration');

export const options = {
  scenarios: {
    api_load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 10 },
        { duration: '1m', target: 20 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },

  thresholds: {
    http_req_failed: ['rate<0.05'],

    http_req_duration: ['p(95)<1000', 'p(99)<2000'],

    api_errors: ['count<100'],

    business_errors: ['rate<0.05'],

    checkout_duration: ['p(95)<3000'],
  },
};

function checkResponse(res, name, expectedStatus = 200) {
  const ok = check(res, {
    [`${name}: status ${expectedStatus}`]: (r) =>
      r.status === expectedStatus,
  });

  if (!ok) {
    apiErrors.add(1);
    console.error(
      `${name} failed: status=${res.status}, body=${res.body}`
    );
  }

  return ok;
}

function jsonHeaders() {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

export function setup() {
  console.log(`Testing API: ${BASE_URL}`);

  const health = http.get(`${BASE_URL}/health`);

  checkResponse(health, 'health');

  return {};
}

export default function () {

  // ============================================================
  // 1. ROOT
  // ============================================================

  /*{
    const res = http.get(`${BASE_URL}/`);

    checkResponse(res, 'GET /');
  }*/


  // ============================================================
  // 2. HEALTH
  // ============================================================

  /*{
    const res = http.get(`${BASE_URL}/health`);

    checkResponse(res, 'GET /health');
  }*/


  // ============================================================
  // 3. PRODUCTS - LIST
  // ============================================================

  {
    const start = Date.now();

    const res = http.get(`${BASE_URL}/products`);

    productsDuration.add(Date.now() - start);

    checkResponse(res, 'GET /products');

    check(res, {
      'products response is JSON': (r) =>
        r.headers['Content-Type'] &&
        r.headers['Content-Type'].includes('application/json'),
    });
  }


  // ============================================================
  // 4. PRODUCTS - CREATE
  // ============================================================

  let productId = null;

  {
    const product = {
      name: `k6 Test Record ${__VU}-${__ITER}`,
      price: 19.99,
    };

    const res = http.post(
      `${BASE_URL}/products`,
      JSON.stringify(product),
      {
        headers: jsonHeaders(),
        tags: {
          endpoint: 'create_product',
        },
      }
    );

    if (checkResponse(res, 'POST /products', 200)) {
      try {
        const body = res.json();

        productId = body.id;

        check(res, {
          'created product has ID': () =>
            productId !== undefined &&
            productId !== null,
        });
      } catch (e) {
        console.error(`Could not parse product response: ${e}`);
      }
    }
  }


  // ============================================================
  // 5. ORDERS - LIST
  // ============================================================

  {
    const start = Date.now();

    const res = http.get(`${BASE_URL}/orders`);

    ordersDuration.add(Date.now() - start);

    checkResponse(res, 'GET /orders');

    check(res, {
      'orders response is JSON': (r) =>
        r.headers['Content-Type'] &&
        r.headers['Content-Type'].includes('application/json'),
    });
  }


  // ============================================================
  // Only continue with order APIs when we have a product
  // ============================================================

  if (productId) {

    // ==========================================================
    // 6. CREATE ORDER
    // ==========================================================

    let orderId = null;

    {
      const payload = {
        product_id: Number(productId),
        quantity: 1,
      };

      const res = http.post(
        `${BASE_URL}/orders`,
        JSON.stringify(payload),
        {
          headers: jsonHeaders(),
          tags: {
            endpoint: 'create_order',
          },
        }
      );

      if (checkResponse(res, 'POST /orders', 200)) {
        try {
          const body = res.json();

          orderId = body.order_id;

          check(res, {
            'order created successfully': (r) =>
              r.json('status') === 'pending',
            'created order has ID': () =>
              orderId !== undefined &&
              orderId !== null,
          });
        } catch (e) {
          console.error(`Could not parse order response: ${e}`);
        }
      }
    }


    // ==========================================================
    // 7. CHECKOUT
    // ==========================================================

    {
      const payload = {
        product_id: Number(productId),
        quantity: 1,
      };

      const start = Date.now();

      const res = http.post(
        `${BASE_URL}/checkout`,
        JSON.stringify(payload),
        {
          headers: jsonHeaders(),
          tags: {
            endpoint: 'checkout',
          },
        }
      );

      checkoutDuration.add(Date.now() - start);

      if (checkResponse(res, 'POST /checkout', 200)) {
        check(res, {
          'checkout returned order ID': (r) =>
            r.json('order_id') !== undefined,

          'checkout returned task ID': (r) =>
            r.json('task_id') !== undefined,
        });
      }
    }


    // ==========================================================
    // 8. PROCESS SPECIFIC ORDER
    // ==========================================================

    if (orderId) {

      const res = http.post(
        `${BASE_URL}/orders/${orderId}/process`,
        null,
        {
          tags: {
            endpoint: 'process_order',
          },
        }
      );

      checkResponse(
        res,
        'POST /orders/{order_id}/process',
        200
      );

      check(res, {
        'process response contains order ID': (r) =>
          r.json('order_id') !== undefined,

        'process response contains task ID': (r) =>
          r.json('task_id') !== undefined,
      });
    }
  }


  // ============================================================
  // 9. SLOW OPERATION
  // ============================================================

  /*{
    const res = http.get(`${BASE_URL}/slow-operation`, {
      tags: {
        endpoint: 'slow_operation',
      },
    });

    // This endpoint intentionally has a 30% simulated
    // "error" response, but that response is still HTTP 200.
    checkResponse(res, 'GET /slow-operation');

    if (res.status === 200) {
      const status = res.json('status');

      if (status === 'error') {
        businessErrors.add(1);
      } else {
        businessErrors.add(0);
      }
    }
  }


  // ============================================================
  // 10. TRACE TEST
  // ============================================================

  {
    const res = http.get(`${BASE_URL}/trace-test`, {
      tags: {
        endpoint: 'trace_test',
      },
    });

    checkResponse(res, 'GET /trace-test');
  }


  // ============================================================
  // 11. ERROR TEST
  // ============================================================

  {
    const res = http.get(`${BASE_URL}/error-test`, {
      tags: {
        endpoint: 'error_test',
      },
    });

    // This endpoint intentionally generates errors.
    // Don't count its expected failure as a normal API failure.
    check(res, {
      'error-test responded': (r) =>
        r.status >= 200 && r.status < 600,
    });
  }*/


  // Small pause to model user behavior.
  sleep(Math.random() * 2 + 0.5);
}


export function teardown() {
  console.log('k6 test completed.');
}
