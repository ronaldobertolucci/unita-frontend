# UnitaFrontend

Este projeto foi criado usando [Angular CLI](https://github.com/angular/angular-cli) versão 19.2.19.

## Instale as dependências do projeto

```bash
npm install
```

## Servidor de desenvolvimento

Para desenvolvimento local, rode

```bash
ng serve
```

Uma vez que o servidor está rodando, abra o navegador e acesse `http://localhost:4200/`.

## Rodando com Docker

Primeiro, construa a imagem

```bash
docker build -t unita-frontend .
```

 Depois, rode o container com 

```bash
docker run -p 4200:4200 \
  -e API_URL=http://localhost:8080/api \
  -e PRODUCTION=true \
  unita-frontend
```
