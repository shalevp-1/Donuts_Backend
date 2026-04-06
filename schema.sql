CREATE TABLE IF NOT EXISTS donuts (
    id INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    ingredients TEXT NOT NULL,
    calories INT NOT NULL,
    image TEXT NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS login (
    id INT NOT NULL AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    points INT NOT NULL DEFAULT 0,
    purchase_count INT NOT NULL DEFAULT 0,
    total_spent DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY unique_username (username),
    UNIQUE KEY unique_email (email)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    item_count INT NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    service_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL,
    points_earned INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_purchase_orders_user_id (user_id)
);

CREATE TABLE IF NOT EXISTS purchase_items (
    id INT NOT NULL AUTO_INCREMENT,
    purchase_id INT NOT NULL,
    donut_id INT NOT NULL,
    quantity INT NOT NULL,
    price_each DECIMAL(10, 2) NOT NULL,
    line_total DECIMAL(10, 2) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_purchase_items_purchase_id (purchase_id),
    KEY idx_purchase_items_donut_id (donut_id)
);

-- Optional after registering your own account:
-- UPDATE login SET role = 'admin' WHERE email = 'you@example.com';
