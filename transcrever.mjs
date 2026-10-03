// A TRANSCRIÇÃO DE ÁUDIO DO LUCAS.
//
// O cliente manda um áudio no WhatsApp e o Lucas não ouve: a API da Anthropic
// recebe texto, imagem e PDF, e não tem entrada de áudio (conferido na
// documentação em 30/09/2026). Sem transcrever, o robô só pode pedir para a
// pessoa repetir digitando -- e quem manda áudio é justamente quem não vai parar
// para digitar.
//
// ONDE ISTO RODA, E POR QUE IMPORTA: na ENTRADA da mensagem, antes da rodada
// começar, e não durante. A rodada tem 25 segundos para pensar e já é apertada;
// pôr uma ida à OpenAI lá dentro comeria o orçamento que a gente está justamente
// tentando economizar.
//
// SE FALHAR, NÃO QUEBRA NADA. Devolve ok:false e o Trilho mantém o aviso
// "[O cliente mandou um áudio]", que é exatamente o comportamento de hoje. O robô
// pede para repetir em texto e a conversa segue. Nada fica pior do que já era.

import crypto from "node:crypto";

const MODELO = "whisper-1";
const LIMITE_BYTES = 20 * 1024 * 1024;  // a OpenAI aceita até 25 MB; sobra folga
const PRAZO_MS = 20_000;

// ─── AS ALUCINAÇÕES CONHECIDAS DO WHISPER EM PORTUGUÊS ────────────────────────
//
// Em áudio mudo, com só ruído, ou cortado, o Whisper não devolve vazio: ele
// devolve frases que aprendeu de legenda de vídeo. Estas são as que aparecem,
// e elas chegariam ao Lucas como se o cliente as tivesse dito -- e ele
// responderia a uma coisa que ninguém falou.
//
// Barrar aqui é melhor do que no prompt: o prompt teria de adivinhar que a frase
// é falsa, e não tem como. Aqui a gente sabe.
const ALUCINACOES = [
  /legendas?\s+(pela|por)\s+comunidade/i,
  /amara\.org/i,
  /obrigad[oa]\s+por\s+assistir/i,
  /inscreva-se\s+no\s+canal/i,
  /^\s*legendas?\s*$/i,
  /^\s*sub(títulos|titles)/i,
  /^\s*tchau\s*[.!]?\s*$/i,
];

const pareceAlucinacao = (t) => ALUCINACOES.some((r) => r.test(t));

/**
 * Transcreve um áudio.
 *
 * Recebe OU um endereço temporário (`url`), que é o caminho mais leve porque o
 * Trilho já guarda a mídia e sabe assinar endereço de curta duração, OU os bytes
 * em base64, para o caso de não haver endereço à mão.
 *
 * Devolve sempre um objeto, nunca lança: quem chama está no caminho da mensagem
 * do cliente e não pode quebrar por causa disto.
 */
export async function transcrever({ url, audio, mime, nome }, chave) {
  if (!chave) return { ok: false, motivo: "sem OPENAI_API_KEY no servidor" };

  // ── os bytes ────────────────────────────────────────────────────────────────
  let bytes;
  try {
    if (url) {
      const r = await fetch(url, { signal: AbortSignal.timeout(PRAZO_MS), redirect: "error" });
      if (!r.ok) return { ok: false, motivo: `não consegui baixar o áudio (HTTP ${r.status})` };
      bytes = Buffer.from(await r.arrayBuffer());
    } else if (audio) {
      bytes = Buffer.from(String(audio), "base64");
    } else {
      return { ok: false, motivo: "não veio nem url nem audio" };
    }
  } catch (e) {
    return { ok: false, motivo: `falha ao obter o áudio: ${e.message}` };
  }

  if (!bytes.length) return { ok: false, motivo: "o áudio veio vazio" };
  if (bytes.length > LIMITE_BYTES) {
    return { ok: false, motivo: `áudio de ${(bytes.length / 1048576).toFixed(1)} MB, acima do limite de 20 MB` };
  }

  // ── a chamada ───────────────────────────────────────────────────────────────
  //
  // O nome do arquivo IMPORTA: a OpenAI escolhe o decodificador pela extensão, e
  // áudio de WhatsApp é opus dentro de ogg. Sem extensão, ela recusa o arquivo.
  const nomeDoArquivo = nome && /\.[a-z0-9]{2,5}$/i.test(nome)
    ? nome
    : (mime && /opus|ogg/i.test(mime) ? "audio.ogg"
      : mime && /mp4|m4a|aac/i.test(mime) ? "audio.m4a"
      : mime && /mpeg|mp3/i.test(mime) ? "audio.mp3"
      : "audio.ogg");

  const forma = new FormData();
  forma.append("file", new Blob([bytes], { type: mime || "audio/ogg" }), nomeDoArquivo);
  forma.append("model", MODELO);
  // O idioma declarado evita o Whisper "adivinhar" inglês num áudio curto e
  // devolver tradução no lugar da transcrição.
  forma.append("language", "pt");
  forma.append("response_format", "text");

  let texto;
  try {
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}` },
      body: forma,
      signal: AbortSignal.timeout(PRAZO_MS),
    });
    const corpo = await r.text();
    if (!r.ok) return { ok: false, motivo: `a OpenAI respondeu ${r.status}`, detalhe: corpo.slice(0, 300) };
    texto = corpo.trim();
  } catch (e) {
    const prazo = e.name === "TimeoutError" || e.name === "AbortError";
    return { ok: false, motivo: prazo ? "a transcrição passou de 20 segundos" : `falha na OpenAI: ${e.message}` };
  }

  // ── o que não pode passar ───────────────────────────────────────────────────
  if (!texto) return { ok: false, motivo: "a transcrição voltou vazia" };
  if (pareceAlucinacao(texto)) {
    return { ok: false, motivo: "a transcrição parece alucinação de áudio mudo", detalhe: texto.slice(0, 120) };
  }

  return {
    ok: true,
    texto,
    bytes: bytes.length,
    impressao: crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 12),
  };
}
