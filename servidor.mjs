// O SERVIÇO DO LUCAS: a tela de configuração e o endereço que o Trilho chama.
//
// Duas portas, com trancas diferentes:
//   /api/pensar   o carteiro do Trilho, autenticado por token combinado
//   /             a tela de configuração, autenticada por senha
//
// ⚠️ ESCUTA SÓ EM 127.0.0.1. O VPS da Hostinger está com ZERO regra de firewall
// (conferido em 29/09/2026), então porta aberta em 0.0.0.0 é porta aberta para a
// internet inteira. Quem fala com o mundo é o nginx, que já tem o certificado, e
// ele repassa para cá. Mudar isto sem arrumar o firewall antes expõe a tela do
// prompt e o endereço do cérebro.

import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(AQUI, ".env"), quiet: true });
// No servidor, a chave da Anthropic mora no .env daqui e mais nada é lido. Em
// desenvolvimento, LUCAS_ENV aponta para outro .env (o do CRM da Arcos, que já
// tem a chave) para não haver uma segunda cópia dela na máquina de ninguém.
if (process.env.LUCAS_ENV) dotenv.config({ path: process.env.LUCAS_ENV, quiet: true });
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Falta ANTHROPIC_API_KEY. No servidor ela vai no .env daqui; em desenvolvimento, aponte LUCAS_ENV.");
  process.exit(1);
}

const { pensar, pensarUmPasso, MODELO, invalidarPrompt, PASTA_DA_BASE, ARQUIVO_DO_PROMPT, documentosDaBase } =
  await import("./cerebro.mjs");

const PORTA = Number(process.env.LUCAS_PORTA || 4310);
const SENHA = (process.env.LUCAS_SENHA || "").trim();
const TOKEN = (process.env.LUCAS_TOKEN || "").trim();
const SEGREDO = process.env.LUCAS_SEGREDO || crypto.randomBytes(32).toString("hex");

for (const [nome, valor] of [["LUCAS_SENHA", SENHA], ["LUCAS_TOKEN", TOKEN]]) {
  if (!valor) { console.error(`Falta ${nome} no .env. Sem ela eu não subo.`); process.exit(1); }
}
if (!process.env.LUCAS_SEGREDO) {
  console.warn("[lucas] sem LUCAS_SEGREDO: os logins caem a cada reinício. Defina um no .env.");
}

// Comparação que não vaza o tamanho nem o conteúdo pelo tempo de resposta.
function igual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

const assinar = () => {
  const ate = Date.now() + 12 * 60 * 60 * 1000;
  return `${ate}.${crypto.createHmac("sha256", SEGREDO).update(String(ate)).digest("hex")}`;
};
function valeAAssinatura(bruto) {
  const [ate, assinatura] = String(bruto ?? "").split(".");
  if (!ate || !assinatura || Number(ate) < Date.now()) return false;
  return igual(assinatura, crypto.createHmac("sha256", SEGREDO).update(ate).digest("hex"));
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));  // 8 MB para caber áudio em base64
app.use(cookieParser());

