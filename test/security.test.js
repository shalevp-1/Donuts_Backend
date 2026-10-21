import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { createAuthMiddleware } from '../authMiddleware.js';
import {
    createOriginGuard,
    isAllowedOrigin,
    LOCAL_FRONTEND_ORIGIN,
    parseFrontendOrigins,
    validateProductionEnvironment
} from '../securityConfig.js';

const testSecret = 'test-only-secret-that-is-at-least-32-bytes';

function responseRecorder() {
    return {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}

function createMiddlewareForUser(user) {
    const db = {
        query(_sql, _params, callback) {
            callback(null, user ? [user] : []);
        }
    };
    return createAuthMiddleware({ db, jwt, jwtSecret: testSecret });
}

test('rejects requests without an authentication cookie', () => {
    const middleware = createMiddlewareForUser({ id: 1, username: 'admin', role: 'admin' });
    const response = responseRecorder();

    middleware.verifyUser({ cookies: {} }, response, () => assert.fail('next should not run'));

    assert.equal(response.statusCode, 401);
});

test('authorizes admins using the current database role', async () => {
    const middleware = createMiddlewareForUser({ id: 1, username: 'admin', role: 'admin' });
    const token = jwt.sign({ id: 1, role: 'user' }, testSecret);
    const request = { cookies: { token } };
    const response = responseRecorder();

    await new Promise((resolve, reject) => {
        middleware.verifyUser(request, response, (error) => error ? reject(error) : resolve());
    });
    let nextCalled = false;
    middleware.verifyAdmin(request, response, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(request.role, 'admin');
});

test('rejects a demoted admin even when the token still claims admin', async () => {
    const middleware = createMiddlewareForUser({ id: 2, username: 'former-admin', role: 'user' });
    const token = jwt.sign({ id: 2, role: 'admin' }, testSecret);
    const request = { cookies: { token } };
    const response = responseRecorder();

    await new Promise((resolve, reject) => {
        middleware.verifyUser(request, response, (error) => error ? reject(error) : resolve());
    });
    middleware.verifyAdmin(request, response, () => assert.fail('demoted user must not pass'));

    assert.equal(response.statusCode, 403);
});

test('rejects a valid token after its user account has been deleted', async () => {
    const middleware = createMiddlewareForUser(null);
    const token = jwt.sign({ id: 3, role: 'admin' }, testSecret);
    const response = responseRecorder();
    const complete = new Promise((resolve) => {
        response.json = function (body) {
            this.body = body;
            resolve();
            return this;
        };
    });

    middleware.verifyUser({ cookies: { token } }, response, () => assert.fail('deleted user must not pass'));
    await complete;

    assert.equal(response.statusCode, 401);
});

test('requires JWT and database configuration in production without revealing values', () => {
    const errors = validateProductionEnvironment({
        MYSQL_HOST: 'db.example', MYSQL_USER: 'user', MYSQL_PASSWORD: 'password',
        MYSQL_DATABASE: 'donuts', MYSQL_PORT: '3306',
        FRONTEND_ORIGINS: 'https://dountstime.netlify.app'
    });

    assert.ok(errors.some((error) => error.startsWith('JWT_SECRET is required')));
    assert.ok(!errors.some((error) => error.includes('password')));

    const weakSecretErrors = validateProductionEnvironment({
        MYSQL_HOST: 'db.example', MYSQL_USER: 'user', MYSQL_PASSWORD: 'password',
        MYSQL_DATABASE: 'donuts', MYSQL_PORT: '3306', JWT_SECRET: 'short',
        FRONTEND_ORIGINS: 'https://dountstime.netlify.app'
    });
    assert.ok(weakSecretErrors.some((error) => error.startsWith('JWT_SECRET must contain')));
});

test('accepts only configured frontend origins and requires HTTPS origins in production', () => {
    const allowed = parseFrontendOrigins('https://dountstime.netlify.app', { requireHttps: true });

    assert.equal(isAllowedOrigin('https://dountstime.netlify.app', allowed), true);
    assert.equal(isAllowedOrigin('https://attacker.example', allowed), false);
    assert.throws(() => parseFrontendOrigins('http://dountstime.netlify.app', { requireHttps: true }));
});

test('blocks state-changing requests without an allowed Origin', () => {
    const guard = createOriginGuard(['https://dountstime.netlify.app']);
    const rejected = responseRecorder();
    let nextCalled = false;

    guard({ method: 'POST', get: () => 'https://attacker.example' }, rejected, () => { nextCalled = true; });

    assert.equal(rejected.statusCode, 403);
    assert.equal(nextCalled, false);
});

test('allows the default local CRA origin and blocks unapproved local origins', () => {
    const allowedOrigins = [LOCAL_FRONTEND_ORIGIN];
    const guard = createOriginGuard(allowedOrigins);
    let nextCalled = false;

    assert.equal(LOCAL_FRONTEND_ORIGIN, 'http://localhost:3000');
    guard({ method: 'POST', get: () => 'http://localhost:3000' }, responseRecorder(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(isAllowedOrigin('http://localhost:3007', allowedOrigins), false);
    assert.equal(isAllowedOrigin('http://localhost:3001', allowedOrigins), false);
});

test('allows state-changing requests from the configured frontend Origin', () => {
    const guard = createOriginGuard(['https://dountstime.netlify.app']);
    let nextCalled = false;

    guard({ method: 'POST', get: () => 'https://dountstime.netlify.app' }, responseRecorder(), () => { nextCalled = true; });

    assert.equal(nextCalled, true);
});
