#!/bin/sh
# RECARREGA O NGINX DEPOIS DE QUALQUER CERTIFICADO RENOVAR.
#
# Vai em /etc/letsencrypt/renewal-hooks/deploy/, e o certbot roda tudo que está
# nessa pasta depois de uma renovação bem-sucedida -- de qualquer domínio, agora
# e no futuro.
#
# POR QUE ELE EXISTE (30/09/2026):
#
# O nginx lê o certificado do disco quando sobe e guarda em memória. Arquivo novo
# no disco não muda nada até alguém mandar recarregar. O certificado do CRM foi
# emitido com o plugin do nginx, que recarrega sozinho; o do Lucas foi emitido por
# webroot, que não recarrega nada.
#
# Na prática o Lucas vinha de carona: quando o certificado do CRM renovasse, o
# nginx era recarregado e o do Lucas entrava junto. Funcionava por acidente, e o
# acidente tinha prazo -- bastava o CRM mudar de jeito de renovar, ou sair deste
# servidor, para o certificado do Lucas vencer em silêncio.
#
# E vencer em silêncio ficou caro. Desde a revisão do Jânio, o Trilho só liga o
# robô se o endereço for https: certificado vencido não é mais aviso feio no
# navegador, é o Lucas parando de responder sem erro nenhum, com toda conversa
# indo para a equipe e ninguém sabendo por quê.
#
# O -t antes do reload é deliberado: nunca recarregar uma configuração quebrada.
# Se o teste falhar, o script para aqui e o nginx segue no ar com a configuração
# antiga, que é o desfecho menos ruim.

set -e

echo "[renovacao] certificado renovado, conferindo a configuracao do nginx"
nginx -t
systemctl reload nginx
echo "[renovacao] nginx recarregado"
