// O CARTEIRO DE MENTIRA: faz exatamente o que o cerebro.ts do Trilho vai fazer.
//
//   node carteiro-de-teste.mjs "Oi, qual o valor do Riviera?"
//
// Existe para provar o PROTOCOLO de ida e volta antes de ele ir para produção.
// O laço aqui é cópia fiel do que está no Trilho: manda, recebe ou decisão ou
// pedido de ferramenta, executa, devolve o estado, repete. Se este script
// funciona, o carteiro de lá funciona.
//
// As ferramentas são as simuladas, com as capturas do espelho real, e no fim a
// resposta passa pela conferência de saída de verdade, lida do repositório do
// Trilho.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ENDERECO = process.env.LUCAS_URL || "http://127.0.0.1:4310/api/pensar";
const MAXIMO_DE_VOLTAS = 6;

const TOKEN = (fs.readFileSync(path.join(AQUI, ".env"), "utf8").match(/^LUCAS_TOKEN=(.+)$/m) ?? [])[1]?.trim();
if (!TOKEN) { console.error("Não achei LUCAS_TOKEN no .env."); process.exit(1); }

const { criarFerramentasDeTeste, conferirSaida } = await import("./ferramentas-de-teste.mjs");

const FUSO = "America/Maceio";
const agora = new Date();
const contexto = {
  agora: {
    iso: agora.toISOString(),
    porExtenso: agora.toLocaleString("pt-BR", { timeZone: FUSO, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    fuso: FUSO,
  },
  numero: { apelido: "Constren" },
  contato: { nome: null, nomeDoPerfil: null, telefone: null, faltaNome: true },
  lead: null,
  anuncio: null,
  historico: [],
  turnos: [{ role: "user", content: process.argv.slice(2).join(" ").trim() || "Oi, qual o valor do Riviera?" }],
  ultimaDoCliente: "",
};
contexto.ultimaDoCliente = contexto.turnos[0].content;

const ferramentas = criarFerramentasDeTeste();
const comeco = Date.now();
let estado = null;
let resultados;
let decisao = null;
let bytesDoEstado = 0;

console.log(`\n  Cliente: ${contexto.ultimaDoCliente}\n`);

for (let volta = 0; volta < MAXIMO_DE_VOLTAS; volta++) {
  const corpo = estado ? { estado, resultados } : { contexto, definicoes: ferramentas.definicoes };
  const enviado = JSON.stringify(corpo);
  if (estado) bytesDoEstado = Math.max(bytesDoEstado, enviado.length);

  const r = await fetch(ENDERECO, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: enviado,
    signal: AbortSignal.timeout(30_000),
  });

  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    console.error(`  ⚠️  o cérebro respondeu ${r.status}${j.erro ? `: ${j.erro}` : ""}`);
    process.exit(1);
  }

  const j = await r.json();
  if (j.uso) ferramentas.anotarUso(j.uso);

  if (j.decisao) { decisao = j.decisao; console.log(`  volta ${volta + 1}: decidiu`); break; }

  if (!Array.isArray(j.ferramentas) || !j.ferramentas.length) {
    console.error("  ⚠️  respondeu sem decisão e sem ferramenta");
    process.exit(1);
  }

  console.log(`  volta ${volta + 1}: pediu ${j.ferramentas.map((f) => f.nome).join(", ")}`);
  resultados = [];
  for (const f of j.ferramentas) resultados.push({ id: f.id, texto: await ferramentas.executar(f.nome, f.entrada) });
  estado = j.estado;
}

const segundos = ((Date.now() - comeco) / 1000).toFixed(1);

if (!decisao) {
  console.log(`\n  ⚠️  não chegou a uma decisão em ${MAXIMO_DE_VOLTAS} voltas\n`);
  process.exit(1);
}

console.log();
if (decisao.tipo === "responder") console.log(`  Lucas: ${decisao.mensagens.join("\n         ")}`);
else if (decisao.tipo === "transferir") {
  if (decisao.mensagemAoCliente) console.log(`  Lucas: ${decisao.mensagemAoCliente}`);
  console.log(`  ➜  TRANSFERIU: ${decisao.motivo}`);
} else console.log(`  ⏸  CALOU: ${decisao.motivo}`);

const conferencia = decisao.tipo === "responder"
  ? conferirSaida(decisao.mensagens, ferramentas.conhecidos)
  : decisao.tipo === "transferir" && decisao.mensagemAoCliente
    ? conferirSaida([decisao.mensagemAoCliente], ferramentas.conhecidos)
    : null;

if (conferencia) {
  console.log(conferencia.ok
    ? "\n  ✓ a conferência de saída deixa passar"
    : `\n  ⛔ A CONFERÊNCIA BARRARIA (${conferencia.regra}): ${conferencia.detalhe}`);
}

const u = ferramentas.usoAcumulado();
console.log(`\n  ${segundos}s · ${u ? `${u.tokensEntrada} entrada, ${u.tokensSaida} saída, ${u.tokensDeCacheLidos} de cache lido` : "sem uso"}`);
if (bytesDoEstado) console.log(`  maior estado que viajou: ${(bytesDoEstado / 1024).toFixed(1)} KB`);
console.log();
