// Configuração do checkout. Nada aqui é segredo: são só endereços e a chave PÚBLICA do Mercado Pago.
// Enquanto apiBase estiver vazio, o checkout roda em MODO DEMONSTRAÇÃO (não cria pedido nem cobra nada).
window.FG_CONFIG = {
  apiBase: '',          // ex.: 'https://fotogoioere-api.SEU-USUARIO.workers.dev'
  mpPublicKey: '',      // chave pública do Mercado Pago (começa com APP_USR- ou TEST-)
  whatsapp: '5544999060030'
};
