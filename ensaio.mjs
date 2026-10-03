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
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

// DE QUAL CONTA ESTE ENSAIO GASTA, e por que a ordem importa.
//
// ⚠️ Em 30/09/2026 o ensaio derrubou o Paulo André. Ele lia direto o .env do CRM
// da Arcos, "para não haver uma segunda cópia da chave na máquina de ninguém" --
// e o preço dessa economia foi ensaiar o Lucas gastando da conta que mantém o
// agente da Arcos atendendo cliente. Umas 55 chamadas num dia zeraram o saldo, e
// o crédito na Anthropic é da ORGANIZAÇÃO: saldo zerado derruba toda chave dela.
// O Paulo André ficou mudo em produção, sem erro visível para ninguém.
//
// Agora a chave do Lucas vem PRIMEIRO, do .env daqui. A do CRM é só o último
// recurso, e quando ela entra o aviso é barulhento: testar não pode ter o poder
// de derrubar o que está atendendo.
dotenv.config({ path: path.join(AQUI, ".env"), quiet: true });
let deOndeVeioAChave = "o .env do Lucas (conta Vapor)";

if (!process.env.ANTHROPIC_API_KEY) {
  dotenv.config({ path: process.env.LUCAS_ENV || "C:/Users/paulo/arcos-crm/.env", quiet: true });
  deOndeVeioAChave = "⚠️  O .ENV DO CRM DA ARCOS -- ESTE ENSAIO VAI GASTAR DA CONTA DO PAULO ANDRÉ";
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Não achei a ANTHROPIC_API_KEY. Ponha uma no .env daqui, ou aponte com LUCAS_ENV=caminho/para/.env");
  process.exit(1);
}

// QUAL chave, dita em voz alta. Impressão, nunca o valor. A lição do token de
// 30/09/2026: o que não se mede em voz alta se desencontra em silêncio.
{
  const c = await import("node:crypto");
  const imp = c.createHash("sha256").update(process.env.ANTHROPIC_API_KEY.trim()).digest("hex").slice(0, 12);
  console.log(`\n  chave ${imp} · ${deOndeVeioAChave}`);
}

const { criarFerramentasDeTeste, conferirSaida } = await import("./ferramentas-de-teste.mjs");
const { pensar, MODELO, ARQUIVO_DO_PROMPT } = await import("./cerebro.mjs");

// ⚠️ O ENSAIO LÊ dados/prompt.txt, E NÃO A VERSÃO GUARDADA NA PASTA DE CIMA.
//
// A separação é certa (a versão numerada é arquivo morto, o que vale é o que
// está no ar), mas ela tem um jeito silencioso de morder: editar a versão
// guardada, rodar o ensaio, e medir o prompt ANTIGO achando que mediu o novo.
// Aconteceu em 30/09/2026, e a variação que apareceu foi acaso, não conserto.
//
// Aqui o aviso é barulhento de propósito. Ele compara as datas, não o conteúdo:
// arquivo guardado mais novo que o que está no ar quer dizer que alguém editou
// um e esqueceu o outro.
//
// ⚠️ E ELE COMPARA O CONTEÚDO, NÃO SÓ A DATA.
//
// A primeira versão olhava só o mtime, e gritava toda vez que uma versão nova era
// criada — porque criar a vN é copiar o dados/prompt.txt, e a cópia nasce com data
// mais nova que o original. Mesmo conteúdo, alarme disparado. Em 02/10/2026 ele
// gritou depois do v5, sem ter nada errado.
//
// Alarme que dispara à toa é alarme que se ignora quando importa. Agora, data mais
// nova só vira aviso se o texto for MESMO diferente.
{
  const mesmaCoisa = (a, b) =>
    crypto.createHash("sha256").update(fs.readFileSync(a)).digest("hex") ===
    crypto.createHash("sha256").update(fs.readFileSync(b)).digest("hex");
  const guardados = fs.readdirSync(path.resolve(AQUI, ".."))
    .filter((f) => /^PROMPT_.*\.txt$/i.test(f))
    .map((f) => path.join(path.resolve(AQUI, ".."), f));
  const noAr = fs.statSync(ARQUIVO_DO_PROMPT).mtimeMs;
  const maisNovo = guardados.filter(
    (f) => fs.statSync(f).mtimeMs > noAr + 1000 && !mesmaCoisa(f, ARQUIVO_DO_PROMPT),
  );
  if (maisNovo.length) {
    console.log(`\n  ⚠️  ATENÇÃO: ${maisNovo.map((f) => path.basename(f)).join(", ")} está mais novo que dados/prompt.txt.`);
    console.log("      O ensaio vai medir o prompt QUE ESTÁ NO AR, não o que você acabou de editar.");
    console.log("      Se a intenção era testar a edição, copie para dados/prompt.txt antes.\n");
  }
}

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

  return { decisao, conferencia, chamadas: ferramentas.chamadas };
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
    if (r.decisao.tipo === "responder") {
      // O ARQUIVO QUE SAIU TEM DE APARECER NO HISTÓRICO, senão o ensaio mente.
      //
      // No Trilho, o material enviado vira uma linha do robô na conversa,
      // "[Foi enviado um documento]", pelo mesmo caminho de qualquer mídia. Sem
      // isso aqui, o Lucas chega na mensagem seguinte sem nenhum sinal de que o
      // arquivo saiu, e manda de novo -- e eu ia culpar o prompt por um defeito
      // que era meu. Em 30/09/2026 quase aconteceu.
      const mandou = r.chamadas?.some((c) => c.nome === "enviar_material" && /vai ser mandado ao cliente/.test(c.resposta ?? ""));
      const texto = r.decisao.mensagens.join("\n") + (mandou ? "\n[Foi enviado um documento]" : "");
      turnos.push({ role: "assistant", content: texto });
    }
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
