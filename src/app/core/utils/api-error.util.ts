const ERROR_MAP: Record<string, string> = {
  'User not found': 'Usuário não encontrado. Verifique o e-mail informado.',
  'User is already a member': 'Este usuário já é membro do grupo.',
  'User already has a pending invitation': 'Este usuário já possui um convite pendente.',
  'Invitation not found': 'Convite não encontrado.',
  'Group not found': 'Grupo não encontrado.',
  'Only members can invite': 'Apenas membros podem convidar.',
};

export function translateApiError(message: string | undefined, fallback?: string): string {
  if (!message) return fallback ?? 'Ocorreu um erro. Tente novamente.';
  return ERROR_MAP[message] ?? message;
}