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

const { pensar, MODELO, invalidarPrompt, PASTA_DA_BASE, ARQUIVO_DO_PROMPT, documentosDaBase } =
  await import("./cerebro.mjs");

const PORTA = Number(process.env.LUCAS_PORTA || 4310);
const SENHA = process.env.LUCAS_SENHA || "";
const TOKEN = process.env.LUCAS_TOKEN || "";
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
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// ---------------------------------------------------------------- o carteiro

// O TRILHO NÃO GUARDA CONVERSA NENHUMA: ele manda o contexto e devolve o estado
// opaco que veio daqui. Estado aqui dentro é a conversa já montada do nosso
// jeito, com o prompt aplicado. Do lado de lá é só um objeto para repassar.
app.post("/api/pensar", async (req, res) => {
  const veio = String(req.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!igual(veio, TOKEN)) return res.status(401).json({ erro: "token inválido" });

  const { contexto, definicoes, estado, resultados } = req.body ?? {};
  if (!contexto?.turnos) return res.status(400).json({ erro: "faltou o contexto" });

  try {
    const r = await pensar(
      contexto,
      { definicoes: definicoes ?? [], estado, resultados },
      AbortSignal.timeout(Number(process.env.LUCAS_PRAZO_MS || 22_000)),
    );
    return res.json(r);
  } catch (e) {
    console.error(`[lucas] pensar falhou: ${e instanceof Error ? e.message : e}`);
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
  try {
    const { criarFerramentasDeTeste } = await import("./ferramentas-de-teste.mjs");
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
});
