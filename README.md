# finance app 💰

App de controle financeiro pessoal com assistente IA integrado.

## Deploy no Vercel (5 minutos)

### 1. Suba para o GitHub
1. Crie um repositório novo em [github.com](https://github.com/new)
2. Faça upload desta pasta (arraste os arquivos ou use git):
```bash
git init
git add .
git commit -m "finance app"
git remote add origin https://github.com/SEU_USUARIO/finance-app.git
git push -u origin main
```

### 2. Conecte ao Vercel
1. Acesse [vercel.com](https://vercel.com) e faça login com GitHub
2. Clique em **"Add New Project"**
3. Selecione o repositório `finance-app`
4. Clique em **Deploy** — as configurações já estão prontas!

### 3. Pronto
O Vercel vai gerar um link tipo `finance-app-seu-usuario.vercel.app` 🎉

---

## Rodar localmente
```bash
npm install
npm run dev
```

## Funcionalidades
- 📊 Dashboard com saldo, gráficos e categorias
- ↑ Receitas com filtros por mês e categoria  
- ↓ Despesas com filtros por mês e categoria
- ✦ Assistente IA — registra lançamentos por linguagem natural
- 🎤 Gravação de áudio (requer permissão de microfone)
- 💾 Dados salvos localmente no navegador
