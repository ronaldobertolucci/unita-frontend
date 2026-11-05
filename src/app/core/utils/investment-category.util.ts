/** Opt-in capabilities: a new category must define its own operation semantics. */
export function supportsInvestmentOperations(category: unknown): boolean {
  switch (category) {
    case 'RENDA_FIXA':
    case 'PREVIDENCIA': return true;
    default: return false;
  }
}
