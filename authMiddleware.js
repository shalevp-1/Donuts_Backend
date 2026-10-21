export function createAuthMiddleware({ db, jwt, jwtSecret }) {
    const verifyUser = (req, res, next) => {
        const token = req.cookies?.token;
        if (!token) {
            return res.status(401).json({ error: 'You are not authenticated.' });
        }

        jwt.verify(token, jwtSecret, (tokenError, decoded) => {
            if (tokenError || !decoded?.id) {
                return res.status(401).json({ error: 'Your session is no longer valid.' });
            }

            const query = 'SELECT id, username, role FROM login WHERE id = ? LIMIT 1';
            db.query(query, [decoded.id], (dbError, rows) => {
                if (dbError) {
                    return res.status(503).json({ error: 'Authentication could not be verified right now.' });
                }

                const user = rows?.[0];
                if (!user) {
                    return res.status(401).json({ error: 'Your session is no longer valid.' });
                }

                req.userId = user.id;
                req.name = user.username || decoded.name || '';
                req.role = user.role || 'user';
                return next();
            });
        });
    };

    const verifyAdmin = (req, res, next) => {
        if (req.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required.' });
        }
        return next();
    };

    return { verifyUser, verifyAdmin };
}
