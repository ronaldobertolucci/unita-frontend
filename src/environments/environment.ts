declare global {
  interface Window {
    __env?: {
      apiUrl: string;
      production: boolean;
    };
  }
}

export const environment = {
  production: window.__env?.production ?? false,
  apiUrl: window.__env?.apiUrl ?? '/api',
};

// Garantir que é um módulo
export {};