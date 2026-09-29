// O ENSAIO DO LUCAS, na máquina do Paulo, sem tocar no Trilho.
//
//   node ensaio.mjs "Oi, vi o anúncio do Riviera. Qual o valor?"
//   node ensaio.mjs --roteiro roteiros/preco-primeira-mensagem.json
//
// Roda o cérebro de verdade, com as definições de ferramenta lidas do código do
// Trilho e as respostas capturadas do espelho de vendas real. Depois passa a
// resposta pela MESMA conferência de saída que vai barrar lá (`saida.ts`), que é
// o ponto: descobrir aqui o que seria barrado em produção.
//
// Nada é enviado a ninguém e nada é gravado em lugar nenhum.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

// A chave é a do Paulo, que já vive no .env do CRM da Arcos. Nunca é impressa.
dotenv.config({ path: process.env.LUCAS_ENV || "C:/Users/paulo/arcos-crm/.env", quiet: true });
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Não achei a ANTHROPIC_API_KEY. Aponte o .env com LUCAS_ENV=caminho/para/.env");
  process.exit(1);
}

const { criarFerramentasDeTeste, conferirSaida } = await import("./ferramentas-de-teste.mjs");
const { pensar, MODELO } = await import("./cerebro.mjs");

const FUSO = "America/Maceio";

function agora() {
  const d = new Date();
  const porExtenso = d.toLocaleString("pt-BR", {
    timeZone: FUSO, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return { iso: d.toISOString(), porExtenso, fuso: FUSO };
}

function contextoDe(turnos, lead = null, contato = {}) {
  const ultima = [...turnos].reverse().find((t) => t.role === "user")?.content ?? "";
  return {
    agora: agora(),
    numero: { apelido: "Constren" },
    contato: { nome: null, nomeDoPerfil: null, telefone: null, faltaNome: true, ...contato },
    lead,
    anuncio: null,
    historico: [],
    turnos,
    ultimaDoCliente: ultima,
  };
}

const cinza = (s) => `\x1b[90m${s}\x1b[0m`;
const negrito = (s) => `\x1b[1m${s}\x1b[0m`;

async function umaRodada(turnos, lead, contato) {
  const ferramentas = criarFerramentasDeTeste();
  const contexto = contextoDe(turnos, lead, contato);
  const comeco = Date.now();
  let decisao, erro = null;
  try {
    decisao = await pensar(contexto, ferramentas, AbortSignal.timeout(25_000));
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }
  const segundos = ((Date.now() - comeco) / 1000).toFixed(1);

  if (erro) { console.log(`\n  ⚠️  o cérebro falhou: ${erro}`); return null; }

  for (const c of ferramentas.chamadas) {
    console.log(cinza(`  ⚙  ${c.nome}${c.entrada && Object.keys(c.entrada).length ? " " + JSON.stringify(c.entrada) : ""}`));
  }

  let conferencia = null;
  if (decisao.tipo === "responder") conferencia = conferirSaida(decisao.mensagens, ferramentas.conhecidos);
  else if (decisao.tipo === "transferir" && decisao.mensagemAoCliente) conferencia = conferirSaida([decisao.mensagemAoCliente], ferramentas.conhecidos);

  if (decisao.tipo === "responder") {
    console.log(`\n  ${negrito("Lucas:")} ${decisao.mensagens.join("\n         ")}`);
  } else if (decisao.tipo === "transferir") {
    if (decisao.mensagemAoCliente) console.log(`\n  ${negrito("Lucas:")} ${decisao.mensagemAoCliente}`);
    console.log(`  ➜  TRANSFERIU: ${decisao.motivo}`);
  } else {
    console.log(`\n  ⏸  CALOU: ${decisao.motivo}`);
  }

  if (conferencia && !conferencia.ok) {
    console.log(`\n  ⛔ ${negrito("A CONFERÊNCIA BARRARIA ISSO")} (${conferencia.regra})`);
    console.log(`     ${conferencia.detalhe}`);
    console.log(`     Em produção, esta conversa iria para a equipe.`);
  } else if (conferencia) {
    console.log(cinza("  ✓ a conferência deixa passar"));
  }

  const u = ferramentas.usoAcumulado();
  console.log(cinza(`  ${segundos}s · ${u ? `${u.tokensEntrada} entrada, ${u.tokensSaida} saída, ${u.tokensDeCacheLidos} de cache lido` : "sem uso anotado"} · ${MODELO}`));

  return { decisao, conferencia };
}

// ---------------------------------------------------------------- a partida

const args = process.argv.slice(2);
const iRoteiro = args.indexOf("--roteiro");

if (iRoteiro >= 0) {
  const arquivo = args[iRoteiro + 1];
  const roteiro = JSON.parse(fs.readFileSync(path.isAbsolute(arquivo) ? arquivo : path.join(AQUI, arquivo), "utf8"));
  console.log(`\n${negrito(roteiro.nome ?? arquivo)}`);
  if (roteiro.porque) console.log(cinza(roteiro.porque));

  const turnos = [];
  let barradas = 0;
  for (const fala of roteiro.cliente) {
    console.log(`\n  ${negrito("Cliente:")} ${fala}`);
    turnos.push({ role: "user", content: fala });
    const r = await umaRodada(turnos, roteiro.lead ?? null, roteiro.contato ?? {});
    if (!r) break;
    if (r.conferencia && !r.conferencia.ok) barradas++;
    if (r.decisao.tipo === "responder") turnos.push({ role: "assistant", content: r.decisao.mensagens.join("\n") });
    else if (r.decisao.tipo === "transferir") { if (r.decisao.mensagemAoCliente) turnos.push({ role: "assistant", content: r.decisao.mensagemAoCliente }); break; }
    else break;
  }
  console.log(`\n${barradas ? `⛔ ${barradas} resposta(s) seriam barradas.` : "✓ nenhuma resposta seria barrada."}\n`);
} else {
  const mensagem = args.join(" ").trim();
  if (!mensagem) {
    console.error('Diga a mensagem do cliente: node ensaio.mjs "Qual o valor do Riviera?"');
    process.exit(1);
  }
  console.log(`\n  ${negrito("Cliente:")} ${mensagem}`);
  await umaRodada([{ role: "user", content: mensagem }], null, {});
  console.log();
}
