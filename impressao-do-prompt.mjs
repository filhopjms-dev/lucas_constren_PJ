// A IMPRESSÃO DO PROMPT, para saber se o servidor está com a versão de agora.
//
//   node impressao-do-prompt.mjs
//
// O prompt do Lucas vive em TRÊS lugares:
//
//   1. PROMPT_LUCAS_TAVARES_vN_Trilho_Constren.txt, na pasta de cima -- a versão
//      guardada, que é o histórico
//   2. cerebro/dados/prompt.txt -- o que o ensaio lê aqui na máquina
//   3. o servidor, em /root/lucas/dados/prompt.txt -- o que atende cliente
//
// O ensaio já avisa quando 1 e 2 se desencontram, comparando as datas. O que
// faltava era saber do 3, e o 3 é o único que conversa com gente.
//
// Aqui sai a impressão de 1 e 2. A do 3 aparece no canto de cima da tela do
// Lucas, ao lado do modelo. As três têm que ser a mesma coisa.
//
// Por que impressão e não o texto: comparar 28 mil caracteres a olho não se faz,
// e "eu subi, acho" não é conferência. Doze caracteres se comparam num relance.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PASTA_DE_CIMA = path.resolve(AQUI, "..");

const resumo = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 12);

const noAr = path.join(AQUI, "dados", "prompt.txt");
if (!fs.existsSync(noAr)) { console.error(`\n  Não achei ${noAr}.\n`); process.exit(1); }

const texto = fs.readFileSync(noAr, "utf8");
const impressao = resumo(texto);

console.log(`\n  dados/prompt.txt     ${texto.length.toLocaleString("pt-BR")} caracteres   impressão ${impressao}`);

// As versões guardadas na pasta de cima, da mais nova para a mais velha.
const guardados = fs.readdirSync(PASTA_DE_CIMA)
  .filter((f) => /^PROMPT_.*\.txt$/i.test(f))
  .map((f) => ({ nome: f, caminho: path.join(PASTA_DE_CIMA, f) }))
  .sort((a, b) => fs.statSync(b.caminho).mtimeMs - fs.statSync(a.caminho).mtimeMs);

for (const g of guardados) {
  const t = fs.readFileSync(g.caminho, "utf8");
  const r = resumo(t);
  const marca = r === impressao ? "  <- é esta" : "";
  console.log(`  ${g.nome.padEnd(20)} ${t.length.toLocaleString("pt-BR")} caracteres   impressão ${r}${marca}`);
}

if (guardados.length && !guardados.some((g) => resumo(fs.readFileSync(g.caminho, "utf8")) === impressao)) {
  console.log(`\n  ⚠️  NENHUMA VERSÃO GUARDADA BATE com o dados/prompt.txt.`);
  console.log(`      Ou a edição ainda não virou versão, ou alguém editou um e esqueceu o outro.`);
}

console.log(`\n  Na tela do Lucas, no canto de cima, tem que aparecer:  prompt ${impressao}`);
console.log(`  Se aparecer outra coisa, o servidor está com uma versão antiga.\n`);
