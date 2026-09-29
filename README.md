# Lucas Tavares: o cérebro

O agente de IA que atende os clientes da Constren pelo WhatsApp, no Trilho.

O Trilho faz tudo o que não é pensar: decide quando o robô fala, junta as
mensagens seguidas, trava a conversa, oferece as ferramentas que leem o espelho
de vendas, confere a resposta antes de sair e a entrega pela central. **Este
serviço pensa.**

O `cerebro.ts`, lá dentro, é um carteiro: manda o contexto para cá e recebe uma
decisão. **O prompt e a base de conhecimento nunca saem daqui.**

---

## O que tem dentro

| Arquivo | O que é |
|---|---|
| `cerebro.mjs` | O laço, o prompt de sistema e as decisões. O miolo. |
| `servidor.mjs` | A tela de configuração e o endereço que o Trilho chama. |
| `publico/index.html` | A tela: prompt, base de conhecimento e teste de tom. |
| `ferramentas-de-teste.mjs` | As ferramentas do Trilho simuladas, para ensaiar sem tocar nele. |
| `ensaio.mjs` | O ensaio de linha de comando, com a conferência de saída de verdade. |
| `dados/` | **O que está no ar.** Não vai para o repositório. |

`dados/` e `.env` estão no `.gitignore`, e é isso que mantém o prompt e as
chaves fora do GitHub. Antes de qualquer `git add`, confira: `git status`.

---

## Como isso se conecta ao Trilho

```
cliente no WhatsApp
      ↓
central Evolution → Trilho (Vercel)
      ↓  POST /api/pensar, com o token
ESTE SERVIÇO → API da Anthropic
      ↓  decisão: responder, transferir ou calar
Trilho confere a resposta e entrega ao cliente
```

O Trilho não guarda conversa montada: ele devolve o estado opaco que veio daqui.

---

## Subir num servidor novo

Os comandos abaixo são para o VPS que já roda o CRM da Arcos. Cada passo é para
rodar um de cada vez, conferindo a saída antes de seguir.

### 1. O código

```bash
cd /root
git clone https://github.com/filhopjms-dev/lucas_constren_PJ.git lucas
cd lucas
npm install --omit=dev
```

### 2. Os segredos

```bash
cp .env.exemplo .env
nano .env
```

Preencha as quatro primeiras linhas. Para sortear as longas:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. O prompt e a base

Não vêm pelo git, de propósito. Sobem depois, **pela tela**, quando o serviço
estiver no ar. A pasta é criada sozinha:

```bash
mkdir -p dados/base
```

### 4. O processo

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs lucas --lines 20
```

Tem de aparecer `no ar em http://127.0.0.1:4310`.

### 5. O DNS

No painel da Hostinger, em Gerenciador de DNS, um registro **A** para
`lucas` apontando para o IP do VPS. Confira antes de seguir:

```bash
dig +short lucas.pjconsultoria.tech
```

### 6. O nginx e o certificado

```bash
cp deploy/nginx-lucas.conf /etc/nginx/sites-available/lucas
ln -sf /etc/nginx/sites-available/lucas /etc/nginx/sites-enabled/lucas
```

⚠️ O arquivo já aponta para um certificado que ainda não existe, então o nginx
recusaria recarregar. O certbot resolve os dois de uma vez:

```bash
certbot --nginx -d lucas.pjconsultoria.tech
nginx -t && systemctl reload nginx
```

### 7. Conferir

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://lucas.pjconsultoria.tech/
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://lucas.pjconsultoria.tech/api/pensar
```

A primeira responde **200** (a tela de entrada). A segunda responde **401**, e
isso é o certo: sem o token, o carteiro não atende.

---

## Atualizar depois

```bash
cd /root/lucas && git pull && npm install --omit=dev && pm2 restart lucas
```

`dados/` e `.env` não são tocados pelo `git pull`: o prompt e a base continuam
onde estavam.

---

## Em desenvolvimento

```bash
LUCAS_ENV=/caminho/para/um/.env/com/a/chave node servidor.mjs
node ensaio.mjs --roteiro roteiros/frente-mar.json
```

O `ensaio.mjs` roda a **conferência de saída de verdade**, lida do repositório
do Trilho por `LUCAS_TRILHO`. É ele que diz o que seria barrado em produção; o
teste da tela confere só o tom.
