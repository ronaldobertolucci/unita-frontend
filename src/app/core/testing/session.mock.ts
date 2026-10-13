export const syntheticSession = (id = 1) => ({ token: `synthetic-${id}`, type: 'Bearer' as const, expiresIn: 7200,
  user: { id, firstName: 'Nome', lastName: 'Sobrenome', email: `user${id}@example.com`, dateOfBirth: '1990-01-01', enabled: true, emailVerified: true, roles: ['USER'] } });
