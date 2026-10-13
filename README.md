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
