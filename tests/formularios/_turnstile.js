// Troca o script da Cloudflare por um falso: o widget "resolve" na hora com um código de teste.
module.exports = (ctx) => ctx.route(/challenges\.cloudflare\.com/, (r) => r.fulfill({ contentType: 'application/javascript', body:
  "var o;window.turnstile={render:function(e,x){o=x;setTimeout(function(){o.callback('token-teste')},5);return 'w1'},reset:function(){setTimeout(function(){o.callback('token-teste')},5)}};" }));
