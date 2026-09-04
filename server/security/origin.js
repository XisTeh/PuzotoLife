const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

export function applicationOrigin(env = process.env) {
  return new URL(env.APP_ORIGIN || 'http://localhost:5174').origin;
}

export function allowedRequestOrigins(env = process.env) {
  const configuredOrigin = new URL(applicationOrigin(env));
  const allowed = new Set([configuredOrigin.origin]);

  if (env.NODE_ENV !== 'production' && LOOPBACK_HOSTS.includes(configuredOrigin.hostname)) {
    for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
      allowed.add(`${configuredOrigin.protocol}//${hostname}${configuredOrigin.port ? `:${configuredOrigin.port}` : ''}`);
    }
  }

  if (env.NODE_ENV !== 'production') {
    const serverPort = env.PORT || 3210;
    allowed.add(`http://localhost:${serverPort}`);
    allowed.add(`http://127.0.0.1:${serverPort}`);
    allowed.add(`http://[::1]:${serverPort}`);
  }

  return allowed;
}

export function isLoopbackHostname(hostname) {
  return LOOPBACK_HOSTS.includes(hostname);
}
