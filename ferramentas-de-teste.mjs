// AS FERRAMENTAS DO TRILHO, SIMULADAS AQUI, COM DADO DE VERDADE.
//
// As definições NÃO são cópia: são lidas do código do Trilho, para o modelo ver
// exatamente a mesma descrição que vai ver em produção. Descrição de ferramenta
// é metade do prompt, e uma cópia envelhecida daria um ensaio que não ensaia.
//
// As respostas vêm de `capturas/ensaio-ferramentas.json`, capturado em 29/09/2026
// pelo ensaio do Trilho, em produção, com o espelho de vendas real. Junto delas
// vêm os `conhecidos`, que é contra o que a conferência da saída confere.
//
// As ferramentas que ESCREVEM devolvem aqui a mesma frase que devolvem lá, e não
// gravam nada: aqui não há banco.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const TRILHO = process.env.LUCAS_TRILHO || "C:/Users/paulo/trilho";

const jiti = createJiti(import.meta.url, { alias: { "@/": path.join(TRILHO, "src") + "/" } });

// `criarFerramentas` não toca no banco ao ser construída, então o `null` basta
// para chegar até as definições.
const { criarFerramentas } = await jiti.import(path.join(TRILHO, "src/lib/ia/ferramentas.ts"));
export const DEFINICOES = criarFerramentas(null, { preCadastroId: null, ensaio: true }).definicoes;

export const { conferirSaida } = await jiti.import(path.join(TRILHO, "src/lib/ia/saida.ts"));

const capturas = JSON.parse(fs.readFileSync(path.join(AQUI, "capturas", "ensaio-ferramentas.json"), "utf8"));

const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function acharCaptura(nome, entrada) {
  const emp = semAcento(entrada?.empreendimento);
  return capturas.find((c) => {
    if (c.ferramenta !== nome) return false;
    if (nome === "consultar_empreendimentos") return true;
    if (!emp) return false;
    const dela = semAcento(c.entrada?.empreendimento);
    if (!dela.includes(emp) && !emp.includes(dela)) return false;
    if (nome === "consultar_condicoes") return String(c.entrada?.numero) === String(entrada?.numero ?? "");
    return true;
  });
}

export function criarFerramentasDeTeste() {
  const conhecidos = { valores: new Set(), areas: new Set(), quantidades: new Set(), entregas: new Set(), anos: new Set() };
  const chamadas = [];
  let uso = null;

  const anotarConhecidos = (c) => {
    for (const v of c?.valores ?? []) conhecidos.valores.add(v);
    for (const a of c?.areas ?? []) conhecidos.areas.add(a);
    for (const q of c?.quantidades ?? []) conhecidos.quantidades.add(q);
    for (const e of c?.entregas ?? []) { conhecidos.entregas.add(e); const ano = Number(String(e).slice(-4)); if (ano) conhecidos.anos.add(ano); }
  };

  async function executar(nome, entrada) {
    let resposta;
    if (nome === "gravar_dados_do_cliente") {
      const feito = ["nome", "email", "empreendimento"].filter((k) => entrada?.[k]);
      resposta = feito.length
        ? `Gravei ${feito.join(", ")}. Não comente com o cliente que registrou nada. [ENSAIO: nada foi gravado de verdade]`
        : "Não veio nada para gravar. Informe nome, e-mail ou empreendimento.";
    } else if (nome === "agendar_visita") {
      resposta = entrada?.quando
        ? "Agendei. Diga ao cliente que a equipe confirma o horário. [ENSAIO: nada foi gravado de verdade]"
        : "Para agendar preciso do título e da data e hora combinadas.";
    } else if (nome === "mover_para_visita") {
      resposta = "Movi o lead para Visita. Não comente isso com o cliente. [ENSAIO: nada foi gravado de verdade]";
    } else {
      const c = acharCaptura(nome, entrada);
      if (c) { resposta = c.resposta; anotarConhecidos(c.conhecidos); }
      else if (nome === "consultar_unidades") resposta = "Não há unidade disponível com esses critérios. Não ofereça outra por conta própria: pergunte se o cliente aceita outro critério, ou transfira para a equipe.";
      else if (nome === "consultar_condicoes") resposta = "Não achei essa unidade entre as disponíveis. Não invente entrada nem parcelas: diga que a equipe envia a simulação e transfira.";
      else resposta = `A ferramenta "${nome}" não existe.`;
    }
    chamadas.push({ nome, entrada, resposta });
    return resposta;
  }

  return {
    definicoes: DEFINICOES,
    conhecidos,
    chamadas,
    executar,
    anotarUso(u) {
      uso = {
        modelo: u.modelo || uso?.modelo || "",
        tokensEntrada: (uso?.tokensEntrada ?? 0) + (u.input_tokens ?? 0),
        tokensSaida: (uso?.tokensSaida ?? 0) + (u.output_tokens ?? 0),
        tokensDeCacheLidos: (uso?.tokensDeCacheLidos ?? 0) + (u.cache_read_input_tokens ?? 0),
        tokensDeCacheGravados: (uso?.tokensDeCacheGravados ?? 0) + (u.cache_creation_input_tokens ?? 0),
      };
    },
    usoAcumulado: () => uso,
  };
}
