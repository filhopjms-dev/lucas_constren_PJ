// O RESUMO POR METRAGEM, exercitado contra um banco de mentira.
//
// Por que existe (07/10/2026): um cliente pediu ao Lucas "os valores atuais de todas as
// metragens do Portillo" e ele TRANSFERIU. Não foi regra frouxa: `consultar_unidades`
// devolve só as mais baratas, e no Portillo as mais baratas são todas de 68 m². A
// listagem de empreendimentos dá apenas a FAIXA ("de 68,35 m² a 99,48 m²"), de onde não
// se deduz que existem 83 e 96 no meio. E a outra porta estava fechada junto:
// `conhecidos.areas` só recebia as pontas, então um palpite CERTO sobre 83 m² seria
// barrado pela conferência de saída do mesmo jeito. Sem como responder e sem poder
// arriscar, só sobrava transferir.
//
// O conserto está no Trilho (ramo `resumo-por-metragem`), e esta prova mora AQUI por dois
// motivos: o `jiti` é dependência declarada deste repositório (no Trilho ele só aparece de
// carona, e sumiria num `npm update`), e o ensaio já importa o código do Trilho por este
// mesmo caminho.
//
// O que importa não é o caso que funciona: são os três em que o resumo NÃO deve aparecer,
// e o da tabela vencida, em que ele aparece SEM valor nenhum.
//
//   node prova-resumo-por-metragem.mjs
import path from "node:path";
import { createJiti } from "jiti";

const TRILHO = process.env.LUCAS_TRILHO || "C:/Users/paulo/trilho";
const jiti = createJiti(import.meta.url, { alias: { "@/": path.join(TRILHO, "src") + "/" } });
const { criarFerramentas } = await jiti.import(path.join(TRILHO, "src/lib/ia/ferramentas.ts"));

// O Supabase de mentira: a cadeia inteira devolve a si mesma, e o `await` entrega a tabela
// pedida. Os filtros são ignorados de propósito -- as fixtures já vêm com o que a consulta
// escolheria, e fingir o filtro aqui seria testar a minha imitação do banco, não a ferramenta.
function banco(dados) {
  const consulta = (tabela) => {
    const api = {
      select: () => api, eq: () => api, in: () => api, order: () => api,
      then: (ok) => ok({ data: dados[tabela] ?? [], error: null }),
    };
    return api;
  };
  return { from: consulta };
}

const emp = (id, nome, extras = {}) => ({
  id, nome, bairro: "Atalaia", entrega_prevista: "2027-11-30", habite_se_em: null,
  fator_reajuste: 1.01, tabela_valida_ate: "2026-12-31", fluxo_padrao: null, mensais_ate: null, ...extras,
});

let n = 0;
const unidade = (empId, area, valor) => ({
  id: `u${++n}`, numero: String(100 + n), andar: 1, posicao: "Leste", area, valor_total: valor,
  vaga_numero: String(n), vaga_pavimento: "Playground", condicoes: null, extras: null, planta_id: null,
  torres: { nome: "Única", empreendimento_id: empId },
});

// O Portillo como ele é: as mais baratas são TODAS de 68, que é a origem do problema.
// Os valores são os da tabela, e o fator de 1,01 os leva aos preços de hoje.
const PORTILLO = [
  ...Array.from({ length: 4 }, () => unidade("p1", 68.35, 613900)),
  ...Array.from({ length: 3 }, () => unidade("p1", 83, 777900)),
  ...Array.from({ length: 2 }, () => unidade("p1", 96, 959900)),
  unidade("p1", 99.48, 886900),
];

async function rodar(dados, entrada) {
  const f = criarFerramentas(banco(dados), { preCadastroId: null, ensaio: true });
  const resposta = await f.executar("consultar_unidades", entrada);
  return { resposta, conhecidos: f.conhecidos };
}

const casos = [];
const caso = (nome, fn) => casos.push({ nome, fn });

