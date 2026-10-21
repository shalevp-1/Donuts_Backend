export const LOCAL_FRONTEND_ORIGIN = 'http://localhost:3000';

const REQUIRED_PRODUCTION_ENV = [
    'MYSQL_HOST',
    'MYSQL_USER',
    'MYSQL_PASSWORD',
    'MYSQL_DATABASE',
    'MYSQL_PORT',
    'JWT_SECRET',
    'FRONTEND_ORIGINS'
];

export function parseFrontendOrigins(value, { requireHttps = false } = {}) {
    const origins = value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (origins.length === 0) {
        throw new Error('At least one frontend origin is required.');
    }

    return [...new Set(origins.map((origin) => {
        let parsed;
        try {
            parsed = new URL(origin);
        } catch {
            throw new Error('Frontend origins must be valid origin URLs.');
        }

        if (
            parsed.origin !== origin.replace(/\/$/, '') ||
            parsed.username ||
            parsed.password ||
            parsed.pathname !== '/' ||
            parsed.search ||
            parsed.hash ||
            (requireHttps && parsed.protocol !== 'https:')
        ) {
            throw new Error('Frontend origins must be HTTPS origins without a path in production.');
        }

        return parsed.origin;
    }))];
}

export function isAllowedOrigin(origin, allowedOrigins) {
    return typeof origin === 'string' && allowedOrigins.includes(origin);
}

export function createOriginGuard(allowedOrigins) {
    return (req, res, next) => {
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            return next();
        }

        if (!isAllowedOrigin(req.get('Origin'), allowedOrigins)) {
            return res.status(403).json({ error: 'Request origin is not allowed.' });
        }

        return next();
    };
}

export function validateProductionEnvironment(env) {
    const errors = REQUIRED_PRODUCTION_ENV
        .filter((name) => !env[name]?.trim())
        .map((name) => `${name} is required in production.`);

    const jwtSecret = env.JWT_SECRET?.trim() || '';
    if (jwtSecret && Buffer.byteLength(jwtSecret, 'utf8') < 32) {
        errors.push('JWT_SECRET must contain at least 32 bytes in production.');
    }

    if (env.FRONTEND_ORIGINS?.trim()) {
        try {
            parseFrontendOrigins(env.FRONTEND_ORIGINS, { requireHttps: true });
        } catch (error) {
            errors.push(error.message);
        }
    }

    return errors;
}
