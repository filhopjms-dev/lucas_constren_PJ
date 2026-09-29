// pm2 do serviço do Lucas.
//
//   pm2 start ecosystem.config.cjs
//   pm2 save
//
// UM PROCESSO SÓ, de propósito. Duas instâncias escreveriam o mesmo prompt e a
// mesma base ao mesmo tempo pela tela, e a última a gravar ganharia sem ninguém
// saber. O volume não pede mais de um: o trabalho pesado acontece na API da
// Anthropic, e aqui só se espera a resposta.
//
// ⚠️ Este serviço divide a máquina com o CRM da Arcos, que é a operação que não
// pode parar. `max_memory_restart` existe para um vazamento aqui não levar o CRM
// junto: o pm2 reinicia o Lucas e o resto da máquina nem percebe.

module.exports = {
  apps: [{
    name: "lucas",
    script: "servidor.mjs",
    cwd: "/root/lucas",
    instances: 1,
    exec_mode: "fork",
    max_memory_restart: "400M",
    env: { NODE_ENV: "producao" },
    // O .env é lido pelo próprio servidor, com dotenv. Nada de segredo aqui:
    // este arquivo vai para o repositório.
    error_file: "/root/.pm2/logs/lucas-erro.log",
    out_file: "/root/.pm2/logs/lucas-saida.log",
    time: true,
  }],
};
