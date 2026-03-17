const ERROR_MAP: Record<string, string> = {
  'User not found': 'Usuário não encontrado. Verifique o e-mail informado.',
  'User is already a member': 'Este usuário já é membro do grupo.',
  'User already has a pending invitation': 'Este usuário já possui um convite pendente.',
  'Invitation not found': 'Convite não encontrado.',
  'Group not found': 'Grupo não encontrado.',
  'Only members can invite': 'Apenas membros podem convidar.',
  'Legal entity is in use and cannot be deleted': 'Esta empresa está em uso e não pode ser excluída.',
  'Employer is in use and cannot be deleted': 'Este empregador está em uso e não pode ser excluído.',
  'An employer for this legal entity already exists': 'Já existe um empregador cadastrado para esta empresa.',
  'A legal entity with this CNPJ already exists': 'Já existe uma empresa cadastrada com este CNPJ.',
  'An employer with this CPF already exists': 'Já existe um empregador cadastrado com este CPF.',
};

export function translateApiError(message: string | undefined, fallback?: string): string {
  if (!message) return fallback ?? 'Ocorreu um erro. Tente novamente.';
  return ERROR_MAP[message] ?? message;
}