// O MESMO TOKEN DO CARTEIRO, numa função, para a rota de transcrição não repetir
// a conferência. A do /api/pensar ficou inline de propósito: ela está em produção
// e eu não mexo nela para arrumar duplicação de oito linhas.
function tokenDoTrilhoConfere(req) {
  const veio = String(req.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (igual(veio, TOKEN)) return true;
  console.warn(`[lucas] recusei uma chamada: chegaram ${veio.length} caracteres, espero ${TOKEN.length}.`);
  return false;
}

// ---------------------------------------------------------------- transcrição

// O TRILHO MANDA O ÁUDIO E RECEBE O TEXTO, na ENTRADA da mensagem e não durante
// a rodada: a rodada tem 25 segundos para pensar e não sobra para esperar a
// OpenAI. O detalhe está em transcrever.mjs.
//
// Falhar aqui não quebra nada do lado de lá: devolve ok:false e o Trilho mantém
// o "[O cliente mandou um áudio]" de sempre.
app.post("/api/transcrever", async (req, res) => {
  if (!tokenDoTrilhoConfere(req)) return res.status(401).json({ erro: "token inválido" });

  const comeco = Date.now();
  const { transcrever } = await import("./transcrever.mjs");
  const r = await transcrever(req.body ?? {}, (process.env.OPENAI_API_KEY || "").trim());
  const s = ((Date.now() - comeco) / 1000).toFixed(1);

  // O LOG NUNCA TRAZ O QUE O CLIENTE DISSE. Só tamanho, tempo e desfecho: a
  // conversa já está guardada no Trilho, e repetir aqui seria espalhar dado de
  // cliente por mais um lugar sem precisar.
  if (r.ok) console.log(`[lucas] transcrevi ${(r.bytes / 1024).toFixed(0)} KB em ${s}s, ${r.texto.length} caracteres`);
  else console.warn(`[lucas] não transcrevi (${s}s): ${r.motivo}`);

  res.json(r.ok ? { ok: true, texto: r.texto } : { ok: false, motivo: r.motivo });
});

// ---------------------------------------------------------------- o carteiro

// O TRILHO NÃO GUARDA CONVERSA NENHUMA: ele manda o contexto e devolve o estado
// opaco que veio daqui. Estado aqui dentro é a conversa já montada do nosso
// jeito, com o prompt aplicado. Do lado de lá é só um objeto para repassar.
app.post("/api/pensar", async (req, res) => {
  // APARA OS DOIS LADOS. Token vive em campo de painel e em arquivo de texto, e
  // os dois colecionam espaço e quebra de linha sem ninguém ver. Sem aparar, um
  // espaço a mais responde 401 "token inválido", que manda procurar o erro no
  // lugar errado: a pessoa confere o valor, vê que está igual, e não está.
  const veio = String(req.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!igual(veio, TOKEN)) {
    // O QUE O LOG DIZ, E O QUE ELE NUNCA DIZ. Nunca o token, nem um pedaço dele.
    // Só o tamanho dos dois e se a impressão bate, que é o suficiente para saber
    // se o problema é valor diferente ou sujeira na ponta, sem vazar nada.
    console.warn(`[lucas] recusei uma chamada: chegaram ${veio.length} caracteres, espero ${TOKEN.length}.`);
    return res.status(401).json({ erro: "token inválido" });
  }

  const { contexto, definicoes, estado, resultados } = req.body ?? {};
  // ⚠️ A RECUSA DEIXA RASTRO, e a linha abaixo nasceu de três dias perdidos.
  //
  // Em 02/10/2026 o Trilho mandou a transcrição para ESTA rota, porque a
  // derivação do endereço do outro lado caiu no endereço do cérebro. O corpo
  // chegava com {url, mime, nome}, sem contexto, e esta linha devolvia 400 e
  // seguia calada. Do lado de cá parecia que ninguém tinha chamado, e eu procurei
  // o defeito em empacotamento, em prazo de publicação e em condição de código,
  // enquanto a chamada chegava e era recusada em silêncio.
  //
  // Recusa que não se vê é indistinguível de chamada que não aconteceu, e as duas
  // têm consertos opostos.
  if (!estado && !contexto?.turnos) {
    console.warn(`[lucas] recusei um pedido sem contexto. Campos que vieram: ${Object.keys(req.body ?? {}).join(", ") || "nenhum"}`);
    return res.status(400).json({ erro: "faltou o contexto" });
  }

  // O RELÓGIO, MEDIDO DE DENTRO.
  //
  // O prazo do Trilho é o menor entre 25 s e o que sobra do orçamento do turno,
  // e ele conta o turno INTEIRO: as idas e voltas do carteiro, a rede entre a
  // Vercel e aqui, e o pensar de cada volta. Este log mede só o pedaço que é
  // nosso. A diferença entre ele e o tempo que o Trilho observa é a rede, e é a
  // única forma de saber de quem é a culpa quando um turno estourar.
  const comeco = Date.now();
  const volta = (estado && typeof estado === "object" ? estado.voltas ?? 0 : 0) + 1;

  try {
    const r = await pensarUmPasso(
      { contexto, definicoes, estado, resultados },
      AbortSignal.timeout(Number(process.env.LUCAS_PRAZO_MS || 22_000)),
    );
    const s = ((Date.now() - comeco) / 1000).toFixed(1);
    const oQue = r.decisao ? `decidiu ${r.decisao.tipo}` : `pediu ${r.ferramentas.map((f) => f.nome).join(", ")}`;
    const devolvido = (JSON.stringify(r).length / 1024).toFixed(1);
    console.log(`[lucas] volta ${volta}: ${s}s, ${oQue}, devolvi ${devolvido} KB`);
    return res.json(r);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.error(`[lucas] volta ${volta} falhou depois de ${((Date.now() - comeco) / 1000).toFixed(1)}s: ${motivo}`);
    return res.status(503).json({ erro: "o cérebro não respondeu" });
  }
});

// ---------------------------------------------------------------- a tela

const protegida = (req, res, prox) =>
  valeAAssinatura(req.cookies?.lucas) ? prox() : res.status(401).json({ erro: "faça login" });

app.post("/api/entrar", (req, res) => {
  if (!igual(String(req.body?.senha ?? ""), SENHA)) {
    return res.status(401).json({ erro: "senha incorreta" });
  }
  res.cookie("lucas", assinar(), {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "producao", maxAge: 12 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

app.post("/api/sair", (req, res) => { res.clearCookie("lucas"); res.json({ ok: true }); });
app.get("/api/sessao", (req, res) => res.json({ dentro: valeAAssinatura(req.cookies?.lucas) }));

// O NOME DO ARQUIVO VEM DE FORA, então ele não decide caminho nenhum: fica só o
// nome, sem barra, sem ponto-ponto, e sempre .txt. Sem isto, "../../.env" viraria
// um arquivo gravado onde não devia.
function nomeSeguro(bruto) {
  const so = path.basename(String(bruto ?? "")).replace(/[/\\]/g, "").trim();
  if (!so || so.startsWith(".") || !/\.txt$/i.test(so)) return null;
  return so;
}

const tamanho = (arquivo) => { try { return fs.statSync(arquivo).size; } catch { return 0; } };

app.get("/api/config", protegida, (req, res) => {
  const prompt = fs.existsSync(ARQUIVO_DO_PROMPT) ? fs.readFileSync(ARQUIVO_DO_PROMPT, "utf8") : "";
  const base = documentosDaBase().map((nome) => ({ nome, bytes: tamanho(path.join(PASTA_DA_BASE, nome)) }));
  res.json({
    prompt,
    base,
    modelo: MODELO,
    total: prompt.length + base.reduce((s, d) => s + d.bytes, 0),
    // A IMPRESSÃO DO PROMPT QUE ESTÁ NO AR, para comparar com o arquivo local.
    //
    // O prompt vive em três lugares: o arquivo numerado que a gente guarda, o
    // dados/prompt.txt que o ensaio lê, e este aqui, que é o que atende cliente.
    // O ensaio já avisa quando os dois primeiros se desencontram. Faltava saber
    // se o terceiro ficou para trás -- e ficar para trás em silêncio foi o que
    // nos custou meia hora com o token em 30/09/2026.
    //
    // Doze caracteres de sha256. Comparar com `node impressao-do-prompt.mjs`.
    impressao: prompt ? crypto.createHash("sha256").update(prompt).digest("hex").slice(0, 12) : null,
  });
});

app.post("/api/prompt", protegida, (req, res) => {
  const texto = String(req.body?.prompt ?? "");
  if (!texto.trim()) return res.status(400).json({ erro: "o prompt não pode ficar vazio" });
  fs.writeFileSync(ARQUIVO_DO_PROMPT, texto, "utf8");
  invalidarPrompt();
  res.json({ ok: true, caracteres: texto.length });
});

app.post("/api/base", protegida, (req, res) => {
  const nome = nomeSeguro(req.body?.nome);
  const texto = String(req.body?.texto ?? "");
  if (!nome) return res.status(400).json({ erro: "só aceito arquivo .txt, com nome simples" });
  if (!texto.trim()) return res.status(400).json({ erro: "o arquivo veio vazio" });
  fs.mkdirSync(PASTA_DA_BASE, { recursive: true });
  fs.writeFileSync(path.join(PASTA_DA_BASE, nome), texto, "utf8");
  invalidarPrompt();
  res.json({ ok: true });
});

app.delete("/api/base/:nome", protegida, (req, res) => {
  const nome = nomeSeguro(req.params.nome);
  if (!nome) return res.status(400).json({ erro: "nome inválido" });
  try { fs.unlinkSync(path.join(PASTA_DA_BASE, nome)); } catch { /* já não estava lá */ }
  invalidarPrompt();
  res.json({ ok: true });
});

// O TESTE DA TELA NÃO É O ENSAIO COMPLETO, e a tela diz isso em voz alta: aqui
// não há a conferência da saída do Trilho (saida.ts), que é quem barra número
// que não veio de ferramenta. Serve para afinar TOM. Para saber o que seria
// barrado, rode `node ensaio.mjs` na máquina onde o repositório do Trilho está.
app.post("/api/testar", protegida, async (req, res) => {
  const mensagem = String(req.body?.mensagem ?? "").trim();
  if (!mensagem) return res.status(400).json({ erro: "diga a mensagem do cliente" });
  // ⚠️ SÓ FUNCIONA ONDE O REPOSITÓRIO DO TRILHO ESTÁ, porque as definições de
  // ferramenta são lidas de lá, e não copiadas: cópia envelhece e passa a
  // mentir. No servidor não há repositório, e aí este botão não serve. Não é
  // perda: em produção o ensaio bom é o da aba Configuração de IA do Trilho,
  // que roda as ferramentas de verdade E a conferência de saída.
  let criarFerramentasDeTeste;
  try {
    ({ criarFerramentasDeTeste } = await import("./ferramentas-de-teste.mjs"));
  } catch {
    return res.status(501).json({
      erro: "O teste de tom só roda na máquina de desenvolvimento, onde está o repositório do Trilho. Aqui, use o ensaio da aba Configuração de IA do Trilho: ele roda as ferramentas de verdade e a conferência de saída.",
    });
  }

  try {
    const ferramentas = criarFerramentasDeTeste();
    const agora = new Date();
    const contexto = {
      agora: {
        iso: agora.toISOString(),
        porExtenso: agora.toLocaleString("pt-BR", { timeZone: "America/Maceio", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        fuso: "America/Maceio",
      },
      numero: { apelido: "Constren" },
      contato: { nome: null, nomeDoPerfil: null, telefone: null, faltaNome: true },
      lead: null, anuncio: null, historico: [],
      turnos: [{ role: "user", content: mensagem }],
      ultimaDoCliente: mensagem,
    };
    const decisao = await pensar(contexto, ferramentas, AbortSignal.timeout(25_000));
    res.json({ decisao, chamadas: ferramentas.chamadas.map((c) => c.nome), uso: ferramentas.usoAcumulado() });
  } catch (e) {
    res.status(503).json({ erro: e instanceof Error ? e.message : String(e) });
  }
});

app.use(express.static(path.join(AQUI, "publico")));

app.listen(PORTA, "127.0.0.1", () => {
  console.log(`[lucas] no ar em http://127.0.0.1:${PORTA} (só local; o nginx é quem atende de fora)`);
  // A IMPRESSÃO DO TOKEN QUE ESTE PROCESSO TEM NA MEMÓRIA, e não a do arquivo.
  //
  // Nunca o token, nem um pedaço dele: só o tamanho e um resumo de doze
  // caracteres, do qual não se volta para o valor. Está aqui porque a impressão
  // tirada do .env pode não ser a que o serviço usa (aspas que o dotenv remove,
  // por exemplo), e foi assim que um 401 ficou meia hora sem explicação.
  const impressao = crypto.createHash("sha256").update(TOKEN).digest("hex").slice(0, 12);
  console.log(`[lucas] token em uso: ${TOKEN.length} caracteres, impressão ${impressao}`);
});
