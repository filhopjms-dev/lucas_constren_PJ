// O LIVRO DE CONSUMO: uma linha por CHAMADA à Anthropic, só de acrescentar.
//
// POR QUE ISTO EXISTE, e vale ler antes de mexer.
//
// O dinheiro sai da chave do Paulo, na organização dele, a partir desta
// máquina. Mas até 28/10/2026 o único registro de quanto cada rodada custou
// morava no banco do Trilho, do outro lado, e esse banco tem um botão de
// apagar conversa. Em 22/10 uma conversa foi apagada e levou junto nove
// rodadas e o custo delas: `ia_rodadas` tinha ON DELETE CASCADE para
// `wa_conversas`. O que some assim não deixa buraco, porque some a linha
// inteira, e ninguém percebe por nenhum relatório.
//
// Quem paga precisa ter o próprio registro. Este arquivo é ele.
//
// ⚠️ NÃO GRAVA TEXTO NENHUM. Nem prompt, nem base, nem a fala do cliente, nem
// a resposta do Lucas. Só número, mais a marca da conversa, que é um resumo
// irreversível do telefone (ver abaixo). Isto é regra de produto, não zelo: o
// prompt é propriedade intelectual e nunca sai desta máquina, e o telefone do
// cliente é dado da Constren, que passa por aqui mas não mora aqui.
//
// É SÓ DE ACRESCENTAR, uma linha JSON por vez, e de propósito: uma queda no
// meio de uma escrita estraga no máximo a última linha, e todas as anteriores
// continuam legíveis. Banco com índice daria consulta melhor e recuperação
// pior, e o que esta peça precisa é sobreviver, não ser rápida.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PASTA = path.join(AQUI, "dados");
export const ARQUIVO = path.join(PASTA, "consumo.jsonl");

// A MARCA DA CONVERSA, e por que não é o telefone.
//
// Para dizer "esta conversa custou tanto" é preciso agrupar as chamadas de uma
// mesma pessoa, e o telefone é a única coisa estável que o contexto traz. Mas
// guardar telefone de cliente da Constren num arquivo nosso é guardar o que
// não é nosso, e sem necessidade: para AGRUPAR basta que pessoas diferentes
// deem marcas diferentes, e isso um resumo resolve.
//
// Então vai o sha256 dos dígitos, cortado em 12 caracteres. Agrupa igual e não
// volta para o número. Quem quiser cruzar com uma conversa específica calcula o
// resumo do telefone que já tem em mãos e procura por ele.
const marcaDaConversa = (telefone) => {
  const digitos = String(telefone ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  return crypto.createHash("sha256").update(digitos).digest("hex").slice(0, 12);
};

// ⚠️ ESTA FUNÇÃO NUNCA PODE DERRUBAR O ATENDIMENTO.
//
// Ela roda no caminho da resposta ao cliente. Disco cheio, permissão errada ou
// um campo que a API mudou de nome não podem virar erro que sobe: o pior
// resultado aceitável é perder a linha do consumo, e o inaceitável é o cliente
// ficar sem resposta porque a contabilidade falhou. Por isso o try/catch
// engole tudo e só avisa no log.
export function anotar({ resposta, origem, volta, contexto, comecouEm }) {
  try {
    const u = resposta?.usage ?? {};
    const linha = {
      quando: new Date().toISOString(),
      // "carteiro" é atendimento de verdade, vindo do Trilho; "ensaio" é teste
      // rodado aqui da máquina. Separar na ORIGEM, e não depois, porque em
      // 28/10 passamos horas tentando descobrir, de fora, quais rodadas do log
      // eram teste nosso e quais eram cliente.
      origem,
      conversa: marcaDaConversa(contexto?.contato?.telefone),
      volta,
      modelo: resposta?.model ?? null,
      entrada: u.input_tokens ?? 0,
      saida: u.output_tokens ?? 0,
      cache_lido: u.cache_read_input_tokens ?? 0,
      cache_escrito: u.cache_creation_input_tokens ?? 0,
      parada: resposta?.stop_reason ?? null,
      seg: comecouEm ? Number(((Date.now() - comecouEm) / 1000).toFixed(1)) : null,
    };
    fs.mkdirSync(PASTA, { recursive: true });
    fs.appendFileSync(ARQUIVO, JSON.stringify(linha) + "\n", "utf8");
  } catch (e) {
    console.error(`[lucas] consumo não anotado: ${e.message}`);
  }
}
