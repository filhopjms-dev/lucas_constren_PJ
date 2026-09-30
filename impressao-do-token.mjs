// A IMPRESSÃO DIGITAL DO TOKEN, para comparar os dois lados sem expor nenhum.
//
//   node impressao-do-token.mjs
//
// Imprime o TAMANHO e um resumo de doze caracteres. Dois tokens iguais dão a
// mesma impressão; dois diferentes dão impressões diferentes. Do resumo não se
// volta para o token.
//
// Existe porque a alternativa é as duas pontas lerem o valor em voz alta para
// conferir, e token que se lê em voz alta deixa de ser segredo. E porque
// "confere se está igual" olhando 64 caracteres hexadecimais é como ninguém
// acha um caractere trocado no meio.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const arquivo = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".env");
const linha = fs.readFileSync(arquivo, "utf8").match(/^LUCAS_TOKEN=(.*)$/m);
if (!linha) { console.error(`Não achei LUCAS_TOKEN em ${arquivo}.`); process.exit(1); }

const resumo = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 12);
const bruto = linha[1];
const limpo = bruto.trim();

console.log(`\n  arquivo   ${arquivo}`);
console.log(`  tamanho   ${limpo.length} caracteres`);
console.log(`  impressão ${resumo(limpo)}`);
if (bruto !== limpo) {
  console.log(`\n  ⚠️  o valor tem ${bruto.length - limpo.length} caractere(s) de espaço ou quebra de linha na ponta.`);
}
console.log();
