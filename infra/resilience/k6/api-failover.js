import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://load-balancer';
const email = __ENV.TEST_EMAIL || '';
const password = __ENV.TEST_PASSWORD || '';

export const options = {
  scenarios: {
    authenticated_failover: {
      executor: 'constant-vus',
      vus: Number(__ENV.K6_VUS || 20),
      duration: __ENV.K6_DURATION || '2m',
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export function setup() {
  if (!email || !password) {
    fail('Defina TEST_EMAIL e TEST_PASSWORD em .env.resilience.');
  }

  const login = http.post(
    `${baseUrl}/api/v1/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  const sessionName = login.cookies.mg_session_partitioned ? 'mg_session_partitioned' : 'mg_session';
  const sessionValue = login.cookies[sessionName]?.[0]?.value;
  const loginOk = check(login, {
    'login retornou 200': (response) => response.status === 200,
    'login criou cookie de sessão': () => Boolean(sessionValue),
  });
  if (!loginOk) fail(`Login de teste falhou com status ${login.status}.`);

  return { cookie: `${sessionName}=${sessionValue}` };
}

export default function (data) {
  const params = { headers: { Cookie: data.cookie }, tags: { flow: 'authenticated-read' } };
  const responses = http.batch([
    ['GET', `${baseUrl}/api/v1/auth/me`, null, params],
    ['GET', `${baseUrl}/api/v1/occurrences`, null, params],
  ]);

  check(responses[0], {
    'sessão continuou válida': (response) => response.status === 200,
    'auth/me não retornou erro de infraestrutura': (response) => ![502, 503, 504].includes(response.status),
  });
  check(responses[1], {
    'escalas continuaram disponíveis': (response) => response.status === 200,
    'occurrences não retornou erro de infraestrutura': (response) => ![502, 503, 504].includes(response.status),
  });

  sleep(0.5);
}
