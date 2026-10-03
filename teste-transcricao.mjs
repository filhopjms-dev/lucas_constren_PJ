// O TESTE DA TRANSCRIÇÃO, de ida e volta.
//
//   node teste-transcricao.mjs
//
// Gera um áudio com uma frase CONHECIDA (pelo TTS da própria OpenAI), manda o
// nosso módulo transcrever, e compara. Se o texto volta igual, o caminho inteiro
// está provado: formato do arquivo, idioma, prazo e leitura da resposta.
//
// Testar transcrição sem áudio de verdade seria testar nada. E gravar um áudio à
// mão para cada rodada não escala -- gerar a fala resolve os dois problemas.
//
// Também exercita os caminhos de RECUSA, que são os que protegem o cliente:
// áudio vazio, pedido sem conteúdo, e chave ausente. Em todos, o certo é o
// módulo devolver ok:false para o Trilho manter o "[O cliente mandou um áudio]".

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(AQUI, ".env"), quiet: true });

const chave = (process.env.OPENAI_API_KEY || "").trim();
if (!chave) {
  console.error("\n  Não achei OPENAI_API_KEY no .env desta pasta.\n");
  process.exit(1);
}

const { transcrever } = await import("./transcrever.mjs");

const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const vermelho = (s) => `\x1b[31m${s}\x1b[0m`;
const cinza = (s) => `\x1b[90m${s}\x1b[0m`;

let falhas = 0;

// ── 1. FALA DE VERDADE, IDA E VOLTA ─────────────────────────────────────────
const falas = [
  "Oi, boa tarde. Eu vi o anúncio do Riviera e queria saber o valor do apartamento de cento e cinco metros.",
  "Tem andar alto disponível?",
];

console.log("\n1. FALA CONHECIDA, GERADA E TRANSCRITA DE VOLTA");
for (const frase of falas) {
  console.log(`\n  dito:  "${frase}"`);
  let bytes;
  try {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "tts-1", voice: "onyx", input: frase, response_format: "opus" }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) { console.log(`  ${vermelho("✗")} o TTS falhou (${r.status}), não deu para gerar o áudio`); falhas++; continue; }
    bytes = Buffer.from(await r.arrayBuffer());
  } catch (e) { console.log(`  ${vermelho("✗")} o TTS falhou: ${e.message}`); falhas++; continue; }

  const t0 = Date.now();
  const out = await transcrever({ audio: bytes.toString("base64"), mime: "audio/ogg", nome: "audio.ogg" }, chave);
  const s = ((Date.now() - t0) / 1000).toFixed(1);

  if (!out.ok) { console.log(`  ${vermelho("✗")} ${out.motivo}${out.detalhe ? " — " + out.detalhe : ""}`); falhas++; continue; }
  console.log(`  ouvi:  "${out.texto}"`);

  // Não exijo igualdade literal: o Whisper acerta o conteúdo mas pode trocar
  // pontuação, acento e número por extenso. O que importa é as palavras
  // significativas estarem lá.
  const palavras = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{4,}/g) ?? [];
  const esperadas = palavras(frase);
  const vieram = new Set(palavras(out.texto));
  const acertou = esperadas.filter((p) => vieram.has(p)).length;
  const taxa = esperadas.length ? acertou / esperadas.length : 0;

  console.log(cinza(`  ${(bytes.length / 1024).toFixed(0)} KB, ${s}s, ${acertou} de ${esperadas.length} palavras`));
  if (taxa >= 0.8) console.log(`  ${verde("✓")} a transcrição bate com o que foi dito`);
  else { console.log(`  ${vermelho("✗")} só ${(taxa * 100).toFixed(0)}% das palavras bateram`); falhas++; }
}

// ── 2. O QUE TEM DE SER RECUSADO ────────────────────────────────────────────
console.log("\n2. OS CAMINHOS DE RECUSA (aqui o certo é NÃO transcrever)");
const recusas = [
  ["áudio vazio", { audio: "" }, chave],
  ["pedido sem áudio nem url", {}, chave],
  ["sem chave da OpenAI", { audio: "AAAA" }, ""],
  ["áudio que não é áudio", { audio: Buffer.from("isto nao e audio nenhum").toString("base64"), mime: "audio/ogg" }, chave],
];
for (const [nome, corpo, k] of recusas) {
  const r = await transcrever(corpo, k);
  if (r.ok) { console.log(`  ${vermelho("✗")} ${nome}: PASSOU, e não devia — "${r.texto}"`); falhas++; }
  else console.log(`  ${verde("✓")} ${nome}: recusado — ${cinza(r.motivo)}`);
}

console.log("");
if (falhas === 0) console.log(`  ${verde("NADA FALHOU.")}\n`);
else { console.log(`  ${vermelho(`${falhas} falha(s).`)}\n`); process.exit(1); }
