# Orientações para agentes

## Documentação técnica dos fluxos

- Antes de implementar, corrigir ou refatorar funcionalidades, leia [docs/FLUXOS_TECNICOS.md](docs/FLUXOS_TECNICOS.md) e use os fluxos documentados como referência para entender o comportamento atual e os efeitos da alteração no frontend, na API e no serviço WhatsApp.
- Confira os arquivos de código relevantes. Em caso de divergência, o código é a fonte de verdade; corrija a documentação para refletir a implementação, sem reproduzir informações desatualizadas.
- Sempre que uma alteração afetar funcionalidades, fluxos, endpoints, payloads, validações, permissões, retornos, tratamento de erros, persistência, integrações, polling ou processos automáticos, atualize `docs/FLUXOS_TECNICOS.md` na mesma entrega. Isso inclui adicionar funcionalidades novas e remover ou revisar fluxos que deixaram de existir.
- Documente os caminhos de sucesso, falha, cancelamento e efeitos parciais aplicáveis, seguindo o nível de detalhe já existente. Atualize também o inventário, as referências ao código e a data do levantamento quando necessário.
- Antes de concluir qualquer alteração, confira se ela exige atualização dos fluxos e faça a atualização necessária. Para mudanças sem impacto no comportamento, não invente alterações no documento.

Estas orientações se aplicam a todo o repositório, incluindo `apps/web`, `apps/api` e `apps/whatsapp`.
