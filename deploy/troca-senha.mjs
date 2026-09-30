// TROCA A SENHA DA TELA DO LUCAS, e o segredo que assina o cookie junto.
//
//   cd /root/lucas && node deploy/troca-senha.mjs && pm2 restart lucas
//
// Roda NO SERVIDOR. Gera os valores aqui dentro, então nada de senha viaja por
// colagem no terminal -- que é o caminho onde a gente já perdeu caractere antes.
//
// POR QUE OS DOIS, E NÃO SÓ A SENHA:
//
// O cookie da sessão é assinado com o LUCAS_SEGREDO e só guarda a data de
// validade; a senha não entra nele. Então trocar só a senha NÃO derruba quem já
// está logado -- quem tiver uma aba aberta continua dentro até o cookie vencer.
// Quando a troca é porque a senha vazou, isso não serve: o objetivo é justamente
// fechar a porta para quem já entrou. Trocando o segredo, toda sessão viva morre.
//
// O QUE ELE NÃO TOCA: o LUCAS_TOKEN. Ele confere e imprime a impressão do token
// depois de gravar, para provar que mexer na senha não encostou no que o Trilho
// usa. Em 30/09/2026 um token trocado sem ninguém perceber custou meia hora.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO = process.argv[2] || path.join(AQUI, "..", ".env");

const resumo = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 12);
const parar = (msg) => { console.error(`\n  ⛔ ${msg}\n`); process.exit(1); };

if (!fs.existsSync(ARQUIVO)) parar(`Não achei ${ARQUIVO}.`);

const original = fs.readFileSync(ARQUIVO, "utf8");
const antes = dotenv.parse(original);

for (const chave of ["LUCAS_SENHA", "LUCAS_SEGREDO"]) {
  if (!new RegExp(`^${chave}=`, "m").test(original)) {
    parar(`Não achei a linha ${chave} em ${ARQUIVO}. Nada foi mudado.`);
  }
}

// A cópia vem ANTES de qualquer escrita, e o nome diz a hora.
const copia = `${ARQUIVO}.antes-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
fs.writeFileSync(copia, original);

const senha = crypto.randomBytes(9).toString("base64url");
const segredo = crypto.randomBytes(32).toString("hex");

const novo = original
  .replace(/^LUCAS_SENHA=.*$/m, `LUCAS_SENHA=${senha}`)
  .replace(/^LUCAS_SEGREDO=.*$/m, `LUCAS_SEGREDO=${segredo}`);
fs.writeFileSync(ARQUIVO, novo);

// Confere lendo do disco pelo MESMO caminho do servidor, e não pelo que a gente
// acha que escreveu.
const depois = dotenv.parse(fs.readFileSync(ARQUIVO));
if (depois.LUCAS_SENHA !== senha || depois.LUCAS_SEGREDO !== segredo) {
  parar(`A troca não pegou. Volte com:  cp ${copia} ${ARQUIVO}`);
}
if (depois.LUCAS_TOKEN !== antes.LUCAS_TOKEN) {
  parar(`O TOKEN MUDOU, e não devia. Volte agora com:  cp ${copia} ${ARQUIVO}`);
}

console.log(`\n  cópia de segurança   ${copia}`);
console.log(`  token intacto        impressão ${resumo((depois.LUCAS_TOKEN ?? "").trim())}`);
console.log(`\n  NOVA SENHA DA TELA   ${senha}`);
console.log(`\n  Guarde agora, ela não aparece de novo. Depois rode: clear\n`);