caso("um empreendimento, lista cortada: o resumo sai com as quatro metragens", async () => {
  const { resposta, conhecidos } = await rodar({ empreendimentos: [emp("p1", "Portillo Residence")], unidades: PORTILLO }, { empreendimento: "Portillo" });
  const linha = resposta.split("\n").find((l) => l.startsWith("Metragens disponíveis"));
  if (!linha) return { ok: false, porque: "não saiu resumo nenhum", resposta };
  const faltam = ["620.039", "785.679", "969.499", "895.769"].filter((v) => !linha.includes(v));
  if (faltam.length) return { ok: false, porque: `faltou no resumo: ${faltam.join(", ")}`, resposta: linha };
  // A metade que, esquecida, faria o conserto PIORAR o problema: ele saberia a resposta e
  // seguiria barrado ao dizê-la.
  const areas = [...conhecidos.areas], valores = [...conhecidos.valores];
  if (!areas.includes(83) || !areas.includes(96)) return { ok: false, porque: `conhecidos.areas sem 83/96: ${areas}`, resposta: linha };
  if (!valores.includes(785679) || !valores.includes(969499)) return { ok: false, porque: `conhecidos.valores sem os novos: ${valores}`, resposta: linha };
  // Quantas restam é dado para ESCOLHER, nunca para informar: nada de quantidades.
  if ([...conhecidos.quantidades].length) return { ok: false, porque: `quantidades anotadas (não devia): ${[...conhecidos.quantidades]}`, resposta: linha };
  return { ok: true, resposta: linha };
});

caso("filtro de metragem: uma metragem só, nada a resumir", async () => {
  const { resposta } = await rodar({ empreendimentos: [emp("p1", "Portillo Residence")], unidades: PORTILLO },
    { empreendimento: "Portillo", area_minima: 80, area_maxima: 90 });
  const tem = resposta.includes("Metragens disponíveis");
  return { ok: !tem, porque: tem ? "saiu resumo para uma metragem só" : "", resposta: resposta.split("\n")[0] };
});

caso("sem nomear empreendimento: não vira catálogo dos três", async () => {
  const dados = {
    empreendimentos: [emp("p1", "Portillo Residence"), emp("r1", "Riviera Residence")],
    unidades: [...PORTILLO, ...Array.from({ length: 5 }, () => unidade("r1", 105, 915900))],
  };
  const { resposta } = await rodar(dados, {});
  const tem = resposta.includes("Metragens disponíveis");
  return { ok: !tem, porque: tem ? "saiu resumo com mais de um empreendimento" : "", resposta: resposta.split("\n")[0] };
});

caso("lista não cortada: as linhas já mostram tudo", async () => {
  const poucas = [unidade("p1", 68.35, 613900), unidade("p1", 83, 777900)];
  const { resposta } = await rodar({ empreendimentos: [emp("p1", "Portillo Residence")], unidades: poucas }, { empreendimento: "Portillo" });
  const tem = resposta.includes("Metragens disponíveis");
  return { ok: !tem, porque: tem ? "saiu resumo sem a lista ter sido cortada" : "", resposta: resposta.split("\n")[0] };
});

caso("tabela vencida: resumo sai, valor NÃO sai e nada é anotado", async () => {
  const dados = { empreendimentos: [emp("p1", "Portillo Residence", { tabela_valida_ate: "2020-01-01" })], unidades: PORTILLO };
  const { resposta, conhecidos } = await rodar(dados, { empreendimento: "Portillo" });
  const linha = resposta.split("\n").find((l) => l.startsWith("Metragens disponíveis"));
  if (!linha) return { ok: false, porque: "não saiu resumo", resposta };
  if (/R\$/.test(linha)) return { ok: false, porque: "vazou preço de tabela vencida", resposta: linha };
  if ([...conhecidos.valores].length) return { ok: false, porque: `valores anotados com tabela vencida: ${[...conhecidos.valores]}`, resposta: linha };
  return { ok: true, resposta: linha };
});

console.log("");
let falhou = false;
for (const c of casos) {
  const r = await c.fn();
  if (!r.ok) falhou = true;
  console.log(`${r.ok ? "✓" : "✗"} ${c.nome}`);
  if (r.resposta) console.log(`    ${r.resposta}`);
  if (!r.ok) console.log(`    PORQUE: ${r.porque}`);
}
console.log("");
console.log(falhou ? "✗ ALGUMA COISA NÃO FOI COMO DEVIA" : "✓ O resumo sai quando deve, não sai quando não deve, e os números ficam conhecidos.");
console.log("");
process.exit(falhou ? 1 : 0);
