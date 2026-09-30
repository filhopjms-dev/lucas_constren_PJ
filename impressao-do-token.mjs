// A IMPRESSÃO DIGITAL DO TOKEN, para comparar os dois lados sem expor nenhum.
//
//   node impressao-do-token.mjs
//
// Imprime o TAMANHO e um resumo de doze caracteres. Dois tokens iguais dão a
// mesma impressão; dois diferentes dão impressões diferentes. Do resumo não se
// volta para o token.
//
// ⚠️ MEDE O QUE O PROCESSO CARREGA, E NÃO O QUE O ARQUIVO DIZ.
//
// A primeira versão deste script lia a linha do .env com uma expressão regular e
// imprimia aquilo. Está errado, e o Jânio achou: o serviço não usa o que está
// escrito no arquivo, usa o que o dotenv devolve depois de interpretar. Se o
// valor estiver entre aspas, o dotenv as remove e a regex não, e aí a impressão
// publicada nunca foi a do token em uso.
//
// Agora ele carrega pelo dotenv, igual ao servidor, e ainda compara as duas
// leituras: se o arquivo e o processo discordarem, isso aparece em vez de passar
// batido. Comparar maçã com maçã é o ponto inteiro de existir uma impressão.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const arquivo = process.argv[2] || path.join(AQUI, ".env");

const resumo = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 12);

// O que o PROCESSO vai ter: exatamente o caminho do servidor.
const carregado = dotenv.parse(fs.readFileSync(arquivo));
const doProcesso = (carregado.LUCAS_TOKEN ?? "").trim();
if (!doProcesso) { console.error(`Não achei LUCAS_TOKEN em ${arquivo}.`); process.exit(1); }

// O que o ARQUIVO diz, cru, sem interpretar nada.
const bruta = fs.readFileSync(arquivo, "utf8").match(/^LUCAS_TOKEN=(.*)$/m);
const doArquivo = (bruta?.[1] ?? "").trim();

console.log(`\n  arquivo   ${arquivo}`);
console.log(`  tamanho   ${doProcesso.length} caracteres`);
console.log(`  impressão ${resumo(doProcesso)}   <- esta é a que vale, é o que o serviço usa`);

if (doArquivo !== doProcesso) {
  console.log(`\n  ⚠️  A LINHA CRUA DO ARQUIVO É DIFERENTE do que o processo carrega.`);
  console.log(`      crua: ${doArquivo.length} caracteres, impressão ${resumo(doArquivo)}`);
  console.log(`      Tipicamente aspas em volta do valor, que o dotenv remove. Publique SEMPRE a de cima.`);
}
console.log();
