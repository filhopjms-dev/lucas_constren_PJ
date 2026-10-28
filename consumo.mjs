// LÊ O LIVRO DE CONSUMO e diz onde o dinheiro está.
//
//   node consumo.mjs            os últimos 7 dias
//   node consumo.mjs 30         os últimos 30 dias
//   node consumo.mjs 30 tudo    idem, mais a lista das conversas mais caras
//
// Nada aqui escreve: é só leitura do dados/consumo.jsonl.
import fs from "node:fs";
import { ARQUIVO } from "./livro-de-consumo.mjs";

// ⚠️ PREÇO ENVELHECE, E ENVELHECE CALADO. Estes são os do claude-sonnet-5-5 em
// 28/10/2026, em dólar por MILHÃO de tokens, conferidos na documentação da
// Anthropic e não de memória -- eu tinha 0,10 na cabeça para leitura de cache e
// o valor certo é 0,20, o dobro, na linha que responde pela maior parte do
// volume. Ao trocar de modelo, trocar isto junto, senão o relatório continua
// dando um número bonito e errado.
const PRECO = { entrada: 2.0, saida: 10.0, cache_escrito: 2.5, cache_lido: 0.2 };

const custoDa = (l) =>
  (l.entrada * PRECO.entrada +
    l.saida * PRECO.saida +
    l.cache_escrito * PRECO.cache_escrito +
    l.cache_lido * PRECO.cache_lido) /
  1_000_000;

const dinheiro = (v) => `US$ ${v.toFixed(4)}`;
const ladrilho = (n, largura) => String(n).padStart(largura);

const dias = Number(process.argv[2] || 7);
const tudo = process.argv[3] === "tudo";

if (!fs.existsSync(ARQUIVO)) {
  console.log(`\n  Ainda não há consumo anotado (${ARQUIVO}).`);
  console.log(`  O arquivo nasce na primeira chamada depois do deploy.\n`);
  process.exit(0);
}

const corte = new Date(Date.now() - dias * 86_400_000).toISOString();
const linhas = fs
  .readFileSync(ARQUIVO, "utf8")
  .split("\n")
  .filter(Boolean)
  // Linha quebrada não derruba o relatório: o arquivo é de acrescentar e a
  // última pode ter sido cortada por uma queda no meio da escrita.
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter((l) => l && l.quando >= corte);

if (!linhas.length) {
  console.log(`\n  Nenhuma chamada nos últimos ${dias} dias.\n`);
  process.exit(0);
}

const soma = (ls, campo) => ls.reduce((t, l) => t + (l[campo] ?? 0), 0);
const custo = (ls) => ls.reduce((t, l) => t + custoDa(l), 0);
const rodadas = (ls) => ls.filter((l) => l.volta === 1).length;

const porDia = new Map();
for (const l of linhas) {
  const dia = l.quando.slice(0, 10);
  if (!porDia.has(dia)) porDia.set(dia, []);
  porDia.get(dia).push(l);
}

console.log(`\n  CONSUMO DO LUCAS, últimos ${dias} dias  (horas em UTC)\n`);
console.log("  dia          rodadas  chamadas      custo   atendimento   ensaio");
console.log("  ----------------------------------------------------------------");
for (const [dia, ls] of [...porDia.entries()].sort()) {
  const atend = ls.filter((l) => l.origem === "carteiro");
  const ens = ls.filter((l) => l.origem === "ensaio");
  console.log(
    `  ${dia}  ${ladrilho(rodadas(ls), 7)}  ${ladrilho(ls.length, 8)}  ` +
      `${ladrilho(dinheiro(custo(ls)), 9)}  ${ladrilho(dinheiro(custo(atend)), 12)}  ${ladrilho(dinheiro(custo(ens)), 7)}`,
  );
}

const atendimento = linhas.filter((l) => l.origem === "carteiro");
const conversas = new Set(atendimento.map((l) => l.conversa).filter(Boolean));

console.log("\n  ONDE O DINHEIRO ESTÁ\n");
for (const campo of ["cache_escrito", "cache_lido", "entrada", "saida"]) {
  const tokens = soma(linhas, campo);
  const c = (tokens * PRECO[campo]) / 1_000_000;
  const fatia = custo(linhas) ? ((c / custo(linhas)) * 100).toFixed(0) : "0";
  console.log(`  ${campo.padEnd(14)} ${ladrilho(tokens.toLocaleString("pt-BR"), 12)} tokens   ${ladrilho(dinheiro(c), 10)}   ${ladrilho(fatia, 3)}%`);
}

console.log(`\n  ATENDIMENTO DE VERDADE: ${rodadas(atendimento)} rodadas em ${conversas.size} conversas, ${dinheiro(custo(atendimento))}`);
if (conversas.size) console.log(`  Custo médio por conversa: ${dinheiro(custo(atendimento) / conversas.size)}`);
console.log(`  Teste nosso: ${dinheiro(custo(linhas.filter((l) => l.origem === "ensaio")))}\n`);

if (tudo && conversas.size) {
  const porConversa = [...conversas]
    .map((c) => ({ c, ls: atendimento.filter((l) => l.conversa === c) }))
    .map(({ c, ls }) => ({ c, voltas: ls.length, custo: custo(ls) }))
    .sort((a, b) => b.custo - a.custo);
  console.log("  AS CONVERSAS MAIS CARAS\n");
  for (const { c, voltas, custo: v } of porConversa.slice(0, 15)) {
    console.log(`  ${c}  ${ladrilho(voltas, 3)} chamadas   ${ladrilho(dinheiro(v), 10)}`);
  }
  console.log("");
}
