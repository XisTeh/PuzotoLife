// Run the SAME financial assertions against the PostgreSQL engine and restricted role.
process.env.TEST_DATABASE_ENGINE = 'postgres';
await import('./investimentos.test.js');
