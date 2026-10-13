# Unita frontend

Interface web do Unita. Este projeto depende do backend [unita-api](https://github.com/ronaldobertolucci/unita-api).

## Como rodar

Inicie o `unita-api` em `http://localhost:8080`, seguindo as instruções do seu repositório.

Depois, na pasta deste projeto:

```bash
npm ci
npm start
```

Acesse [http://localhost:4200](http://localhost:4200).

## Como rodar os testes

Execute todos os testes:

```bash
npm test
```

Para acompanhar alterações:

```bash
npm run test:watch
```

Para gerar o relatório de cobertura:

```bash
npm run test:coverage
```

## Build Docker

```bash
docker build -t unita-frontend:local .
```

O build usa BuildKit e instala as dependências uma vez com `npm ci`, incluindo
as ferramentas necessárias para compilar Angular. A camada de instalação copia
apenas `package.json` e `package-lock.json`, por isso alterações no código não
reinstalam as dependências. A auditoria do npm deve ser executada separadamente,
fora do build da imagem.

Somente `angular.json`, `tsconfig.json`, `tsconfig.app.json`, `src/` e `public/`
entram na compilação. Alterações no README, nas ferramentas locais ou nos
arquivos de inicialização do Nginx não recompilam Angular.

Os caches de downloads do npm e de compilação do Angular persistem no mesmo
builder Docker e não entram na imagem final. Um builder novo começa sem esses
caches; limpar o cache do builder também elimina esse benefício. A imagem final
continua contendo Nginx e os arquivos compilados, com configuração da API na
inicialização por `API_UPSTREAM`, `API_URL` e `PRODUCTION`.
